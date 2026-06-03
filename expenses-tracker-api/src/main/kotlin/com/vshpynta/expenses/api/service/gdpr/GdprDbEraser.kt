package com.vshpynta.expenses.api.service.gdpr

import com.vshpynta.expenses.api.model.gdpr.ErasureRequester
import com.vshpynta.expenses.api.model.gdpr.GdprErasureLogEntry
import com.vshpynta.expenses.api.repository.CategoryRepository
import com.vshpynta.expenses.api.repository.ExpenseEventRepository
import com.vshpynta.expenses.api.repository.ExpenseProjectionRepository
import com.vshpynta.expenses.api.repository.gdpr.AccountActivityRepository
import com.vshpynta.expenses.api.repository.gdpr.GdprErasureLogRepository
import com.vshpynta.expenses.api.repository.gdpr.ProcessingRestrictionRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * Per-user row counts removed by the cascade in [GdprDbEraser].
 * Exposed separately from [GdprErasureResult] so the cascade is easy
 * to unit-test and so the orchestrator stays decoupled from row
 * mechanics.
 */
data class DeletionCounts(
    val events: Long,
    val projections: Long,
    val categories: Long,
)

/**
 * Outcome of one atomic DB-side erasure: the row counts that were
 * deleted plus the id of the audit row that was inserted in the same
 * transaction. The orchestrator uses [auditLogEntryId] later to flip
 * `keycloak_deleted` once the Keycloak call returns.
 */
data class ErasureRecord(
    val counts: DeletionCounts,
    val auditLogEntryId: Long,
)

/**
 * Database-side step of the Art. 17 erasure cascade run by
 * [GdprErasureService]. Owns the only `@Transactional` boundary that
 * touches per-user rows, plus the post-commit flip of the
 * `keycloak_deleted` flag.
 *
 * In scope: `expense_events`, `expense_projections`, `categories`,
 * `processing_restrictions`, `account_activity`, and the
 * `gdpr_erasure_log` audit row. The deletion order matches the SQL FK
 * / projection rebuild graph — events first, then derived
 * projections, then categories, then the GDPR live tables — and the
 * audit row is appended last inside the same transaction. **Either
 * everything is gone and the audit row exists, or nothing changed.**
 *
 * **Lives in its own bean on purpose.** Spring's `@Transactional` is
 * proxy-based, so a self-call from inside [GdprErasureService]
 * (`this.eraseAndAudit(...)`) would silently bypass the proxy and
 * leave the cascade un-transactional. Injecting this collaborator
 * makes the call a real cross-bean invocation and the
 * `@Transactional` boundary actually applies.
 */
@Service
class GdprDbEraser(
    private val eventRepository: ExpenseEventRepository,
    private val projectionRepository: ExpenseProjectionRepository,
    private val categoryRepository: CategoryRepository,
    private val restrictionRepository: ProcessingRestrictionRepository,
    private val activityRepository: AccountActivityRepository,
    private val erasureLog: GdprErasureLogRepository,
) {

    /**
     * Deletes every row this application owns about [userId] and
     * appends the matching audit row, all in one transaction. The
     * audit row is inserted with `keycloakDeleted = false`; the
     * orchestrator flips it to `true` via [markKeycloakDeleted] after
     * the Keycloak account has actually been deleted. Safe to call for
     * a user that does not exist — deletions become no-ops and the
     * audit row still records the attempt with zero-filled counts.
     */
    @Transactional
    suspend fun eraseAndAudit(
        userId: String,
        userIdHash: String,
        requestedBy: ErasureRequester,
        actorIdHash: String,
        reasonNote: String?,
    ): ErasureRecord {
        val events = eventRepository.deleteAllByUserId(userId)
        val projections = projectionRepository.deleteAllByUserId(userId)
        val categories = categoryRepository.deleteAllByUserId(userId)
        restrictionRepository.deleteByUserId(userId)
        activityRepository.deleteByUserId(userId)

        val savedEntry = erasureLog.save(
            GdprErasureLogEntry(
                userIdHash = userIdHash,
                requestedBy = requestedBy,
                actorIdHash = actorIdHash,
                eventsDeleted = events,
                projectionsDeleted = projections,
                categoriesDeleted = categories,
                keycloakDeleted = false,
                reasonNote = reasonNote,
            )
        )

        return ErasureRecord(
            counts = DeletionCounts(events = events, projections = projections, categories = categories),
            auditLogEntryId = requireNotNull(savedEntry.id) { "Saved audit row must have an id" },
        )
    }

    /**
     * Flips the `keycloakDeleted` flag on the audit row identified by
     * [auditLogEntryId] from `false` to `true`. Runs in its own short
     * transaction after the Keycloak HTTP call returns, so we never
     * hold a DB connection across that network round-trip. Idempotent
     * — re-running is a no-op.
     */
    @Transactional
    suspend fun markKeycloakDeleted(auditLogEntryId: Long) {
        erasureLog.markKeycloakDeleted(auditLogEntryId)
    }
}
