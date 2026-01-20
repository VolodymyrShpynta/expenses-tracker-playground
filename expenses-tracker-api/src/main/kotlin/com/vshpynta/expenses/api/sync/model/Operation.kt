package com.vshpynta.expenses.api.sync.model

import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Column
import org.springframework.data.relational.core.mapping.Table
import java.util.*

/**
 * Operation log entry for event sourcing
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
)
