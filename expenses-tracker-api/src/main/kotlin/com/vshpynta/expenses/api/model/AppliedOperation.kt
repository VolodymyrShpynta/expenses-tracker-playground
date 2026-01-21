package com.vshpynta.expenses.api.model

import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Column
import org.springframework.data.relational.core.mapping.Table
import java.util.UUID

/**
 * Entity for applied_operations table
 * Tracks which operations have already been applied to ensure idempotency
 */
@Table("applied_operations")
data class AppliedOperation(
    @Id
    @Column("op_id")
    val opId: UUID
)
