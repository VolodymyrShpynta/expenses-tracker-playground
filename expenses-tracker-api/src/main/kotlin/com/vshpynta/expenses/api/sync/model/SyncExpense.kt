package com.vshpynta.expenses.api.sync.model

import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Column
import org.springframework.data.relational.core.mapping.Table
import java.util.UUID

/**
 * Expense entity for sync operations (UUID-based)
 */
@Table("expenses")
data class SyncExpense(
    @Id
    @Column("id")
    val id: UUID = UUID.randomUUID(),

    @Column("description")
    val description: String? = null,

    @Column("amount")
    val amount: Long,  // Store cents as BIGINT

    @Column("category")
    val category: String? = null,

    @Column("date")
    val date: String? = null,  // ISO 8601 timestamp as string

    @Column("updated_at")
    val updatedAt: Long,

    @Column("deleted")
    val deleted: Boolean = false
)
