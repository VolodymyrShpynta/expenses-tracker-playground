package com.vshpynta.expenses.api.service.gdpr

import com.vshpynta.expenses.api.model.gdpr.ErasureRequester
import com.vshpynta.expenses.api.util.IdentifierHasher
import kotlinx.coroutines.CancellationException
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Instant

/**
 * Result of an Art. 17 erasure cascade.
 */
data class GdprErasureResult(
    val userId: String,
    val requestedBy: ErasureRequester,
    val eventsDeleted: Long,
    val projectionsDeleted: Long,
    val categoriesDeleted: Long,
    val keycloakDeleted: Boolean,
    val occurredAt: Instant,
)

/**
 * Cascade for Art. 17 — Right to erasure. All deletion logic is here
 * so the user-callable endpoint, the admin endpoint, and the
 * inactivity job route through one well-tested code path.
 *
 * Order of operations:
 *
 *  1. expense_events             — hard delete                   ┐
 *  2. expense_projections        — hard delete                   │
 *  3. categories                 — hard delete                   │ one
 *  4. processing_restrictions    — live restriction row, if any  │ `@Transactional`
 *  5. account_activity           — last-seen tracker             │ in
 *  6. gdpr_erasure_log           — append the audit row          │ GdprDbEraser
 *                                  (keycloakDeleted = false)     ┘
 *  7. Keycloak                   — best-effort post-commit delete
 *  8. gdpr_erasure_log           — flip keycloakDeleted = true
 *                                  (only if step 7 reported success)
 *  9. UserNotificationService    — best-effort confirmation to the
 *                                  data subject (failures are logged,
 *                                  never propagated)
 *
 * Steps 1–6 are atomic: either all per-user data is gone *and* the
 * audit row exists, or nothing changed. Steps 7–9 run **after** the
 * commit so a Keycloak outage or notification failure cannot leave
 * the DB half-erased; the audit row records what actually happened
 * (including a transient `keycloakDeleted = false`).
 */
@Service
class GdprErasureService(
    private val gdprDbEraser: GdprDbEraser,
    private val keycloakAdmin: KeycloakAdminClient,
    private val notifier: UserNotificationService,
    private val hasher: IdentifierHasher,
    private val clock: Clock,
) {

    companion object {
        private val logger = LoggerFactory.getLogger(GdprErasureService::class.java)
    }

    suspend fun eraseUser(
        userId: String,
        requestedBy: ErasureRequester,
        actorId: String,
        reasonNote: String? = null,
    ): GdprErasureResult {
        val erasureRecord = gdprDbEraser.eraseAndAudit(
            userId = userId,
            userIdHash = hasher.hash(userId),
            requestedBy = requestedBy,
            actorIdHash = hasher.hash(actorId),
            reasonNote = reasonNote,
        )

        val keycloakDeleted = keycloakAdmin.deleteUser(userId)
        if (keycloakDeleted) {
            gdprDbEraser.markKeycloakDeleted(erasureRecord.auditLogEntryId)
        }

        sendErasureConfirmationSafely(userId)

        val counts = erasureRecord.counts
        logger.info(
            "GDPR erasure complete for user {} (by {}): events={}, projections={}, categories={}, keycloak={}",
            userId, requestedBy,
            counts.events, counts.projections, counts.categories, keycloakDeleted
        )
        return GdprErasureResult(
            userId = userId,
            requestedBy = requestedBy,
            eventsDeleted = counts.events,
            projectionsDeleted = counts.projections,
            categoriesDeleted = counts.categories,
            keycloakDeleted = keycloakDeleted,
            occurredAt = clock.instant(),
        )
    }

    /**
     * Best-effort post-commit notification. Runs after the DB
     * transaction has already committed (steps 1–6) and after the
     * Keycloak cascade (step 7), so a notifier failure cannot
     * resurrect deleted data nor poison the HTTP response. Failures
     * are logged at WARN; the operator can re-send manually from the
     * audit row. [CancellationException] is propagated so coroutine
     * cancellation still works.
     */
    private fun sendErasureConfirmationSafely(userId: String) {
        try {
            notifier.sendErasureConfirmation(userId)
        } catch (ce: CancellationException) {
            throw ce
        } catch (ex: Throwable) {
            logger.warn(
                "GDPR erasure confirmation notification failed for user {} — erasure itself succeeded; manual follow-up required",
                userId, ex
            )
        }
    }
}
