package com.vshpynta.expenses.api.config

import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpMethod
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity
import org.springframework.security.config.web.server.ServerHttpSecurity
import org.springframework.security.web.server.SecurityWebFilterChain
import org.springframework.web.cors.CorsConfiguration
import org.springframework.web.cors.reactive.CorsConfigurationSource
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource

/**
 * OAuth2 Resource Server security configuration.
 * Validates JWT tokens issued by Keycloak and extracts the user ID from the `sub` claim.
 */
@Configuration
@EnableWebFluxSecurity
class SecurityConfig(
    @Value($$"${app.cors.allowed-origins}") private val allowedOriginsCsv: String,
    @Value($$"${app.cors.allowed-origin-patterns:}") private val allowedOriginPatternsCsv: String,
) {

    @Bean
    fun securityFilterChain(http: ServerHttpSecurity): SecurityWebFilterChain {
        return http
            .cors { it.configurationSource(corsConfigurationSource()) }
            .csrf { it.disable() }
            .authorizeExchange { exchanges ->
                exchanges
                    .pathMatchers("/actuator/health", "/actuator/health/**").permitAll()
                    .pathMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                    .anyExchange().authenticated()
            }
            .oauth2ResourceServer { it.jwt { } }
            .build()
    }

    @Bean
    fun corsConfigurationSource(): CorsConfigurationSource {
        val origins = allowedOriginsCsv.split(',').map { it.trim() }.filter { it.isNotEmpty() }
        val originPatterns = allowedOriginPatternsCsv.split(',').map { it.trim() }.filter { it.isNotEmpty() }
        val config = CorsConfiguration().apply {
            origins.takeIf { it.isNotEmpty() }?.let { allowedOrigins = it }
            originPatterns.takeIf { it.isNotEmpty() }?.let { allowedOriginPatterns = it }
            allowedMethods = listOf("GET", "POST", "PUT", "DELETE", "OPTIONS")
            allowedHeaders = listOf("*")
            allowCredentials = true
            maxAge = 3600
        }
        return UrlBasedCorsConfigurationSource().apply {
            registerCorsConfiguration("/**", config)
        }
    }
}
