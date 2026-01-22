package com.vshpynta.expenses.api.repository

import com.vshpynta.expenses.api.model.ExpenseEvent
import kotlinx.coroutines.flow.Flow
import org.springframework.data.r2dbc.repository.Modifying
import org.springframework.data.r2dbc.repository.Query
import org.springframework.data.repository.kotlin.CoroutineCrudRepository
import org.springframework.stereotype.Repository
import java.util.UUID

/**
 * Event store repository for expense events
 * Handles append-only event log (source of truth)
 * Events are immutable once created
 */
@Repository
interface ExpenseEventRepository : CoroutineCrudRepository<ExpenseEvent, UUID> {

    /**
     * Find uncommitted events for a device
     * Returns Flow for efficient reactive streaming
     */
    @Query("SELECT * FROM expense_events WHERE device_id = :deviceId AND committed = false ORDER BY timestamp, event_id")
    suspend fun findUncommittedEvents(deviceId: String): Flow<ExpenseEvent>

    /**
     * Mark events as committed for a device
     */
    @Modifying
    @Query(
        """
        UPDATE expense_events SET committed = true
        WHERE device_id = :deviceId AND event_id IN (:eventIds)
    """
    )
    suspend fun markEventsAsCommitted(deviceId: String, eventIds: List<UUID>): Int
}
