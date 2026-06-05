package com.vshpynta.expenses.api.model.gdpr

import org.springframework.data.annotation.Id
import org.springframework.data.domain.Persistable
import org.springframework.data.relational.core.mapping.Column
import org.springframework.data.relational.core.mapping.Table
import java.time.Instant

/**
 * Who triggered a session revocation. Persisted in `session_revocations.revoked_by`
 * so audit / metrics can break down "sign-out everywhere" usage by cause.
 *
 * Distinct from [RestrictionRequester] / [ErasureRequester] because the
 * `ERASURE` case is intrinsic to the revocation flow — it never originates
 * from a controller — and because admin-driven session kicks do not require
 * the `gdpr-admin` role (they belong to ordinary account management).
 */
enum class RevokedBy {
    /** The user clicked "sign me out everywhere" in the SPA. */
    SUBJECT,

    /** An operator forcibly terminated the user's sessions. */
    ADMIN,

    /** Cascade from Art. 17 erasure — the subject no longer exists. */
    ERASURE,
}

/**
 * One row per user. Read on the hot path of every authenticated
 * request by [com.vshpynta.expenses.api.config.gdpr.SessionRevocationFilter]
 * to decide whether the bearer's JWT was issued before the user's
 * last revocation event.
 *
 * Updated last-write-wins: each revocation overwrites the previous one
 * with a fresher `revoked_before_iat`, so the table never grows beyond
 * one row per user.
 */
@Table("session_revocations")
data class SessionRevocation(
    @Id
    @Column("user_id")
    val userId: String,

    /**
     * Any JWT whose `iat` claim is strictly older than this is treated
     * as revoked. The writer sets this to `now()` (or slightly into
     * the future, on purpose, to also invalidate a token that was
     * issued at exactly the same second as the revocation).
     */
    @Column("revoked_before_iat")
    val revokedBeforeIat: Instant,

    @Column("revoked_at")
    val revokedAt: Instant,

    @Column("revoked_by")
    val revokedBy: RevokedBy,

    /**
     * Wall-clock at which it becomes safe to delete this row: every
     * JWT that this entry would have rejected has expired on its own
     * by then. Computed by the writer as `revoked_at + access-token
     * lifespan + clock-skew margin`.
     */
    @Column("expires_at")
    val expiresAt: Instant,
) : Persistable<String> {
    override fun getId(): String = userId

    /**
     * Always `true` so Spring Data R2DBC emits an `INSERT` and lets the
     * `ON CONFLICT (user_id) DO UPDATE` clause merge the row — without
     * this, R2DBC issues an `UPDATE` for any entity with a non-null id
     * and silently no-ops on a missing row.
     */
    override fun isNew(): Boolean = true
}
