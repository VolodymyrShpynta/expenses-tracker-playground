package com.vshpynta.expenses.api.repository

import com.vshpynta.expenses.api.model.ExpenseEvent
import org.springframework.data.r2dbc.repository.Modifying
import org.springframework.data.r2dbc.repository.Query
import org.springframework.data.repository.kotlin.CoroutineCrudRepository
import org.springframework.stereotype.Repository
import java.util.UUID

/**
 * Event store repository for expense events.
 * Append-only event log (source of truth); events are immutable once created.
 *
 * Only the inherited `save()` is used today — write paths go through
 * [com.vshpynta.expenses.api.service.ExpenseCommandService.appendEvent].
 *
 * The exception is [deleteAllByUserId], which exists solely for the
 * Art. 17 erasure pipeline; outside that boundary the event log is
 * append-only as a deliberate event-sourcing invariant.
 */
@Repository
interface ExpenseEventRepository : CoroutineCrudRepository<ExpenseEvent, UUID> {

    /**
     * Hard-delete every event owned by the user. **Only** called by
     * [com.vshpynta.expenses.api.service.gdpr.GdprErasureService] — this
     * is the scoped exception to the events-are-eternal convention.
     */
    @Modifying
    @Query("DELETE FROM expense_events WHERE user_id = :userId")
    suspend fun deleteAllByUserId(userId: String): Long
}
