package com.vshpynta.expenses.api.controller

import com.vshpynta.expenses.api.controller.dto.AdminErasureRequest
import com.vshpynta.expenses.api.controller.dto.AdminRestrictRequest
import com.vshpynta.expenses.api.controller.dto.ErasureResultDto
import com.vshpynta.expenses.api.controller.dto.RestrictionDto
import com.vshpynta.expenses.api.controller.dto.toDto
import com.vshpynta.expenses.api.controller.dto.toResponseEntity
import com.vshpynta.expenses.api.model.gdpr.ErasureRequester
import com.vshpynta.expenses.api.model.gdpr.RestrictionRequester
import com.vshpynta.expenses.api.service.auth.UserContextService
import com.vshpynta.expenses.api.service.gdpr.GdprErasureService
import com.vshpynta.expenses.api.service.gdpr.ProcessingRestrictionService
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

/**
 * Operator-facing GDPR endpoints. Requires the `gdpr-admin` realm role.
 * Used for cases the user cannot self-serve: locked accounts, identity
 * verified out-of-band, court orders, etc.
 *
 * Mounted under `/api/admin/users/{userId}`; the SecurityConfig filter
 * chain enforces the role at the path level so individual handlers
 * don't have to repeat the check.
 *
 * Audit rows record the admin's subject as `actor_id` (hashed) so it
 * remains possible to trace who performed an operator-driven action
 * without retaining the data subject's identifier after erasure.
 */
@RestController
@RequestMapping("/api/admin/users/{userId}")
class AdminUserController(
    private val userContextService: UserContextService,
    private val erasureService: GdprErasureService,
    private val restrictionService: ProcessingRestrictionService,
) {

    /**
     * Operator-driven erasure. `reasonNote` is required so the audit
     * row records *why* an admin reached past the user's self-service
     * path — useful for both internal review and regulator queries.
     */
    @DeleteMapping
    suspend fun eraseUser(
        @PathVariable userId: String,
        @Valid @RequestBody body: AdminErasureRequest,
    ): ErasureResultDto {
        val adminId = userContextService.currentUserId()
        return erasureService.eraseUser(
            userId = userId,
            requestedBy = ErasureRequester.ADMIN,
            actorId = adminId,
            reasonNote = body.reasonNote,
        ).toDto()
    }

    @GetMapping("/restriction")
    suspend fun getRestriction(@PathVariable userId: String): ResponseEntity<RestrictionDto> {
        val restriction = restrictionService.findRestriction(userId)
        return restriction?.let { ResponseEntity.ok(it.toDto()) }
            ?: ResponseEntity.noContent().build()
    }

    @PostMapping("/restrict")
    @ResponseStatus(HttpStatus.CREATED)
    suspend fun restrictUser(
        @PathVariable userId: String,
        @Valid @RequestBody request: AdminRestrictRequest,
    ): RestrictionDto {
        val adminId = userContextService.currentUserId()
        return restrictionService.restrict(
            userId = userId,
            ground = request.ground,
            requestedBy = RestrictionRequester.ADMIN,
            actorId = adminId,
            reasonNote = request.reasonNote,
        ).toDto()
    }

    /**
     * Two-step lift (matches the user endpoint): first call sends the
     * pre-lift notice, second call (after dwell) performs the lift.
     */
    @DeleteMapping("/restrict")
    suspend fun liftRestriction(@PathVariable userId: String): ResponseEntity<Any> {
        val adminId = userContextService.currentUserId()
        return restrictionService.requestLift(
            userId = userId,
            requestedBy = RestrictionRequester.ADMIN,
            actorId = adminId,
        ).toResponseEntity()
    }
}
