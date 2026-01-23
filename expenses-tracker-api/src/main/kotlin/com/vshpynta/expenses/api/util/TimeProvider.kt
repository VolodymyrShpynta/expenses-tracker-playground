package com.vshpynta.expenses.api.util

import org.springframework.stereotype.Component
import java.time.Clock

/**
 * General-purpose time provider utility
 *
 * Provides abstraction over time operations for easier testing
 * and consistent timestamp generation across the application
 */
@Component
class TimeProvider(
    private val clock: Clock = Clock.systemUTC()
) {

    /**
     * Returns current time in milliseconds since epoch
     */
    fun currentTimeMillis(): Long {
        return clock.millis()
    }
}
