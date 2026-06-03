package com.vshpynta.expenses.api.config.gdpr

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.annotation.EnableScheduling
import java.time.Clock

/**
 * Wires up the GDPR subsystem:
 *   * binds [GdprProperties] from `app.gdpr.*`,
 *   * enables `@Scheduled` for the inactivity retention job,
 *   * exposes a shared [Clock] bean so every GDPR collaborator
 *     (the fresh-auth check, the restriction service, the erasure
 *     service, the activity filter, the inactivity job, tests) shares
 *     one monotonic clock that can be stubbed in tests.
 *
 * Kept as its own configuration class so the scheduling concern is
 * isolated and doesn't leak into the main application class.
 */
@Configuration
@EnableScheduling
@EnableConfigurationProperties(GdprProperties::class)
class GdprConfig {

    /**
     * Defaults to system UTC. Marked [ConditionalOnMissingBean] so tests
     * can supply a frozen / mutable clock via `TestClockConfig` without
     * tripping Spring Boot 4's bean-override prohibition.
     */
    @Bean
    @ConditionalOnMissingBean(Clock::class)
    fun clock(): Clock = Clock.systemUTC()
}
