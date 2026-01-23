package com.vshpynta.expenses.api.repository

import com.vshpynta.expenses.api.model.ProcessedEvent
import kotlinx.coroutines.flow.Flow
import org.springframework.data.r2dbc.repository.Modifying
import org.springframework.data.r2dbc.repository.Query
import org.springframework.data.repository.kotlin.CoroutineCrudRepository
import org.springframework.stereotype.Repository
import java.util.UUID

/**
 * Registry of processed events to ensure idempotency
 * Prevents duplicate event application across sync operations
 */
@Repository
interface ProcessedEventRepository : CoroutineCrudRepository<ProcessedEvent, UUID> {

    @Query("SELECT EXISTS(SELECT 1 FROM processed_events WHERE event_id = :eventId)")
    suspend fun hasBeenProcessed(eventId: UUID): Boolean

    @Modifying
    @Query("INSERT INTO processed_events (event_id) VALUES (:eventId) ON CONFLICT (event_id) DO NOTHING")
    suspend fun markAsProcessed(eventId: UUID): Int

    /**
     * Find all processed event IDs for Cache initialization
     */
    @Query("SELECT event_id FROM processed_events")
    fun findAllEventIds(): Flow<UUID>
}
