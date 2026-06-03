package com.vshpynta.expenses.api.config

import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.concurrent.atomic.AtomicReference

/**
 * Test helper for time-sensitive GDPR code (lift dwell, fresh-auth
 * window, inactivity warning + grace). Overrides the [Clock] bean from
 * production [com.vshpynta.expenses.api.config.gdpr.GdprConfig] with a
 * mutable clock backed by an [AtomicReference]. Tests advance time via
 * [advanceTo] / [advanceBy] instead of sleeping.
 *
 * Default time is 2026-06-01T00:00:00Z. Wall-clock-sensitive tests
 * should reset to a known instant in `@BeforeEach`.
 */
@TestConfiguration
class TestClockConfig {

    val current: AtomicReference<Instant> =
        AtomicReference(Instant.parse("2026-06-01T00:00:00Z"))

    fun advanceTo(instant: Instant) {
        current.set(instant)
    }

    fun advanceBy(duration: java.time.Duration) {
        current.updateAndGet { it.plus(duration) }
    }

    @Bean
    @Primary
    fun clock(): Clock = object : Clock() {
        override fun getZone(): ZoneId = ZoneOffset.UTC
        override fun withZone(zone: ZoneId?): Clock = this
        override fun instant(): Instant = current.get()
    }
}
