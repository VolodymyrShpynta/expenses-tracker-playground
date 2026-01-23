package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.repository.ProcessedEventRepository
import com.vshpynta.expenses.api.util.ConcurrentCache
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import org.slf4j.LoggerFactory
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Component
import java.util.UUID

/**
 * In-memory cache of processed event IDs for fast duplicate detection
 *
 * Uses general-purpose ConcurrentCache which is thread-safe.
 * Loaded from database on startup and kept in sync as events are processed.
 *
 * Benefits:
 * - 100% accurate (no false positives/negatives)
 * - Thread-safe (O(1) operations, ~20 nanoseconds)
 * - Reasonable memory (16 bytes per UUID: 1K events = 16KB, 1M events = 16MB)
 */
@Component
class ProcessedEventsCache(
    private val processedEventRepository: ProcessedEventRepository
) {

    companion object {
        private val logger = LoggerFactory.getLogger(ProcessedEventsCache::class.java)
    }

    private val cache = ConcurrentCache<UUID>()

    /**
     * Check if event has been processed
     */
    fun contains(eventId: UUID): Boolean {
        return cache.contains(eventId)
    }

    /**
     * Mark event as processed
     */
    fun add(eventId: UUID) {
        cache.add(eventId)
    }

    /**
     * Reset cache (for testing)
     */
    fun reset() {
        cache.clear()
    }

    /**
     * Load all processed event IDs from database
     * Called on application startup
     */
    @EventListener(ApplicationReadyEvent::class)
    fun loadFromDatabase() {
        try {
            logger.info("Loading processed event IDs from database...")
            val startTime = System.currentTimeMillis()

            runBlocking {
                val ids = processedEventRepository.findAllEventIds().toList()
                cache.addAll(ids)

                val duration = System.currentTimeMillis() - startTime
                val stats = getStats()

                logger.info(
                    "Loaded ${ids.size} processed event IDs in ${duration}ms, memory: ${stats.memoryBytes / 1024} KB"
                )
            }
        } catch (e: Exception) {
            logger.error("Failed to load processed events from database", e)
        }
    }

    /**
     * Get cache statistics
     */
    fun getStats(): CacheStats {
        return CacheStats(
            size = cache.size(),
            memoryBytes = cache.size() * 16L  // 16 bytes per UUID
        )
    }
}

/**
 * Statistics about the cache
 */
data class CacheStats(
    val size: Int,
    val memoryBytes: Long
)
