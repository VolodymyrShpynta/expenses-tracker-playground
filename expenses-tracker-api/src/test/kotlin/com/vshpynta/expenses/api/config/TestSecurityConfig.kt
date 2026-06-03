package com.vshpynta.expenses.api.config

import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.jwt.ReactiveJwtDecoder
import reactor.core.publisher.Mono
import java.time.Clock

/**
 * Test security configuration that provides a mock JWT decoder.
 * Avoids needing a running Keycloak instance during tests.
 *
 * The decoder switches behaviour on the bearer-token *string value* so
 * tests can exercise different identity / freshness / role profiles
 * without juggling multiple `WebTestClient` instances:
 *
 *   * [TOKEN_DEFAULT]       — subject = [TEST_USER_ID], fresh `auth_time`, no roles
 *   * [TOKEN_ADMIN]         — subject = [ADMIN_USER_ID], fresh `auth_time`, `gdpr-admin` realm role
 *   * [TOKEN_STALE]         — subject = [TEST_USER_ID], `auth_time` 1 hour ago (fails fresh-auth)
 *   * [TOKEN_NO_AUTH_TIME]  — subject = [TEST_USER_ID], missing `auth_time` claim
 *
 * Any other token value is treated as [TOKEN_DEFAULT]. Tests override
 * the `Authorization` header per-request via
 * `WebTestClient.header(HttpHeaders.AUTHORIZATION, "Bearer $token")`.
 *
 * `auth_time` is stamped from the injected [Clock] bean so tests that
 * also import `TestClockConfig` (frozen time) see a consistent "now".
 */
@TestConfiguration
class TestSecurityConfig {

    companion object {
        const val TEST_USER_ID = "test-user-id"
        const val ADMIN_USER_ID = "test-admin-id"

        const val TOKEN_DEFAULT = "test-token"
        const val TOKEN_ADMIN = "test-token-admin"
        const val TOKEN_STALE = "test-token-stale"
        const val TOKEN_NO_AUTH_TIME = "test-token-no-auth-time"

        private val STALE_AUTH_AGE = java.time.Duration.ofHours(1)
    }

    @Bean
    fun reactiveJwtDecoder(clock: Clock): ReactiveJwtDecoder {
        return ReactiveJwtDecoder { token ->
            val now = clock.instant()
            val builder = Jwt.withTokenValue(token)
                .header("alg", "none")
                .claim("preferred_username", "testuser")
                .issuedAt(now)
                .expiresAt(now.plusSeconds(3600))

            val configured = when (token) {
                TOKEN_ADMIN -> builder
                    .subject(ADMIN_USER_ID)
                    .claim("auth_time", now.epochSecond)
                    .claim("realm_access", mapOf("roles" to listOf("gdpr-admin")))
                TOKEN_STALE -> builder
                    .subject(TEST_USER_ID)
                    .claim("auth_time", now.minus(STALE_AUTH_AGE).epochSecond)
                TOKEN_NO_AUTH_TIME -> builder
                    .subject(TEST_USER_ID)
                else -> builder
                    .subject(TEST_USER_ID)
                    .claim("auth_time", now.epochSecond)
            }
            Mono.just(configured.build())
        }
    }
}
