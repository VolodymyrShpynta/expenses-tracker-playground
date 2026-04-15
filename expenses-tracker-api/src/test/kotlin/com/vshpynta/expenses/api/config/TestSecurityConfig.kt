package com.vshpynta.expenses.api.config

import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.jwt.ReactiveJwtDecoder
import reactor.core.publisher.Mono
import java.time.Instant

/**
 * Test security configuration that provides a mock JWT decoder.
 * Avoids needing a running Keycloak instance during tests.
 */
@TestConfiguration
class TestSecurityConfig {

    companion object {
        const val TEST_USER_ID = "test-user-id"
    }

    @Bean
    fun reactiveJwtDecoder(): ReactiveJwtDecoder {
        return ReactiveJwtDecoder { token ->
            val jwt = Jwt.withTokenValue(token)
                .header("alg", "none")
                .subject(TEST_USER_ID)
                .claim("preferred_username", "testuser")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(3600))
                .build()
            Mono.just(jwt)
        }
    }
}
