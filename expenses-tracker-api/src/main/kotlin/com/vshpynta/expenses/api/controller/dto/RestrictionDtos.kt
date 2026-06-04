package com.vshpynta.expenses.api.controller.dto

import com.vshpynta.expenses.api.model.gdpr.ProcessingRestriction
import com.vshpynta.expenses.api.model.gdpr.RestrictionGround
import com.vshpynta.expenses.api.model.gdpr.RestrictionRequester
import com.vshpynta.expenses.api.service.gdpr.LiftOutcome
import jakarta.validation.constraints.Size
import org.springframework.http.ResponseEntity
import java.time.Instant

/**
 * Request payload for `POST /api/users/me/restrict` and the admin twin.
 * `ground` is required; `reasonNote` is optional for the subject path
 * and recommended for the admin path.
 */
data class RestrictRequest(
    val ground: RestrictionGround,
    @field:Size(max = 1000, message = "reasonNote must be at most 1000 characters")
    val reasonNote: String? = null,
)

/**
 * Public projection of [ProcessingRestriction]. The subject's
 * `actor_id` is exposed only as `requestedBy` (the role) — the raw
 * actor identifier is internal.
 *
 * `liftAvailableAt` is server-computed (`liftNoticeSentAt + dwell`)
 * and only present when `liftNoticeSentAt` is set. Surfacing it
 * directly keeps the dwell configuration out of the API contract — a
 * client refreshing mid-flight always sees the authoritative deadline
 * without having to know the configured `gdpr.restriction.lift-dwell`.
 */
data class RestrictionDto(
    val userId: String,
    val restrictedAt: Instant,
    val ground: RestrictionGround,
    val requestedBy: RestrictionRequester,
    val reasonNote: String?,
    val liftNoticeSentAt: Instant?,
    val liftAvailableAt: Instant?,
)

fun ProcessingRestriction.toDto(liftAvailableAt: Instant? = null): RestrictionDto = RestrictionDto(
    userId = userId,
    restrictedAt = restrictedAt,
    ground = ground,
    requestedBy = requestedBy,
    reasonNote = reasonNote,
    liftNoticeSentAt = liftNoticeSentAt,
    liftAvailableAt = liftAvailableAt,
)

/**
 * Returned by `DELETE /api/users/me/restrict` on the first call — the
 * pre-lift notice has been recorded and the actual lift can happen any
 * time after `liftAvailableAt`. The second call (after that timestamp)
 * performs the lift and returns 204.
 */
data class LiftNoticeAcknowledgedDto(
    val liftNoticeSentAt: Instant,
    val liftAvailableAt: Instant,
)

/**
 * Map the service-side outcome of `requestLift(...)` to the HTTP
 * contract shared by the subject and admin lift endpoints. Lives next
 * to [LiftNoticeAcknowledgedDto] so the controllers stay free of
 * mapping code.
 */
fun LiftOutcome.toResponseEntity(): ResponseEntity<Any> = when (this) {
    is LiftOutcome.NothingToLift -> ResponseEntity.noContent().build()
    is LiftOutcome.NoticeSent -> ResponseEntity.accepted().body(
        LiftNoticeAcknowledgedDto(
            liftNoticeSentAt = liftNoticeSentAt,
            liftAvailableAt = liftAvailableAt,
        )
    )
    is LiftOutcome.Lifted -> ResponseEntity.noContent().build()
}
