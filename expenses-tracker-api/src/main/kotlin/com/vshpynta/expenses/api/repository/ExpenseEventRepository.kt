package com.vshpynta.expenses.api.repository

import com.vshpynta.expenses.api.model.ExpenseEvent
import org.springframework.data.repository.kotlin.CoroutineCrudRepository
import org.springframework.stereotype.Repository
import java.util.UUID

/**
 * Event store repository for expense events.
 * Append-only event log (source of truth); events are immutable once created.
 *
 * Only the inherited `save()` is used today — write paths go through
 * [com.vshpynta.expenses.api.service.ExpenseCommandService.appendEvent].
 */
@Repository
interface ExpenseEventRepository : CoroutineCrudRepository<ExpenseEvent, UUID>
