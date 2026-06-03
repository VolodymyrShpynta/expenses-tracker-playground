package com.vshpynta.expenses.api.model.gdpr

import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Column
import org.springframework.data.relational.core.mapping.Table
import java.time.Instant

/**
 * Append-only audit row for Art. 17 erasures. Both `user_id` and
 * `actor_id` are stored as SHA-256 hashes so the row remains useful for
 * "this account was erased on date X" proofs without re-introducing the
 * personal identifier that was the point of the erasure.
 */
@Table("gdpr_erasure_log")
data class GdprErasureLogEntry(
    @Id
    @Column("id")
    val id: Long? = null,

    @Column("user_id_hash")
    val userIdHash: String,

    @Column("requested_by")
    val requestedBy: ErasureRequester,

    @Column("actor_id_hash")
    val actorIdHash: String,

    @Column("events_deleted")
    val eventsDeleted: Long = 0,

    @Column("projections_deleted")
    val projectionsDeleted: Long = 0,

    @Column("categories_deleted")
    val categoriesDeleted: Long = 0,

    @Column("keycloak_deleted")
    val keycloakDeleted: Boolean = false,

    @Column("reason_note")
    val reasonNote: String? = null,

    @Column("occurred_at")
    val occurredAt: Instant? = null,
)
