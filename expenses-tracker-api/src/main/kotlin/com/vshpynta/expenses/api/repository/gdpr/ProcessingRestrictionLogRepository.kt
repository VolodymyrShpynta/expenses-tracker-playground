package com.vshpynta.expenses.api.repository.gdpr

import com.vshpynta.expenses.api.model.gdpr.ProcessingRestrictionLogEntry
import org.springframework.data.repository.kotlin.CoroutineCrudRepository
import org.springframework.stereotype.Repository

/**
 * Append-only audit log for Art. 18 transitions. Only the inherited
 * `save()` is used; we never update or delete log rows.
 */
@Repository
interface ProcessingRestrictionLogRepository : CoroutineCrudRepository<ProcessingRestrictionLogEntry, Long>
