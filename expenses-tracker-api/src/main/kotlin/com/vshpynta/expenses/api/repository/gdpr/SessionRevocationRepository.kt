package com.vshpynta.expenses.api.repository.gdpr

import com.vshpynta.expenses.api.model.gdpr.RevokedBy
import com.vshpynta.expenses.api.model.gdpr.SessionRevocation
import kotlinx.coroutines.flow.Flow
import org.springframework.data.r2dbc.repository.Modifying
import org.springframework.data.r2dbc.repository.Query
import org.springframework.data.repository.kotlin.CoroutineCrudRepository
import org.springframework.stereotype.Repository
import java.time.Instant

/**
 * Hot-path access to the `session_revocations` table.
 *
 * [findByUserId] returns the full row — the filter only needs the
 * `revoked_before_iat` column but R2DBC's scalar-projection path
 * does not reliably map a single column into a bare `Instant`, so
 * the service reads the field off the entity instead. Writes go
 * through a single conditional [upsert] so concurrent revocations
 * always converge to the latest one (last-write-wins by `revoked_at`).
 *
 * [findAllNotExpired] feeds the in-memory snapshot that
 * [com.vshpynta.expenses.api.service.gdpr.SessionRevocationService]
 * holds on every pod — see that class for the rationale.
 */
@Repository
interface SessionRevocationRepository : CoroutineCrudRepository<SessionRevocation, String> {

    @Query("SELECT * FROM session_revocations WHERE user_id = :userId")
    suspend fun findByUserId(userId: String): SessionRevocation?

    /**
     * Snapshot of every still-relevant revocation. Used at pod startup
     * and after every LISTEN-connection reconnect to rebuild the
     * authoritative in-memory cache. Filters out rows whose tokens
     * have already expired on their own — they're harmless to omit
     * because the only consumer (the resource-server filter) rejects
     * a JWT iff `iat &lt; revoked_before_iat`, and any token covered
     * by an expired row has itself expired.
     */
    @Query("SELECT * FROM session_revocations WHERE expires_at > :now")
    fun findAllNotExpired(now: Instant): Flow<SessionRevocation>

    /**
     * Conditional UPSERT: insert a fresh revocation row, or — if one
     * already exists — overwrite it iff the incoming `revoked_at` is
     * strictly newer. The `WHERE EXCLUDED.revoked_at > ...` clause is
     * the same last-write-wins pattern used by the expense projection
     * writer; two pods racing to revoke the same user simply converge
     * to the later wall-clock without losing data.
     */
    @Modifying
    @Query(
        """
        INSERT INTO session_revocations
            (user_id, revoked_before_iat, revoked_at, revoked_by, expires_at)
        VALUES
            (:userId, :revokedBeforeIat, :revokedAt, :revokedBy, :expiresAt)
        ON CONFLICT (user_id) DO UPDATE SET
            revoked_before_iat = EXCLUDED.revoked_before_iat,
            revoked_at         = EXCLUDED.revoked_at,
            revoked_by         = EXCLUDED.revoked_by,
            expires_at         = EXCLUDED.expires_at
        WHERE EXCLUDED.revoked_at > session_revocations.revoked_at
        """
    )
    suspend fun upsert(
        userId: String,
        revokedBeforeIat: Instant,
        revokedAt: Instant,
        revokedBy: RevokedBy,
        expiresAt: Instant,
    ): Int

    /**
     * Used by the scheduled cleanup
     * ([com.vshpynta.expenses.api.service.gdpr.SessionRevocationPruneJob])
     * to drop rows whose every covered token has already expired on
     * its own. Returns the row count so the job can report progress.
     */
    @Modifying
    @Query("DELETE FROM session_revocations WHERE expires_at < :cutoff")
    suspend fun deleteExpired(cutoff: Instant): Int

    /**
     * Fires a PostgreSQL `NOTIFY` on [channel] carrying [payload].
     * Lives on the repository (rather than as a raw `DatabaseClient`
     * call in the service) to keep all `session_revocations`-related
     * SQL co-located — the listener half of the same LISTEN/NOTIFY
     * pair is documented on
     * [com.vshpynta.expenses.api.config.gdpr.SessionRevocationListener].
     *
     * `pg_notify` is a Postgres function that returns `void`; the
     * `@Modifying` annotation tells Spring Data R2DBC not to try to
     * map the (empty) result to an entity. The method returns no
     * meaningful value — callers fire-and-forget.
     */
    @Modifying
    @Query("SELECT pg_notify(:channel, :payload)")
    suspend fun notifyChannel(channel: String, payload: String)
}
