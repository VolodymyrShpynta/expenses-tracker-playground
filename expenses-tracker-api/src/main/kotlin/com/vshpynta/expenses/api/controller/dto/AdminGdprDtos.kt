package com.vshpynta.expenses.api.controller.dto

import com.vshpynta.expenses.api.model.gdpr.RestrictionGround
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

/**
 * Request payload for `DELETE /api/admin/users/{userId}`.
 *
 * `reasonNote` is required (and non-blank) on the admin path so the
 * audit row records *why* an operator reached past the user's
 * self-service erasure — useful for both internal review and regulator
 * queries.
 */
data class AdminErasureRequest(
    @field:NotBlank(message = "reasonNote is required for admin erasure")
    @field:Size(max = 1000, message = "reasonNote must be at most 1000 characters")
    val reasonNote: String,
)

/**
 * Request payload for `POST /api/admin/users/{userId}/restrict`.
 *
 * Mirrors [RestrictRequest] but makes `reasonNote` mandatory: an
 * admin-applied restriction should always record the operator's
 * justification (e.g. court order reference). The subject-facing
 * endpoint keeps `reasonNote` optional via the looser [RestrictRequest].
 */
data class AdminRestrictRequest(
    val ground: RestrictionGround,
    @field:NotBlank(message = "reasonNote is required for admin-applied restrictions")
    @field:Size(max = 1000, message = "reasonNote must be at most 1000 characters")
    val reasonNote: String,
)
