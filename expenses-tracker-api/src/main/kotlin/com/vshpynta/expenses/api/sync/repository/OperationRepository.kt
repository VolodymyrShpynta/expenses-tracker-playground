package com.vshpynta.expenses.api.sync.repository

import com.vshpynta.expenses.api.sync.model.Operation
import kotlinx.coroutines.flow.Flow
import org.springframework.data.r2dbc.repository.Query
import org.springframework.data.repository.kotlin.CoroutineCrudRepository
import org.springframework.stereotype.Repository
import java.util.*

@Repository
interface OperationRepository : CoroutineCrudRepository<Operation, UUID> {

    @Query("SELECT * FROM operations WHERE committed = false ORDER BY ts, device_id, op_id")
    fun findUncommittedOperations(): Flow<Operation>

    @Query("UPDATE operations SET committed = true WHERE device_id = :deviceId AND op_id IN (:opIds)")
    suspend fun markOperationsAsCommitted(deviceId: String, opIds: List<UUID>): Int
}
