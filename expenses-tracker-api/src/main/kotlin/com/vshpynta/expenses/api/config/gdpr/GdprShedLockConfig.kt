package com.vshpynta.expenses.api.config.gdpr

import net.javacrumbs.shedlock.core.LockProvider
import net.javacrumbs.shedlock.provider.jdbctemplate.JdbcTemplateLockProvider
import net.javacrumbs.shedlock.spring.annotation.EnableSchedulerLock
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.jdbc.core.JdbcTemplate
import javax.sql.DataSource

/**
 * Wires ShedLock into the GDPR subsystem so `@Scheduled` jobs (currently
 * [com.vshpynta.expenses.api.service.gdpr.InactivityRetentionJob]) are
 * serialized across HA replicas. Without this, every replica would fire
 * the cron concurrently — sending duplicate warning emails and producing
 * one audit row per replica per erased user.
 *
 * The lock is stored in the `shedlock` table (see `V3__Add_gdpr_tables.sql`)
 * over the *Flyway* JDBC datasource — that connection pool exists already
 * and JDBC is what ShedLock requires. The application's primary R2DBC
 * datasource is intentionally not used because ShedLock's
 * `LockProvider` API is blocking-JDBC by design.
 *
 * Gated by the same `app.gdpr.inactivity.enabled` switch that controls
 * the job itself: when the job isn't constructed, the lock infrastructure
 * isn't either, so dev/test runs with inactivity disabled pay nothing.
 *
 * `defaultLockAtMostFor = PT15M` is the safety release if the JVM dies
 * mid-tick. Per-method overrides on `@SchedulerLock` take precedence.
 */
@Configuration
@ConditionalOnProperty(prefix = "app.gdpr.inactivity", name = ["enabled"], havingValue = "true")
@EnableSchedulerLock(defaultLockAtMostFor = "PT15M")
class GdprShedLockConfig {

    /**
     * Reuses the Flyway JDBC datasource (already wired in
     * [com.vshpynta.expenses.api.config.FlywayConfig]). The `shedlock`
     * table is created by `V3__Add_gdpr_tables.sql` on the same
     * datasource, so no extra DDL bootstrap is needed at runtime
     * (`usingDbTime` keeps the lock clock authoritative on the DB to
     * avoid trusting potentially-skewed application clocks).
     */
    @Bean
    fun lockProvider(flywayDataSource: DataSource): LockProvider =
        JdbcTemplateLockProvider(
            JdbcTemplateLockProvider.Configuration.builder()
                .withJdbcTemplate(JdbcTemplate(flywayDataSource))
                .usingDbTime()
                .build()
        )
}
