package com.vshpynta.expenses.api.sync.model

/**
 * Shared sync file format
 */
data class SyncFile(
    val snapshot: Snapshot? = null,
    val ops: List<OpEntry> = emptyList()
)

data class Snapshot(
    val version: Int = 1,
    val expenses: List<ExpensePayload> = emptyList()
)

/**
 * Serializable operation entry for sync file
 */
data class OpEntry(
    val opId: String,  // UUID as string
    val ts: Long,
    val deviceId: String,
    val opType: String,
    val entityId: String,  // UUID as string
    val payload: ExpensePayload
)
