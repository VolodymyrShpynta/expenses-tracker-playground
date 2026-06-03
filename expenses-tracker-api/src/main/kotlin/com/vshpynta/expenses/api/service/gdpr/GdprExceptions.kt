package com.vshpynta.expenses.api.service.gdpr

import com.vshpynta.expenses.api.model.gdpr.RestrictionGround

/**
 * Thrown by the write guard when the current user has an active Art. 18
 * restriction. Mapped to HTTP 423 Locked by
 * [com.vshpynta.expenses.api.controller.GlobalExceptionHandler].
 */
class ProcessingRestrictedException(
    val userId: String,
    val ground: RestrictionGround? = null,
) : RuntimeException("Processing is restricted under GDPR Art. 18 for user $userId")

/**
 * Thrown when an endpoint demanding a fresh login (e.g. `DELETE
 * /api/users/me`) is invoked with a JWT whose `auth_time` is older than
 * the configured freshness window. Mapped to HTTP 401.
 */
class FreshAuthenticationRequiredException(message: String) : RuntimeException(message)

/**
 * Thrown when the caller tries to lift a restriction without first
 * sending the Art. 18(3) pre-lift notice, or before the dwell window
 * has elapsed. Mapped to HTTP 409 Conflict.
 */
class RestrictionLiftPreconditionException(message: String) : RuntimeException(message)

/**
 * Thrown when the caller tries to restrict a user who is already
 * restricted, or to lift a restriction that doesn't exist. Mapped to
 * HTTP 409 Conflict.
 */
class RestrictionStateConflictException(message: String) : RuntimeException(message)
