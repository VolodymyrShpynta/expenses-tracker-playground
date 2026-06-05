package com.vshpynta.expenses.api.config.gdpr

import com.vshpynta.expenses.api.service.gdpr.SessionRevocationService
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.security.core.context.ReactiveSecurityContextHolder
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.server.ServerWebExchange
import org.springframework.web.server.WebFilter
import org.springframework.web.server.WebFilterChain
import reactor.core.publisher.Mono
import java.nio.charset.StandardCharsets

/**
 * Rejects any authenticated request whose JWT was issued before the
 * user's most recent session revocation.
 *
 * **Placement in the filter chain.** Wired into the Spring Security
 * chain by [com.vshpynta.expenses.api.config.SecurityConfig] with
 * `addFilterAfter(..., SecurityWebFiltersOrder.AUTHENTICATION)` — i.e.
 * *after* authentication (so the JWT principal is already on the
 * reactor context when [filter] runs) and *before* authorization (so
 * a revoked session short-circuits with 401 even on paths the
 * authorization rules would otherwise have permitted). Registered
 * manually rather than as a `@Component` `WebFilter` to avoid the
 * double-registration that would otherwise run it once at top-level
 * (no security context yet) and once inside the chain.
 *
 * **Why 401 (not 410, not 403).** The JWT is cryptographically valid,
 * but the *session* it represents has been intentionally terminated by
 * the user, an admin, or the erasure cascade. RFC 6750 maps "the
 * token is expired, revoked, malformed, or invalid for other reasons"
 * to `401`; 410 would imply the resource itself is gone, and 403
 * would imply "wrong permissions" — neither matches.
 *
 * **Why an explicit JSON body.** The SPA's `fetchWithAuth` wrapper
 * inspects the `error` field to distinguish "session was killed
 * server-side, redirect to login" from "token couldn't be refreshed,
 * try again". Without the body, both look the same to the client.
 *
 * **Anonymous and pre-auth requests pass through unchanged.** The
 * filter only acts when an authenticated JWT principal is present;
 * actuator probes and public endpoints are untouched.
 */
class SessionRevocationFilter(
    private val revocations: SessionRevocationService,
) : WebFilter {

    companion object {
        private val logger = LoggerFactory.getLogger(SessionRevocationFilter::class.java)
        private const val REVOKED_BODY =
            """{"error":"session_revoked","message":"This session has been signed out remotely. Please sign in again."}"""
        private val REVOKED_BODY_BYTES = REVOKED_BODY.toByteArray(StandardCharsets.UTF_8)
    }

    override fun filter(exchange: ServerWebExchange, chain: WebFilterChain): Mono<Void> {
        return shouldRejectAsRevoked()
            .flatMap { revoked ->
                if (revoked) writeRevokedResponse(exchange)
                else chain.filter(exchange)
            }
    }

    private fun shouldRejectAsRevoked(): Mono<Boolean> {
        return ReactiveSecurityContextHolder.getContext()
            .map { ctx ->
                val token = (ctx.authentication as? JwtAuthenticationToken)?.token
                val userId = token?.subject
                val issuedAt = token?.issuedAt
                if (userId.isNullOrBlank() || issuedAt == null) {
                    false
                } else {
                    // Pure in-memory cache lookup — see SessionRevocationService
                    // for why a miss is authoritative ("not revoked") and why
                    // the cutoff is set 1s past the revocation instant.
                    val cutoff = revocations.findRevokedBeforeIat(userId)
                    cutoff != null && issuedAt.isBefore(cutoff)
                }
            }
            // No security context (anonymous / actuator) → nothing to revoke.
            .defaultIfEmpty(false)
    }

    private fun writeRevokedResponse(exchange: ServerWebExchange): Mono<Void> {
        logger.info("Rejecting request with revoked session token")
        val response = exchange.response.apply {
            statusCode = HttpStatus.UNAUTHORIZED
            headers.contentType = MediaType.APPLICATION_JSON
        }
        val buffer = response.bufferFactory().wrap(REVOKED_BODY_BYTES)
        return response.writeWith(Mono.just(buffer))
    }
}
