package com.vshpynta.expenses.api.service.gdpr

import com.vshpynta.expenses.api.model.gdpr.ErasureRequester
import com.vshpynta.expenses.api.model.gdpr.RevokedBy
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
 *   1. expense_events             — hard delete                   ┐
 *   2. expense_projections        — hard delete                   │
 *   3. categories                 — hard delete                   │ one
 *   4. processing_restrictions    — live restriction row, if any  │ `@Transactional`
 *   5. account_activity           — last-seen tracker             │ in
 *   6. gdpr_erasure_log           — append the audit row          │ GdprDbEraser
 *                                   (keycloakDeleted = false)     ┘
 *   7. session_revocations        — block any still-valid access
 *                                   token issued before this point
 *                                   from being accepted at the
 *                                   resource server. Done *before*
 *                                   the Keycloak cascade so the row
 *                                   exists even if the IdP call
 *                                   fails — the resource server
 *                                   alone is enough to deny further
 *                                   requests under the orphan
 *                                   subject.
 *   8. Keycloak                   — best-effort `deleteUser`
 *   9. gdpr_erasure_log           — flip keycloakDeleted = true
 *                                   (only if step 8 reported success)
 *  10. Keycloak                   — best-effort `logoutAllSessions`
 *                                   as a fallback for refresh tokens.
 *                                   Skipped when step 8 already
 *                                   removed the account (deleting
 *                                   the user implicitly logs them
 *                                   out) or when the cascade is
 *                                   disabled.
 *  11. UserNotificationService    — best-effort confirmation to the
 *                                   data subject (failures are
 *                                   logged, never propagated)
 *
 * Steps 1–6 are atomic: either all per-user data is gone *and* the
 * audit row exists, or nothing changed. Steps 7–11 run **after** the
 * commit so a Keycloak outage or notification failure cannot leave
 * the DB half-erased; the audit row records what actually happened
 * (including a transient `keycloakDeleted = false`).
 */
@Service
class GdprErasureService(
    private val gdprDbEraser: GdprDbEraser,
    private val keycloakAdmin: KeycloakAdminClient,
    private val notifier: UserNotificationService,
    private val sessionRevocations: SessionRevocationService,
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

        sessionRevocations.revokeAllSessions(userId, RevokedBy.ERASURE)

        val keycloakDeleted = keycloakAdmin.deleteUser(userId)
        if (keycloakDeleted) {
            gdprDbEraser.markKeycloakDeleted(erasureRecord.auditLogEntryId)
        } else {
            keycloakAdmin.logoutAllSessions(userId)
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
