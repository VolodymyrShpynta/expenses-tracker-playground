package com.vshpynta.expenses.api.service.gdpr

import com.vshpynta.expenses.api.config.gdpr.GdprProperties
import kotlinx.coroutines.reactive.awaitFirst
import org.springframework.security.core.context.ReactiveSecurityContextHolder
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Duration
import java.time.Instant

/**
 * Enforces the "fresh re-authentication" requirement on destructive
 * endpoints (account erasure, restriction lifecycle changes).
 *
 * GDPR doesn't mandate fresh auth, but for endpoints that are
 * irreversible an accidentally-shared session must not be enough — the
 * user has to have just typed their password. The OAuth2 / OIDC
 * `auth_time` claim is the standard hook for this.
 */
@Service
class FreshAuthenticationService(
    private val properties: GdprProperties,
    private val clock: Clock,
) {

    /**
     * Throws [FreshAuthenticationRequiredException] if the JWT's
     * `auth_time` claim is older than the configured window or missing.
     */
    suspend fun requireFresh() {
        val jwt = currentJwt()
        val authTimeSeconds = jwt.claims["auth_time"] as? Number
            ?: throw FreshAuthenticationRequiredException(
                "JWT is missing the 'auth_time' claim; fresh re-authentication is required"
            )
        val authTime = Instant.ofEpochSecond(authTimeSeconds.toLong())
        val now = clock.instant()
        val age = Duration.between(authTime, now)
        if (age > properties.freshAuth.maxAge || age.isNegative) {
            throw FreshAuthenticationRequiredException(
                "Re-authentication required: last login was $age ago (limit ${properties.freshAuth.maxAge})"
            )
        }
    }

    private suspend fun currentJwt(): Jwt {
        val authentication = ReactiveSecurityContextHolder.getContext().awaitFirst().authentication
            ?: throw IllegalStateException("No authentication found in security context")
        return authentication.principal as Jwt
    }
}
