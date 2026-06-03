package com.vshpynta.expenses.api.config

import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.convert.converter.Converter
import org.springframework.http.HttpMethod
import org.springframework.security.authentication.AbstractAuthenticationToken
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity
import org.springframework.security.config.web.server.ServerHttpSecurity
import org.springframework.security.core.GrantedAuthority
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.ReactiveJwtAuthenticationConverter
import org.springframework.security.web.server.SecurityWebFilterChain
import org.springframework.web.cors.CorsConfiguration
import org.springframework.web.cors.reactive.CorsConfigurationSource
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource
import reactor.core.publisher.Flux
import reactor.core.publisher.Mono

/**
 * OAuth2 Resource Server security configuration.
 * Validates JWT tokens issued by Keycloak, extracts the user ID from the `sub` claim,
 * and lifts Keycloak realm roles from the `realm_access.roles` claim into Spring
 * `GrantedAuthority` values prefixed with `ROLE_` — so `hasRole('gdpr-admin')` works
 * as expected on the `api/admin` paths used by the GDPR admin endpoints.
 */
@Configuration
@EnableWebFluxSecurity
class SecurityConfig(
    @Value($$"${app.cors.allowed-origins}") private val allowedOriginsCsv: String,
    @Value($$"${app.cors.allowed-origin-patterns:}") private val allowedOriginPatternsCsv: String,
) {

    companion object {
        private const val GDPR_ADMIN_ROLE = "gdpr-admin"
    }

    @Bean
    fun securityFilterChain(http: ServerHttpSecurity): SecurityWebFilterChain {
        return http
            .cors { it.configurationSource(corsConfigurationSource()) }
            .csrf { it.disable() }
            .authorizeExchange { exchanges ->
                exchanges
                    .pathMatchers("/actuator/health", "/actuator/health/**").permitAll()
                    .pathMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                    .pathMatchers("/api/admin/**").hasRole(GDPR_ADMIN_ROLE)
                    .anyExchange().authenticated()
            }
            .oauth2ResourceServer { resource ->
                resource.jwt { it.jwtAuthenticationConverter(reactiveJwtAuthenticationConverter()) }
            }
            .build()
    }

    /**
     * Bridges the Spring Security default JWT converter into the
     * reactive resource-server pipeline so realm roles become Spring
     * `ROLE_*` authorities.
     */
    private fun reactiveJwtAuthenticationConverter(): Converter<Jwt, Mono<AbstractAuthenticationToken>> {
        val converter = ReactiveJwtAuthenticationConverter()
        converter.setJwtGrantedAuthoritiesConverter { jwt ->
            Flux.fromIterable(extractRealmAuthorities(jwt))
        }
        return Converter { jwt -> converter.convert(jwt).map { it } }
    }

    /**
     * Keycloak issues realm roles under `realm_access.roles`. Lifting
     * them to `ROLE_<name>` authorities lets `hasRole('gdpr-admin')`
     * work without additional configuration on every endpoint.
     */
    @Suppress("UNCHECKED_CAST")
    private fun extractRealmAuthorities(jwt: Jwt): Collection<GrantedAuthority> {
        val realmAccess = jwt.claims["realm_access"] as? Map<String, Any?> ?: return emptyList()
        val roles = realmAccess["roles"] as? Collection<String> ?: return emptyList()
        return roles.map { SimpleGrantedAuthority("ROLE_$it") }
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
