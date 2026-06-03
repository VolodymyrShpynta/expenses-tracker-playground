package com.vshpynta.expenses.api.model.gdpr

import org.springframework.data.annotation.Id
import org.springframework.data.domain.Persistable
import org.springframework.data.relational.core.mapping.Column
import org.springframework.data.relational.core.mapping.Table
import java.time.Instant

/**
 * Live state for an Art. 18 processing restriction. One row per restricted
 * user; the row's existence is what blocks writes via
 * [com.vshpynta.expenses.api.service.gdpr.ProcessingRestrictionGuard].
 *
 * Lifting a restriction is implemented as a row delete; the audit trail
 * lives in [ProcessingRestrictionLogEntry].
 *
 * Implements [Persistable] with `isNew = true` so the repository's UPSERT
 * is always treated as an INSERT (the live table is conflict-on-PK).
 */
@Table("processing_restrictions")
data class ProcessingRestriction(
    @Id
    @Column("user_id")
    val userId: String,

    @Column("restricted_at")
    val restrictedAt: Instant,

    @Column("ground")
    val ground: RestrictionGround,

    @Column("requested_by")
    val requestedBy: RestrictionRequester,

    @Column("actor_id")
    val actorId: String,

    @Column("reason_note")
    val reasonNote: String? = null,

    /**
     * Timestamp at which the Art. 18(3) pre-lift notice was sent. The
     * lift endpoint refuses to delete this row until the notice is sent
     * AND the configured dwell window has elapsed — that is how the
     * notification duty becomes mechanically enforceable rather than a
     * checkbox.
     */
    @Column("lift_notice_sent_at")
    val liftNoticeSentAt: Instant? = null,
) : Persistable<String> {
    override fun getId(): String = userId
    override fun isNew(): Boolean = true
}
