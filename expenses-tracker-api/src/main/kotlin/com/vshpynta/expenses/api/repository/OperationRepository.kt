package com.vshpynta.expenses.api.repository

import com.vshpynta.expenses.api.model.Operation
import kotlinx.coroutines.flow.Flow
import org.springframework.data.r2dbc.repository.Modifying
import org.springframework.data.r2dbc.repository.Query
import org.springframework.data.repository.kotlin.CoroutineCrudRepository
import org.springframework.stereotype.Repository
import java.util.UUID

/**
 * Repository for operation log entries
 * Handles CRUD operations and custom queries for the operations table
 */
@Repository
interface OperationRepository : CoroutineCrudRepository<Operation, UUID> {

    /**
     * Find uncommitted operations for a device
     * Returns Flow for efficient reactive streaming
     */
    @Query("SELECT * FROM operations WHERE device_id = :deviceId AND committed = false ORDER BY ts, op_id")
    fun findUncommittedOperations(deviceId: String): Flow<Operation>

    /**
     * Mark operations as committed for a device
     */
    @Modifying
    @Query(
        """
        UPDATE operations SET committed = true
        WHERE device_id = :deviceId AND op_id IN (:operationsIds)
    """
    )
    suspend fun markOperationsAsCommitted(deviceId: String, operationsIds: List<UUID>): Int
}
