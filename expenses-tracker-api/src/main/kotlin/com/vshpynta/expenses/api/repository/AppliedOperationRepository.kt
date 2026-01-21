package com.vshpynta.expenses.api.repository

import com.vshpynta.expenses.api.model.AppliedOperation
import org.springframework.data.r2dbc.repository.Modifying
import org.springframework.data.r2dbc.repository.Query
import org.springframework.data.repository.kotlin.CoroutineCrudRepository
import org.springframework.stereotype.Repository
import java.util.UUID

/**
 * Registry of applied operations to ensure idempotency
 */
@Repository
interface AppliedOperationRepository : CoroutineCrudRepository<AppliedOperation, UUID> {

    @Query("SELECT EXISTS(SELECT 1 FROM applied_operations WHERE op_id = :opId)")
    suspend fun hasBeenApplied(opId: UUID): Boolean

    @Modifying
    @Query("INSERT INTO applied_operations (op_id) VALUES (:opId) ON CONFLICT (op_id) DO NOTHING")
    suspend fun markAsApplied(opId: UUID): Int
}
