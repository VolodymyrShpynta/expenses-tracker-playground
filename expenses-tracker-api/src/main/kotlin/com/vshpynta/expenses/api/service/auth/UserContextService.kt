package com.vshpynta.expenses.api.service.auth

import kotlinx.coroutines.reactive.awaitFirst
import org.springframework.security.core.context.ReactiveSecurityContextHolder
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.stereotype.Service

/**
 * Extracts the authenticated user ID from the reactive security context.
 * The user ID is the `sub` (subject) claim from the Keycloak JWT.
 */
@Service
class UserContextService {

    /**
     * Returns the current authenticated user's ID (Keycloak subject UUID).
     * Must be called within a reactive/coroutine context with an authenticated request.
     */
    suspend fun currentUserId(): String {
        val authentication = ReactiveSecurityContextHolder.getContext().awaitFirst().authentication
            ?: throw IllegalStateException("No authentication found in security context")
        val jwt = authentication.principal as Jwt
        return jwt.subject
    }
}
