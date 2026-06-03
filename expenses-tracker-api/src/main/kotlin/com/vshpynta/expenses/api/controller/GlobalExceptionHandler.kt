package com.vshpynta.expenses.api.controller

import com.vshpynta.expenses.api.service.gdpr.FreshAuthenticationRequiredException
import com.vshpynta.expenses.api.service.gdpr.ProcessingRestrictedException
import com.vshpynta.expenses.api.service.gdpr.RestrictionLiftPreconditionException
import com.vshpynta.expenses.api.service.gdpr.RestrictionStateConflictException
import org.slf4j.LoggerFactory
import org.springframework.dao.DataAccessException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.bind.support.WebExchangeBindException
import org.springframework.web.server.ServerWebInputException

/**
 * Global exception handler for REST controllers
 *
 * Maps domain exceptions to appropriate HTTP status codes
 * and returns structured error responses.
 */
@RestControllerAdvice
class GlobalExceptionHandler {

    companion object {
        private val logger = LoggerFactory.getLogger(GlobalExceptionHandler::class.java)
    }

    @ExceptionHandler(NoSuchElementException::class)
    fun handleNotFound(ex: NoSuchElementException): ResponseEntity<Map<String, String>> {
        logger.debug("Resource not found: {}", ex.message)
        return ResponseEntity
            .status(HttpStatus.NOT_FOUND)
            .body(mapOf("error" to (ex.message ?: "Resource not found")))
    }

    @ExceptionHandler(WebExchangeBindException::class)
    fun handleValidationErrors(ex: WebExchangeBindException): ResponseEntity<Map<String, Any>> {
        val errors = ex.bindingResult.fieldErrors.associate { it.field to (it.defaultMessage ?: "Invalid value") }
        logger.debug("Validation failed: {}", errors)
        return ResponseEntity
            .status(HttpStatus.BAD_REQUEST)
            .body(mapOf("error" to "Validation failed", "details" to errors))
    }

    /**
     * Malformed request body (e.g. invalid UUID, wrong type, malformed JSON).
     * Spring wraps Jackson decoding failures as [ServerWebInputException]; treat
     * them uniformly as client errors.
     */
    @ExceptionHandler(ServerWebInputException::class)
    fun handleMalformedInput(ex: ServerWebInputException): ResponseEntity<Map<String, String>> {
        logger.debug("Malformed request: {}", ex.reason)
        return ResponseEntity
            .status(HttpStatus.BAD_REQUEST)
            .body(mapOf("error" to (ex.reason ?: "Malformed request body")))
    }

    @ExceptionHandler(IllegalArgumentException::class)
    fun handleBadRequest(ex: IllegalArgumentException): ResponseEntity<Map<String, String>> {
        logger.debug("Bad request: {}", ex.message)
        return ResponseEntity
            .status(HttpStatus.BAD_REQUEST)
            .body(mapOf("error" to (ex.message ?: "Bad request")))
    }

    @ExceptionHandler(DataAccessException::class)
    fun handleDataAccessException(ex: DataAccessException): ResponseEntity<Map<String, String>> {
        logger.error("Database error occurred", ex)
        return ResponseEntity
            .status(HttpStatus.SERVICE_UNAVAILABLE)
            .body(mapOf("error" to "A database error occurred"))
    }

    /**
     * GDPR Art. 18 — processing restriction. Write attempts on a
     * restricted user surface as 423 Locked so the client can tell
     * "you're not authenticated" (401) and "the operation is forbidden
     * by your active restriction" (423) apart.
     */
    @ExceptionHandler(ProcessingRestrictedException::class)
    fun handleProcessingRestricted(ex: ProcessingRestrictedException): ResponseEntity<Map<String, Any?>> {
        logger.info("Blocked write under Art. 18 restriction for user {}", ex.userId)
        val body = mapOf(
            "error" to (ex.message ?: "Processing restricted under GDPR Art. 18"),
            "gdprArticle" to "18",
            "ground" to ex.ground?.name,
        )
        return ResponseEntity.status(HttpStatus.LOCKED).body(body)
    }

    /**
     * Destructive endpoints (account deletion, restriction lifecycle)
     * require a recent `auth_time`. Reject with 401 + a hint so the
     * client knows to re-prompt for credentials rather than silently
     * refresh the token.
     */
    @ExceptionHandler(FreshAuthenticationRequiredException::class)
    fun handleFreshAuthRequired(ex: FreshAuthenticationRequiredException): ResponseEntity<Map<String, String>> {
        logger.info("Fresh re-authentication required: {}", ex.message)
        return ResponseEntity
            .status(HttpStatus.UNAUTHORIZED)
            .header("WWW-Authenticate", """Bearer realm="gdpr-sensitive", error="insufficient_user_authentication"""")
            .body(mapOf("error" to (ex.message ?: "Fresh re-authentication required")))
    }

    @ExceptionHandler(RestrictionLiftPreconditionException::class, RestrictionStateConflictException::class)
    fun handleRestrictionConflict(ex: RuntimeException): ResponseEntity<Map<String, String>> {
        logger.info("Restriction lifecycle conflict: {}", ex.message)
        return ResponseEntity
            .status(HttpStatus.CONFLICT)
            .body(mapOf("error" to (ex.message ?: "Restriction lifecycle conflict")))
    }

    @ExceptionHandler(Exception::class)
    fun handleGenericException(ex: Exception): ResponseEntity<Map<String, String>> {
        logger.error("Unexpected error occurred", ex)
        return ResponseEntity
            .status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(mapOf("error" to "An unexpected error occurred"))
    }
}
