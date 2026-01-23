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
     * Find uncommitted events
     * Returns Flow for efficient reactive streaming
     * Ordered by timestamp for chronological processing
     */
    @Query("SELECT * FROM expense_events WHERE committed = false ORDER BY timestamp")
    suspend fun findUncommittedEvents(): Flow<ExpenseEvent>

    /**
     * Mark events as committed by their event IDs
     * event_id is unique (PRIMARY KEY)
     */
    @Modifying
    @Query("UPDATE expense_events SET committed = true WHERE event_id IN (:eventIds)")
    suspend fun markEventsAsCommitted(eventIds: List<UUID>): Int
}
