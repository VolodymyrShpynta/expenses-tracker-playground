package com.vshpynta.expenses.api.controller.dto

import com.vshpynta.expenses.api.model.gdpr.ErasureRequester
import com.vshpynta.expenses.api.service.gdpr.GdprErasureResult
import java.time.Instant

/**
 * Response body for a successful Art. 17 erasure. Counts come from the
 * cascade so the caller can sanity-check what was actually removed.
 */
data class ErasureResultDto(
    val userId: String,
    val requestedBy: ErasureRequester,
    val eventsDeleted: Long,
    val projectionsDeleted: Long,
    val categoriesDeleted: Long,
    val keycloakDeleted: Boolean,
    val occurredAt: Instant,
    /**
     * User-facing instructions for the parts of the erasure that the
     * backend cannot perform itself — e.g. clearing the web app's
     * `localStorage` preferences, and (when the Keycloak cascade
     * fails) contacting the operator to remove the login account. The
     * frontend renders this as a checklist on the "your account has
     * been deleted" screen.
     */
    val followUpInstructions: List<String> = emptyList(),
)

/**
 * Map the service-side cascade result to the wire DTO. Lives next to
 * the DTO so controllers stay free of mapping code.
 */
fun GdprErasureResult.toDto(followUpInstructions: List<String> = emptyList()): ErasureResultDto =
    ErasureResultDto(
        userId = userId,
        requestedBy = requestedBy,
        eventsDeleted = eventsDeleted,
        projectionsDeleted = projectionsDeleted,
        categoriesDeleted = categoriesDeleted,
        keycloakDeleted = keycloakDeleted,
        occurredAt = occurredAt,
        followUpInstructions = followUpInstructions,
    )
