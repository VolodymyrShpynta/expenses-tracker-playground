package com.vshpynta.expenses.api.model

/**
 * Event sync file format for synchronizing between devices
 */
data class EventSyncFile(
    val snapshot: Snapshot? = null,
    val events: List<EventEntry> = emptyList()
)

data class Snapshot(
    val version: Int = 1,
    val expenses: List<ExpensePayload> = emptyList()
)

/**
 * Serializable event entry for sync file
 */
data class EventEntry(
    val eventId: String,  // UUID as string
    val timestamp: Long,
    val eventType: String,
    val expenseId: String,  // UUID as string
    val payload: ExpensePayload
)
