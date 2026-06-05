package com.vshpynta.expenses.api.controller

import com.vshpynta.expenses.api.controller.dto.ErasureResultDto
import com.vshpynta.expenses.api.controller.dto.RestrictRequest
import com.vshpynta.expenses.api.controller.dto.RestrictionDto
import com.vshpynta.expenses.api.controller.dto.toDto
import com.vshpynta.expenses.api.controller.dto.toResponseEntity
import com.vshpynta.expenses.api.model.gdpr.ErasureRequester
import com.vshpynta.expenses.api.model.gdpr.RestrictionRequester
import com.vshpynta.expenses.api.model.gdpr.RevokedBy
import com.vshpynta.expenses.api.service.auth.UserContextService
import com.vshpynta.expenses.api.service.gdpr.FreshAuthenticationService
import com.vshpynta.expenses.api.service.gdpr.GdprErasureService
import com.vshpynta.expenses.api.service.gdpr.KeycloakAdminClient
import com.vshpynta.expenses.api.service.gdpr.ProcessingRestrictionService
import com.vshpynta.expenses.api.service.gdpr.SessionRevocationService
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

/**
 * Data-subject-facing GDPR endpoints. All operations are scoped to the
 * caller's own JWT subject — no role required beyond ordinary
 * authentication. Destructive operations additionally require a fresh
 * `auth_time`.
 *
 * Article alignment:
 *   * `DELETE /api/users/me`             — Art. 17 (erasure)
 *   * `GET    /api/users/me/restriction` — Art. 15 over restriction state
 *   * `POST   /api/users/me/restrict`    — Art. 18 (restrict)
 *   * `DELETE /api/users/me/restrict`    — Art. 18 lift (two-step)
 */
@RestController
@RequestMapping("/api/users/me")
class UserAccountController(
    private val userContextService: UserContextService,
    private val freshAuth: FreshAuthenticationService,
    private val erasureService: GdprErasureService,
    private val restrictionService: ProcessingRestrictionService,
    private val sessionRevocations: SessionRevocationService,
    private val keycloakAdmin: KeycloakAdminClient,
) {

    /**
     * Art. 17 — Right to erasure. Returns 200 with the cascade summary
     * rather than 204, so the client can render a "what was deleted"
     * confirmation screen and surface the follow-up instructions that
     * the backend cannot perform itself (mobile sync file, browser
     * `localStorage`).
     */
    @DeleteMapping
    suspend fun deleteSelf(): ErasureResultDto {
        freshAuth.requireFresh()
        val userId = userContextService.currentUserId()
        val result = erasureService.eraseUser(
            userId = userId,
            requestedBy = ErasureRequester.SUBJECT,
            actorId = userId,
        )
        return result.toDto(followUpInstructions = followUpInstructionsForSubject(result.keycloakDeleted))
    }

    @GetMapping("/restriction")
    suspend fun getRestriction(): ResponseEntity<RestrictionDto> {
        val userId = userContextService.currentUserId()
        return restrictionService.findRestriction(userId)
            ?.let { ResponseEntity.ok(it) }
            ?: ResponseEntity.noContent().build()
    }

    @PostMapping("/restrict")
    @ResponseStatus(HttpStatus.CREATED)
    suspend fun restrictSelf(@Valid @RequestBody request: RestrictRequest): RestrictionDto {
        freshAuth.requireFresh()
        val userId = userContextService.currentUserId()
        return restrictionService.restrict(
            userId = userId,
            ground = request.ground,
            requestedBy = RestrictionRequester.SUBJECT,
            actorId = userId,
            reasonNote = request.reasonNote,
        ).toDto()
    }

    /**
     * Two-step lift:
     *   1. First call — sends the Art. 18(3) pre-lift notice, returns
     *      202 with the [com.vshpynta.expenses.api.controller.dto.LiftNoticeAcknowledgedDto]
     *      telling the client when the actual lift becomes available.
     *   2. Second call after that timestamp — performs the lift and
     *      returns 204.
     *
     * The dwell between the two calls is what gives the duty teeth.
     */
    @DeleteMapping("/restrict")
    suspend fun liftSelf(): ResponseEntity<Any> {
        freshAuth.requireFresh()
        val userId = userContextService.currentUserId()
        return restrictionService.requestLift(
            userId = userId,
            requestedBy = RestrictionRequester.SUBJECT,
            actorId = userId,
        ).toResponseEntity()
    }

    /**
     * "Sign me out everywhere." Records a session-revocation row so
     * the resource server rejects any already-issued access token on
     * the next request, then best-effort terminates Keycloak-side
     * sessions and refresh tokens. Idempotent — calling repeatedly
     * just refreshes the cutoff. Returns 204; the SPA reacts to the
     * subsequent 401 + `session_revoked` body on its next request.
     */
    @PostMapping("/sessions/revoke")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    suspend fun revokeMySessions() {
        freshAuth.requireFresh()
        val userId = userContextService.currentUserId()
        sessionRevocations.revokeAllSessions(userId, RevokedBy.SUBJECT)
        keycloakAdmin.logoutAllSessions(userId)
    }

    /**
     * Follow-ups the backend cannot perform itself. Surfaced to the
     * client verbatim so the UI can render them as a checklist on the
     * post-erasure screen.
     */
    private fun followUpInstructionsForSubject(keycloakDeleted: Boolean): List<String> = buildList {
        if (!keycloakDeleted) {
            add(
                "Your identity-provider account (Keycloak) was not deleted automatically. " +
                    "Contact the operator if you also want the login account removed."
            )
        }
        add(
            "Clear your browser's local storage for this site to remove cached display " +
                "preferences."
        )
    }
}
