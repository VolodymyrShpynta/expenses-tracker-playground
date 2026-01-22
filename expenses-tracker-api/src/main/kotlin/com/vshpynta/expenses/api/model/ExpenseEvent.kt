package com.vshpynta.expenses.api.model

import org.springframework.data.annotation.Id
import org.springframework.data.domain.Persistable
import org.springframework.data.relational.core.mapping.Column
import org.springframework.data.relational.core.mapping.Table
import java.util.UUID

/**
 * Expense event for event sourcing architecture
 * Represents an immutable fact that happened to an expense (created, updated, deleted)
 * Implements Persistable to handle UUID-based IDs correctly with R2DBC
 */
@Table("expense_events")
data class ExpenseEvent(
    @Id
    @Column("event_id")
    val eventId: UUID = UUID.randomUUID(),

    @Column("timestamp")
    val timestamp: Long,

    @Column("device_id")
    val deviceId: String,

    @Column("event_type")
    val eventType: EventType,

    @Column("expense_id")
    val expenseId: UUID,

    @Column("payload")
    val payload: String,  // JSON as String

    @Column("committed")
    val committed: Boolean = false
) : Persistable<UUID> {

    override fun getId(): UUID = eventId

    // Always return true since we always INSERT new events (never UPDATE)
    override fun isNew(): Boolean = true
}
