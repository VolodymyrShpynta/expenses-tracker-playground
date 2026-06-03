package com.vshpynta.expenses.api.model.gdpr

/**
 * Article 18(1) GDPR — grounds on which a data subject can require
 * restriction of processing. Persisted as `processing_restrictions.ground`
 * and `processing_restriction_log.ground`.
 *
 * The mapping to the article paragraphs is intentional and stable —
 * downstream policy (e.g. "the inactivity job must skip users restricted
 * under [CONTROLLER_NO_LONGER_NEEDS] because Art. 18(1)(c) preserves their
 * data for legal claims") branches on these values.
 */
enum class RestrictionGround {
    /** Art. 18(1)(a) — the subject contests the accuracy of their data. */
    ACCURACY_CONTESTED,

    /** Art. 18(1)(b) — processing is unlawful but the subject opposes erasure. */
    UNLAWFUL_NOT_ERASED,

    /** Art. 18(1)(c) — the controller no longer needs the data, but the subject does for a legal claim. */
    CONTROLLER_NO_LONGER_NEEDS,

    /** Art. 18(1)(d) — the subject objected under Art. 21 and verification is pending. */
    OBJECTION_PENDING,
}

/**
 * Who initiated the restriction / log entry. Lets the admin path keep
 * its own actor identity separate from the subject's, which is needed
 * both for audit and for "did the user request this themselves?"
 * authorisation checks.
 */
enum class RestrictionRequester {
    SUBJECT,
    ADMIN,
}

/**
 * Lifecycle events written to `processing_restriction_log`. The log is
 * append-only; the live state lives in `processing_restrictions` and
 * is deleted when the restriction is lifted.
 */
enum class RestrictionLogEvent {
    /** A new restriction was put in place. */
    RESTRICTED,

    /** The Art. 18(3) pre-lift notice was sent to the subject. */
    LIFT_NOTICE_SENT,

    /** The restriction was lifted (live row deleted). */
    UNRESTRICTED,
}

/**
 * Who initiated an Art. 17 erasure. The inactivity job is its own
 * requester so retention-driven erasures can be distinguished from
 * subject- or admin-initiated ones in audit reports.
 */
enum class ErasureRequester {
    SUBJECT,
    ADMIN,
    INACTIVITY_JOB,
}
