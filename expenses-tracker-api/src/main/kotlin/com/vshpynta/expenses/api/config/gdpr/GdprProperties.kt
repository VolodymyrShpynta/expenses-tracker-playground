package com.vshpynta.expenses.api.config.gdpr

import org.springframework.boot.context.properties.ConfigurationProperties
import java.time.Duration

/**
 * Configuration knobs for the GDPR subsystem. Defaults match the
 * design recorded in [GDPR.md](../../../../../../../../../../GDPR.md):
 * 3-year inactivity threshold + 90-day grace + 5-minute fresh-auth
 * window + 7-day lift dwell.
 *
 * Values are deliberately conservative — they can be tightened in
 * production via environment variables without redeploying.
 */
@ConfigurationProperties(prefix = "app.gdpr")
data class GdprProperties(
    val freshAuth: FreshAuth = FreshAuth(),
    val restriction: Restriction = Restriction(),
    val inactivity: Inactivity = Inactivity(),
    val activity: Activity = Activity(),
    val revocation: Revocation = Revocation(),
    val keycloak: Keycloak = Keycloak(),
) {
    /**
     * Maximum age of the JWT `auth_time` claim for endpoints that
     * require fresh re-authentication (account deletion, restriction
     * lifecycle changes). Reject anything older.
     */
    data class FreshAuth(val maxAge: Duration = Duration.ofMinutes(5))

    /**
     * Minimum dwell between sending the Art. 18(3) pre-lift notice and
     * being allowed to actually lift the restriction. This is the
     * mechanism that makes the notification duty enforceable.
     */
    data class Restriction(val liftDwell: Duration = Duration.ofDays(7))

    data class Inactivity(
        /** No login for this long ⇒ warning email is sent. */
        val warningAfter: Duration = Duration.ofDays(365L * 3L),
        /** Grace window between the warning and erasure. */
        val erasureGrace: Duration = Duration.ofDays(90),
        /** Cron expression for the scheduled job (default: 03:00 UTC daily). */
        val cron: String = "0 0 3 * * *",
        /** Master switch — keep `false` until email transport is wired up. */
        val enabled: Boolean = false,
    )

    /**
     * Debounce knobs for the `last_seen_at` writer.
     *
     * @property touchDebounce minimum interval between two DB writes
     *   for the same user. Touching the table on literally every
     *   request would multiply write load on a hot path; updating at
     *   most once per [touchDebounce] per user is accurate enough for a
     *   multi-month retention window.
     * @property cacheMaxEntries hard upper bound on the in-memory
     *   debounce cache. Caps memory under unique-user spikes (e.g., a
     *   bot scan). Each entry is ~80 bytes, so 100k entries is ~8 MB.
     *   Older entries are evicted in LRU order once the bound is hit.
     */
    data class Activity(
        val touchDebounce: Duration = Duration.ofMinutes(15),
        val cacheMaxEntries: Long = 100_000L,
    )

    /**
     * Knobs for the per-user session-revocation table that backs
     * "sign me out everywhere" and the post-erasure access-token kill.
     *
     * **Cache model.** Each pod holds an *authoritative* in-memory
     * snapshot of every still-relevant revocation row, loaded at
     * startup and kept in sync via PostgreSQL LISTEN/NOTIFY. A cache
     * miss therefore means "definitively not revoked" — the hot path
     * never touches the DB. Per-entry TTL matches each row's
     * `expires_at` so entries vanish from memory exactly when they
     * become harmless.
     *
     * @property cacheMaxEntries upper bound on the in-memory cache.
     *   Caps memory against pathological table growth. Each entry is
     *   roughly (36-char UUID, two boxed `Instant`s) ~ 200 B, so 50k
     *   entries cost ~10 MB.
     * @property expiresGrace how far into the future to set
     *   `expires_at`. Should comfortably exceed the realm's access
     *   token lifespan plus any clock skew — once we pass this
     *   timestamp, every token the row would have rejected has
     *   already expired on its own and the row is safe to prune.
     * @property notifyEnabled when true, the writing pod broadcasts
     *   the user-id over a PostgreSQL `NOTIFY` channel so peer pods
     *   re-read the row and refresh their cache in near-real-time.
     *   When false, peer pods only converge after their next reconnect
     *   reload — fine for proven single-replica deployments.
     * @property notifyChannel PostgreSQL `LISTEN/NOTIFY` channel
     *   name. Must be a valid SQL identifier (alphanumerics +
     *   underscore, leading letter / underscore) because LISTEN
     *   cannot bind it as a parameter.
     * @property notifyReconnectDelay how long the listener waits
     *   between LISTEN connection attempts when the underlying
     *   R2DBC connection drops. On every successful reconnect the
     *   cache is rebuilt from a fresh snapshot, which is the
     *   reconciliation backstop against NOTIFYs missed during the
     *   disconnect.
     * @property pruneInterval cadence of the scheduled prune job
     *   that DELETEs rows past `expires_at + pruneSafetyMargin`.
     *   The DELETE is idempotent and indexed; running it from
     *   multiple pods is harmless (the second and third winners
     *   simply delete zero rows).
     * @property pruneSafetyMargin extra buffer past `expires_at`
     *   before a row is eligible for deletion — guards against
     *   clock skew between pods and DB.
     */
    data class Revocation(
        val cacheMaxEntries: Long = 50_000L,
        val expiresGrace: Duration = Duration.ofMinutes(15),
        val notifyEnabled: Boolean = true,
        val notifyChannel: String = "session_revoked",
        val notifyReconnectDelay: Duration = Duration.ofSeconds(5),
        val pruneInterval: Duration = Duration.ofMinutes(5),
        val pruneSafetyMargin: Duration = Duration.ofMinutes(5),
    )

    /**
     * Keycloak Admin API access for the post-erasure cascade. When
     * `enabled = false` (the default), the erasure pipeline logs a
     * warning and continues — the operator gets a manual follow-up
     * task. Real deployments should configure a confidential client
     * with `manage-users` realm-management role.
     *
     * [tokenPath] and [userPath] are path templates appended to
     * [baseUrl]. They exist as escape hatches: if a future Keycloak
     * version (or a different OIDC provider) rearranges its URL
     * layout, operators can re-point the client without a code
     * change. The defaults match Keycloak 17+ (no `/auth` prefix).
     * Supported placeholders: `{realm}` in both templates, `{userId}`
     * in [userPath].
     */
    data class Keycloak(
        val enabled: Boolean = false,
        val baseUrl: String = "",
        val realm: String = "",
        val clientId: String = "",
        val clientSecret: String = "",
        val tokenPath: String = "/realms/{realm}/protocol/openid-connect/token",
        val userPath: String = "/admin/realms/{realm}/users/{userId}",
        val userLogoutPath: String = "/admin/realms/{realm}/users/{userId}/logout",
    ) {
        /** Absolute URL of the OIDC token endpoint. */
        fun tokenUrl(): String =
            baseUrl + tokenPath.replace("{realm}", realm)

        /** Absolute URL of the Admin REST user resource for [userId]. */
        fun userUrl(userId: String): String =
            baseUrl + userPath.replace("{realm}", realm).replace("{userId}", userId)

        /**
         * Absolute URL of the Admin REST endpoint that terminates all
         * Keycloak sessions for [userId]. Keycloak 17+ exposes this as
         * `POST /admin/realms/{realm}/users/{userId}/logout` — it
         * invalidates refresh tokens and server-side sessions, but
         * already-issued access tokens remain valid until they expire.
         * The session-revocation table closes that residual gap.
         */
        fun userLogoutUrl(userId: String): String =
            baseUrl + userLogoutPath.replace("{realm}", realm).replace("{userId}", userId)
    }
}
