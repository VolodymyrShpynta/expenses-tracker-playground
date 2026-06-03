package com.vshpynta.expenses.api.model.gdpr

import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Column
import org.springframework.data.relational.core.mapping.Table
import java.time.Instant

/**
 * Append-only audit row for Art. 18 restriction transitions. Stores
 * SHA-256 hashes of `user_id` and `actor_id` so the row survives Art. 17
 * erasure of the subject without re-linking to personal data.
 */
@Table("processing_restriction_log")
data class ProcessingRestrictionLogEntry(
    @Id
    @Column("id")
    val id: Long? = null,

    @Column("user_id_hash")
    val userIdHash: String,

    @Column("event")
    val event: RestrictionLogEvent,

    @Column("ground")
    val ground: RestrictionGround? = null,

    @Column("requested_by")
    val requestedBy: RestrictionRequester,

    @Column("actor_id_hash")
    val actorIdHash: String,

    @Column("reason_note")
    val reasonNote: String? = null,

    @Column("occurred_at")
    val occurredAt: Instant? = null,
)
