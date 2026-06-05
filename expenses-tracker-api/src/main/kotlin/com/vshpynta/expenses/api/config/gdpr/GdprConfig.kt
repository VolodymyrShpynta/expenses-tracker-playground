package com.vshpynta.expenses.api.config.gdpr

import io.r2dbc.postgresql.PostgresqlConnectionFactoryProvider
import io.r2dbc.spi.ConnectionFactories
import io.r2dbc.spi.ConnectionFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.boot.r2dbc.autoconfigure.R2dbcConnectionDetails
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

    /**
     * Dedicated, **non-pooled** [ConnectionFactory] used exclusively by
     * [SessionRevocationListener] for PostgreSQL `LISTEN/NOTIFY`.
     *
     * **Why a second factory instead of reusing the autowired one.**
     * Spring Boot's primary `ConnectionFactory` is a `ConnectionPool`
     * wrapping `PostgresqlConnectionFactory`. Pool-leased connections
     * cannot host a long-lived `LISTEN` subscription: returning a
     * borrowed handle drops the subscription, and holding one forever
     * silently steals a pool slot (and still doesn't survive the
     * underlying socket dropping, because the pool can't replace a
     * connection we never release). Building a separate, intentionally
     * non-pooled factory from the same [R2dbcConnectionDetails] keeps
     * URL / credentials in one place, declares the intent explicitly
     * in bean wiring, and removes the need for the listener to
     * reflectively unwrap the pool layer.
     *
     * **Why `R2dbcConnectionDetails` rather than `R2dbcProperties`.**
     * `R2dbcConnectionDetails` is Spring Boot's unified abstraction
     * for connection metadata — it resolves to static `spring.r2dbc.*`
     * values in production *and* to Testcontainers / Docker Compose
     * dynamic values in tests (via `@ServiceConnection`). Reading
     * `R2dbcProperties` directly would break the test harness because
     * the auto-configured properties bean still holds the static
     * config even when `@ServiceConnection` overrides the live
     * `ConnectionFactory`.
     *
     * **Extras vs. the primary factory:**
     *   * `applicationName=expenses-tracker-listener` — surfaces this
     *     connection as a separate row in `pg_stat_activity`, so an
     *     operator investigating a long-running connection can tell it
     *     apart from the request-path pool at a glance.
     *   * `tcpKeepAlive=true` — r2dbc-postgresql defaults this off. For
     *     a connection meant to live for days behind a cloud NAT or
     *     load balancer, that's the difference between detecting a
     *     silently-dropped socket within the keepalive window vs. only
     *     finding out on the next NOTIFY (which may never come). The
     *     reconnect loop on the listener then takes over and rebuilds
     *     the cache from a fresh snapshot.
     */
    @Bean(name = ["listenConnectionFactory"])
    fun listenConnectionFactory(connectionDetails: R2dbcConnectionDetails): ConnectionFactory {
        val options = connectionDetails.connectionFactoryOptions.mutate()
            .option(PostgresqlConnectionFactoryProvider.APPLICATION_NAME, "expenses-tracker-listener")
            .option(PostgresqlConnectionFactoryProvider.TCP_KEEPALIVE, true)
            .build()
        return ConnectionFactories.get(options)
    }
}
