-- =============================================================================
-- Migration V3: GDPR support tables.
-- =============================================================================
-- Adds the schema needed for:
--   * Article 17 — Right to erasure (`gdpr_erasure_log`)
--   * Article 18 — Right to restriction of processing
--                  (`processing_restrictions`, `processing_restriction_log`)
--   * Article 5(e) — inactive-account retention (`account_activity`)
--
-- Design notes
-- ------------
--   * The live tables (`processing_restrictions`, `account_activity`) are
--     keyed by `user_id` and store the current state only. The hot path
--     (restriction guard, activity touch) is a single primary-key lookup.
--   * The audit log tables (`gdpr_erasure_log`, `processing_restriction_log`)
--     store **SHA-256 hashes** of `user_id` and `actor_id`, not the raw
--     identifiers. This is so that audit rows survive Art. 17 erasure of
--     the subject without re-linking to personal data: "did this user ever
--     have a restriction in place?" remains provable, but the hash itself
--     is no longer personal data once the original `user_id` is gone.
--   * Hashes are stored as base16 (hex) `VARCHAR(64)` for portability and
--     to match the converter shape used elsewhere in the schema (UUIDs as
--     `VARCHAR(36)`).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- processing_restrictions — live state for Art. 18 restrictions
-- -----------------------------------------------------------------------------
-- One row per restricted user. Row deletion is the "lift restriction"
-- operation; the audit lives in `processing_restriction_log`.
CREATE TABLE processing_restrictions (
    user_id              VARCHAR(255) PRIMARY KEY,
    restricted_at        TIMESTAMP WITH TIME ZONE NOT NULL,
    ground               VARCHAR(32)  NOT NULL
        CHECK (ground IN ('ACCURACY_CONTESTED',
                          'UNLAWFUL_NOT_ERASED',
                          'CONTROLLER_NO_LONGER_NEEDS',
                          'OBJECTION_PENDING')),
    requested_by         VARCHAR(32)  NOT NULL
        CHECK (requested_by IN ('SUBJECT', 'ADMIN')),
    actor_id             VARCHAR(255) NOT NULL,
    reason_note          TEXT,
    lift_notice_sent_at  TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_processing_restrictions_restricted_at
    ON processing_restrictions(restricted_at);


-- -----------------------------------------------------------------------------
-- processing_restriction_log — append-only audit of Art. 18 transitions
-- -----------------------------------------------------------------------------
-- Survives Art. 17 erasure of the subject because user_id is stored as a
-- hash. Lets us answer "was this account ever restricted?" without
-- retaining personal data after erasure.
CREATE TABLE processing_restriction_log (
    id              BIGSERIAL PRIMARY KEY,
    user_id_hash    VARCHAR(64)  NOT NULL,
    event           VARCHAR(32)  NOT NULL
        CHECK (event IN ('RESTRICTED', 'LIFT_NOTICE_SENT', 'UNRESTRICTED')),
    ground          VARCHAR(32),
    requested_by    VARCHAR(32)  NOT NULL
        CHECK (requested_by IN ('SUBJECT', 'ADMIN')),
    actor_id_hash   VARCHAR(64)  NOT NULL,
    reason_note     TEXT,
    occurred_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_processing_restriction_log_user
    ON processing_restriction_log(user_id_hash, occurred_at);


-- -----------------------------------------------------------------------------
-- gdpr_erasure_log — append-only audit of Art. 17 erasures
-- -----------------------------------------------------------------------------
-- Records that an erasure happened, who triggered it, and when. Stores a
-- hash of the erased user_id so that we can prove "this account was
-- erased on date X" without keeping the erased identifier.
CREATE TABLE gdpr_erasure_log (
    id                  BIGSERIAL PRIMARY KEY,
    user_id_hash        VARCHAR(64)  NOT NULL,
    requested_by        VARCHAR(32)  NOT NULL
        CHECK (requested_by IN ('SUBJECT', 'ADMIN', 'INACTIVITY_JOB')),
    actor_id_hash       VARCHAR(64)  NOT NULL,
    events_deleted      BIGINT       NOT NULL DEFAULT 0,
    projections_deleted BIGINT       NOT NULL DEFAULT 0,
    categories_deleted  BIGINT       NOT NULL DEFAULT 0,
    keycloak_deleted    BOOLEAN      NOT NULL DEFAULT false,
    reason_note         TEXT,
    occurred_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gdpr_erasure_log_user
    ON gdpr_erasure_log(user_id_hash, occurred_at);


-- -----------------------------------------------------------------------------
-- account_activity — last-seen tracking for inactivity retention
-- -----------------------------------------------------------------------------
-- Updated by AccountActivityFilter on each authenticated request
-- (debounced; see app.gdpr.activity.touch-debounce). The inactivity job
-- reads this table to decide which accounts to warn or erase.
--
-- `inactivity_warning_sent_at` is the timestamp at which the "your
-- account will be erased in N days" email was dispatched. The job uses
-- it to (a) avoid sending the warning twice, (b) compute the grace
-- window before erasure.
CREATE TABLE account_activity (
    user_id                     VARCHAR(255) PRIMARY KEY,
    last_seen_at                TIMESTAMP WITH TIME ZONE NOT NULL,
    inactivity_warning_sent_at  TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_account_activity_last_seen
    ON account_activity(last_seen_at);

CREATE INDEX idx_account_activity_warning_sent
    ON account_activity(inactivity_warning_sent_at)
    WHERE inactivity_warning_sent_at IS NOT NULL;


-- -----------------------------------------------------------------------------
-- shedlock — distributed lock for @Scheduled methods across HA replicas
-- -----------------------------------------------------------------------------
-- Used by ShedLock to serialize cron jobs (currently `gdpr-inactivity-tick`)
-- across multiple backend instances so the inactivity job runs at most once
-- per scheduled fire. Schema is the standard ShedLock layout for PostgreSQL
-- as documented at https://github.com/lukas-krecan/ShedLock#postgresql.
--
-- One row per lock name. `lock_until` is the safety-release deadline
-- (whichever instance holds the lock must release it by then; if the JVM
-- dies, another instance can take over after this timestamp passes).
CREATE TABLE shedlock (
    name        VARCHAR(64)              PRIMARY KEY,
    lock_until  TIMESTAMP WITH TIME ZONE NOT NULL,
    locked_at   TIMESTAMP WITH TIME ZONE NOT NULL,
    locked_by   VARCHAR(255)             NOT NULL
);
