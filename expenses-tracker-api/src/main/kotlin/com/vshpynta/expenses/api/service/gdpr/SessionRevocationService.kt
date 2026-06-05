package com.vshpynta.expenses.api.service.gdpr

import com.github.benmanes.caffeine.cache.Cache
import com.github.benmanes.caffeine.cache.Caffeine
import com.github.benmanes.caffeine.cache.Expiry
import com.vshpynta.expenses.api.config.gdpr.GdprProperties
import com.vshpynta.expenses.api.model.gdpr.RevokedBy
import com.vshpynta.expenses.api.repository.gdpr.SessionRevocationRepository
import com.vshpynta.expenses.api.service.gdpr.SessionRevocationService.Companion.MAX_TTL_NANOS
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.concurrent.TimeUnit

/**
 * Per-user "any token issued before this instant is no longer valid"
 * lookup. Read on the hot path of every authenticated request by
 * [com.vshpynta.expenses.api.config.gdpr.SessionRevocationFilter];
 * written when a user clicks "sign me out everywhere", when an admin
 * forces a logout, or as part of the Art. 17 erasure cascade.
 *
 * **Why not just trust Keycloak.** Keycloak's `logout` admin call
 * terminates server-side sessions and invalidates refresh tokens, but
 * already-issued access tokens remain cryptographically valid until
 * they expire (5 minutes by default). For a leaked-token or
 * stolen-tab scenario that gap is the entire attack window. This
 * service closes the gap by rejecting offending JWTs at the resource
 * server before any handler runs.
 *
 * **Cache model — authoritative positive cache.** Each pod holds the
 * *complete* set of still-relevant revocation rows in memory, loaded
 * by [loadSnapshot] at startup and kept in sync via PostgreSQL
 * LISTEN/NOTIFY (see
 * [com.vshpynta.expenses.api.config.gdpr.SessionRevocationListener]).
 * Consequence: a cache miss means **"definitively not revoked"** —
 * the hot path ([findRevokedBeforeIat]) never touches the DB.
 *
 *   * **Per-entry TTL** is derived from each row's `expires_at`, so
 *     entries vanish from memory exactly when they become harmless
 *     (every token they would have rejected has expired on its own).
 *   * **`maximumSize = revocation.cacheMaxEntries`** is a defence
 *     against pathological table growth, not a normal eviction path.
 *   * **Startup snapshot** is loaded synchronously inside the
 *     listener's `start()`, blocking the bean lifecycle (and
 *     therefore readiness) until the cache is populated. When the
 *     listener is disabled by configuration, `start()` skips the
 *     LISTEN subscribe but still loads the snapshot the same way —
 *     the cache is mandatory for the filter to work in any mode.
 *   * **Cross-pod fan-out**: every write broadcasts
 *     `pg_notify(channel, userId)`. Peer pods'
 *     [refreshFromDb] re-reads the row and puts-or-removes the
 *     cache entry, converging in single-digit milliseconds.
 *   * **Reconnect reconciliation**: after every LISTEN reconnect the
 *     listener calls [loadSnapshot] again, which is the backstop
 *     against NOTIFYs missed while disconnected.
 */
@Service
class SessionRevocationService(
    private val repository: SessionRevocationRepository,
    private val properties: GdprProperties,
    private val clock: Clock,
) {

    /**
     * Cache value carries both the cutoff (consumed by the filter) and
     * `expires_at` (consumed by the per-entry [Expiry] callback).
     */
    private data class Cached(val revokedBeforeIat: Instant, val expiresAt: Instant)

    private val cache: Cache<String, Cached> = Caffeine.newBuilder()
        .maximumSize(properties.revocation.cacheMaxEntries)
        .expireAfter(object : Expiry<String, Cached> {
            override fun expireAfterCreate(key: String, value: Cached, currentTime: Long): Long =
                residualNanos(value)

            override fun expireAfterUpdate(
                key: String, value: Cached, currentTime: Long, currentDuration: Long,
            ): Long = residualNanos(value)

            override fun expireAfterRead(
                key: String, value: Cached, currentTime: Long, currentDuration: Long,
            ): Long = currentDuration
        })
        .build()

    /**
     * Returns the `revoked_before_iat` for [userId] if a revocation is
     * recorded, or `null` if the user has no current revocation. The
     * answer is always served from the in-memory snapshot — see the
     * class KDoc for why a cache miss is authoritative. The filter
     * compares the returned instant against the JWT's `iat` claim
     * using strict `<` (a token issued *at* the revocation instant
     * is still considered older and rejected, because the cutoff is
     * set to `now() + 1s` — see [revokeAllSessions]).
     */
    fun findRevokedBeforeIat(userId: String): Instant? =
        cache.getIfPresent(userId)?.revokedBeforeIat

    /**
     * Marks every JWT issued for [userId] up to the present moment as
     * revoked. Effects on the next request:
     *
     *   * any access token currently in the user's hands → 401 from
     *     [com.vshpynta.expenses.api.config.gdpr.SessionRevocationFilter]
     *     with `{"error":"session_revoked"}`;
     *   * any refresh token → unaffected by this row, but in practice
     *     killed in tandem by [KeycloakAdminClient.logoutAllSessions]
     *     which the controllers call right after this.
     *
     * **The cutoff is `now + 1s`, not `now`**: if a token was issued
     * at exactly the same second as the revocation (clock-truncated
     * to 1 s by `iat`), strict `<` would accept it. Adding 1 s makes
     * the bound inclusive in practice.
     *
     * After the write commits, populates the local cache directly
     * (so the writing pod converges in zero requests) and broadcasts
     * `pg_notify(channel, userId)` so every peer pod subscribed via
     * [com.vshpynta.expenses.api.config.gdpr.SessionRevocationListener]
     * refreshes its cache too. If the notify call fails the write
     * still stands — peer pods converge on their next LISTEN
     * reconnect, which always triggers a full snapshot reload.
     *
     * Returns the row count from the UPSERT for observability — `0`
     * means a concurrent writer beat us with a fresher revocation,
     * which is fine (the fresher one wins). **When we lose the race
     * we deliberately skip both `cache.put` and `broadcastInvalidation`**:
     * our values are known-stale, so touching the local cache would
     * downgrade the entry the winning thread just put on this pod,
     * and the winning pod has already broadcast its own NOTIFY.
     */
    suspend fun revokeAllSessions(userId: String, revokedBy: RevokedBy): Int {
        val revokedAt = clock.instant()
        val revokedBeforeIat = revokedAt.plusSeconds(SECONDS_BEYOND_NOW)
        val expiresAt = revokedAt.plus(properties.revocation.expiresGrace)
        val rows = repository.upsert(
            userId = userId,
            revokedBeforeIat = revokedBeforeIat,
            revokedAt = revokedAt,
            revokedBy = revokedBy,
            expiresAt = expiresAt,
        )
        if (rows > 0) {
            // Populate the local cache immediately so the next request on
            // this pod sees the new cutoff without re-reading.
            cache.put(userId, Cached(revokedBeforeIat, expiresAt))
            // Fan out to peer pods. Best-effort: if the broadcast fails,
            // peers converge on their next listener reconnect (full snapshot reload).
            broadcastInvalidation(userId)
        }
        logger.info(
            "Revoked all sessions for user {} (by {}); cutoff={}, expiresAt={}, rowsAffected={}",
            userId, revokedBy, revokedBeforeIat, expiresAt, rows
        )
        return rows
    }

    /**
     * Rebuilds the cache from a fresh DB snapshot. Called by the
     * listener at startup (synchronously, blocking readiness) and
     * after every LISTEN reconnect (reconciliation backstop for any
     * NOTIFYs that arrived during the disconnect window).
     *
     * **Last-write-wins guard.** PostgreSQL serves the SELECT from a
     * snapshot taken at statement start. If a concurrent
     * [revokeAllSessions] commits a fresher row *after* the snapshot
     * was taken but *before* this method iterates over the matching
     * user, a naive `cache.put` would clobber the freshly-written
     * cache entry with the stale row from the snapshot. We therefore
     * merge by `revoked_before_iat` — which is monotonic per user
     * (the UPSERT only accepts strictly-newer `revoked_at`) — and
     * keep whichever value has the later cutoff.
     *
     * **Why we don't drop "stale" entries.** A naïve implementation
     * would also remove cache entries that aren't in the snapshot
     * (to handle rows DELETEd while we were disconnected). We
     * deliberately don't, for two reasons:
     *
     *   1. **It would race with concurrent local writes**, same as
     *      the merge case above but worse: silent eviction instead
     *      of silent down-grade.
     *   2. **It isn't needed.** The only way a row legitimately
     *      disappears is via the scheduled prune
     *      ([com.vshpynta.expenses.api.service.gdpr.SessionRevocationPruneJob]),
     *      which deletes rows past `expires_at + pruneSafetyMargin`.
     *      The matching cache entry's per-entry TTL was set to
     *      `expires_at - put_time` (see [residualNanos]), so
     *      Caffeine has already evicted it before prune fires.
     *      Manual DBA deletes are outside the consistency model.
     */
    suspend fun loadSnapshot() {
        val now = clock.instant()
        var count = 0
        repository.findAllNotExpired(now).collect { row ->
            val incoming = Cached(row.revokedBeforeIat, row.expiresAt)
            cache.asMap().merge(row.userId, incoming) { existing, candidate ->
                if (existing.revokedBeforeIat.isAfter(candidate.revokedBeforeIat)) existing
                else candidate
            }
            count++
        }
        logger.info("Loaded {} session revocation rows into cache", count)
    }

    /**
     * Re-reads the row for [userId] from the DB and updates the local
     * cache accordingly: present → put, absent → remove. Called by
     * the listener whenever a `pg_notify` arrives. Best-effort —
     * exceptions are propagated to the caller for logging.
     *
     * **Last-write-wins guard on the present-row branch.** PostgreSQL
     * serves [SessionRevocationRepository.findByUserId] from a
     * snapshot taken at statement start. If a concurrent same-pod
     * [revokeAllSessions] commits a fresher row *after* the SELECT's
     * snapshot but *before* we [cache.put], a naive put would clobber
     * the freshly-written entry with the older row. We merge by
     * `revoked_before_iat` (monotonic per user by construction of the
     * UPSERT) so the cache always reflects whichever value has the
     * later cutoff. The absent-row branch needs no such guard because
     * the prune job never sends NOTIFYs — so a row that was just
     * UPSERTed cannot vanish underneath us.
     */
    suspend fun refreshFromDb(userId: String) {
        val row = repository.findByUserId(userId)
        if (row == null) {
            cache.invalidate(userId)
        } else {
            val incoming = Cached(row.revokedBeforeIat, row.expiresAt)
            cache.asMap().merge(userId, incoming) { existing, candidate ->
                if (existing.revokedBeforeIat.isAfter(candidate.revokedBeforeIat)) existing
                else candidate
            }
        }
    }

    /** Visible for testing — drops the in-memory cache entry for [userId]. */
    internal fun invalidate(userId: String) {
        cache.invalidate(userId)
    }

    /** Visible for testing — drops the entire in-memory cache. */
    internal fun invalidateAll() {
        cache.invalidateAll()
    }

    /**
     * Emits `SELECT pg_notify(channel, userId)` so peer pods'
     * [com.vshpynta.expenses.api.config.gdpr.SessionRevocationListener]
     * refresh their caches. Swallows any error — see
     * [revokeAllSessions] for the correctness backstop.
     */
    private suspend fun broadcastInvalidation(userId: String) {
        if (!properties.revocation.notifyEnabled) return
        try {
            repository.notifyChannel(properties.revocation.notifyChannel, userId)
        } catch (e: Exception) {
            // Don't fail the revocation just because the fan-out hiccuped.
            logger.warn(
                "pg_notify fan-out failed for user {}; peers will converge on next listener reconnect",
                userId, e
            )
        }
    }

    /**
     * Residual time-to-live for a cache entry: how many nanoseconds
     * until `expires_at` is reached. Returns `0` for already-expired
     * rows (Caffeine treats `0` as "evict immediately") and clamps
     * to [MAX_TTL_NANOS] to keep arithmetic well-behaved if a malformed row
     * ever sets `expires_at` far in the future.
     */
    private fun residualNanos(value: Cached): Long {
        val now = clock.instant()
        if (!value.expiresAt.isAfter(now)) return 0L
        val raw = Duration.between(now, value.expiresAt).toNanos()
        return raw.coerceAtMost(MAX_TTL_NANOS)
    }

    companion object {
        private val logger = LoggerFactory.getLogger(SessionRevocationService::class.java)

        /**
         * Bump `revoked_before_iat` past the current second so that a
         * JWT minted in the very same second as the revocation is
         * still rejected. Same-second tokens are common when the
         * `revokeAllSessions` and the `/token` calls race.
         */
        private const val SECONDS_BEYOND_NOW: Long = 1L

        /**
         * Sanity upper bound on per-entry TTL. Chosen comfortably
         * above any realistic value of
         * [GdprProperties.Revocation.expiresGrace] (default 15 min,
         * production might raise to hours or a day or two for very
         * long-lived access tokens) so the clamp only ever triggers
         * for malformed `expires_at` values in the year 9999. If we
         * clamped too tight, the cache would silently expire entries
         * earlier than the DB row says — exactly the kind of
         * not-quite-expired-token bypass this service exists to
         * prevent. Caffeine accepts up to ~292 years of nanos so
         * there is no implementation cost to a generous bound.
         */
        private val MAX_TTL_NANOS: Long = TimeUnit.DAYS.toNanos(30)
    }
}
