-- =============================================================================
-- Migration V4: per-user session revocation (a.k.a. "sign-out everywhere").
-- =============================================================================
-- Closes the residual gap left by relying on Keycloak alone to terminate
-- sessions: a stolen / leaked access token remains cryptographically
-- valid until it expires (default 5 min in this realm), even after the
-- user has been deleted in Keycloak or has clicked "sign me out
-- everywhere". This table stores a per-user `revoked_before_iat`
-- timestamp; the [SessionRevocationFilter] rejects any incoming JWT
-- whose `iat` claim is older than that timestamp with `401 Unauthorized`
-- and `{"error":"session_revoked"}`.
--
-- Reuses for three use cases at once:
--   * Art. 17 erasure       — `revoked_by = 'ERASURE'`
--   * Admin "kick this user" — `revoked_by = 'ADMIN'`
--   * Self "sign me out everywhere" — `revoked_by = 'SUBJECT'`
--
-- Why a separate table rather than reusing `gdpr_erasure_log`:
--   * the audit log is append-only and indexed for `(user_id_hash,
--     occurred_at)` lookups; this table needs a primary-key write path
--     and a small bounded working set (one row per user);
--   * the audit row records hashed identifiers so the row survives
--     erasure, while the revocation lookup needs the raw `sub` claim
--     for an indexed PK lookup on the hot path of every request;
--   * the audit row is permanent — Art. 5(1)(e) — but revocation rows
--     can be purged via [expires_at] once every active token issued
--     before that point has expired (TTL + clock-skew safety margin).
-- =============================================================================

CREATE TABLE session_revocations (
    user_id              VARCHAR(255) PRIMARY KEY,

    -- Reject any JWT whose `iat` claim is strictly less than this.
    -- Stored as TIMESTAMP WITH TIME ZONE for symmetry with the rest of
    -- the schema; comparison is done in code against `Jwt.issuedAt`.
    revoked_before_iat   TIMESTAMP WITH TIME ZONE NOT NULL,

    revoked_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    revoked_by           VARCHAR(16)  NOT NULL
        CHECK (revoked_by IN ('SUBJECT', 'ADMIN', 'ERASURE')),

    -- Wall-clock at which it is safe to delete this row: any token
    -- issued at or before [revoked_before_iat] is guaranteed to have
    -- expired by this instant. Computed as
    --     revoked_at + access_token_lifespan + clock_skew_margin
    -- by the writing service; the cleanup job uses this column.
    expires_at           TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Cleanup-job lookup. Used by the future scheduled prune to drop rows
-- whose `expires_at` is in the past — there is no point keeping a
-- revocation entry once every token it would have rejected has
-- already expired on its own.
CREATE INDEX idx_session_revocations_expires
    ON session_revocations(expires_at);
