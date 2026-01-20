package com.vshpynta.expenses.api.sync.repository

import org.springframework.data.r2dbc.repository.Query
import org.springframework.data.repository.kotlin.CoroutineCrudRepository
import org.springframework.stereotype.Repository
import java.util.UUID

/**
 * Registry of applied operations to ensure idempotency
 */
@Repository
interface AppliedOpRepository : CoroutineCrudRepository<AppliedOp, UUID> {

    @Query("SELECT EXISTS(SELECT 1 FROM applied_ops WHERE op_id = :opId)")
    suspend fun hasBeenApplied(opId: UUID): Boolean

    @Query("INSERT INTO applied_ops (op_id) VALUES (:opId) ON CONFLICT (op_id) DO NOTHING")
    suspend fun markAsApplied(opId: UUID): Int
}

/**
 * Simple entity for applied_ops table
 */
data class AppliedOp(
    val opId: UUID
)
