package com.vshpynta.expenses.api.model

import org.springframework.data.annotation.Id
import org.springframework.data.domain.Persistable
import org.springframework.data.relational.core.mapping.Column
import org.springframework.data.relational.core.mapping.Table
import java.util.UUID

/**
 * Operation log entry for event sourcing
 * Implements Persistable to handle UUID-based IDs correctly with R2DBC
 */
@Table("operations")
data class Operation(
    @Id
    @Column("op_id")
    val opId: UUID = UUID.randomUUID(),

    @Column("ts")
    val ts: Long,

    @Column("device_id")
    val deviceId: String,

    @Column("op_type")
    val operationType: OperationType,

    @Column("entity_id")
    val entityId: UUID,

    @Column("payload")
    val payload: String,  // JSON as String

    @Column("committed")
    val committed: Boolean = false
) : Persistable<UUID> {

    override fun getId(): UUID = opId

    // Always return true since we always INSERT new operations (never UPDATE)
    override fun isNew(): Boolean = true
}
