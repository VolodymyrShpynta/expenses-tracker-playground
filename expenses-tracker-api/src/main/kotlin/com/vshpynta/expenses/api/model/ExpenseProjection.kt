package com.vshpynta.expenses.api.model

import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Column
import org.springframework.data.relational.core.mapping.Table
import java.util.UUID

/**
 * Expense projection (materialized view) for query optimization
 * Represents the current state of an expense, rebuilt from events
 * This is the read model in CQRS architecture
 */
@Table("expense_projections")
data class ExpenseProjection(
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
