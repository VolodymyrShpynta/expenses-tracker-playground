package com.vshpynta.expenses.api.util

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Unit tests for [ConcurrentCache] including the thread-safety contract:
 * concurrent `add` from many threads must not lose elements.
 */
class ConcurrentCacheTest {

    @Test
    fun `should report contains true only for added elements`() {
        // Given
        val cache = ConcurrentCache<String>()

        // When
        cache.add("a")
        cache.add("b")

        // Then
        assertThat(cache.contains("a")).isTrue()
        assertThat(cache.contains("b")).isTrue()
        assertThat(cache.contains("c")).isFalse()
    }

    @Test
    fun `should report add true on first insertion and false on duplicate`() {
        // Given
        val cache = ConcurrentCache<Int>()

        // When / Then
        assertThat(cache.add(1)).isTrue()
        assertThat(cache.add(1)).isFalse()
        assertThat(cache.size()).isEqualTo(1)
    }

    @Test
    fun `should add bulk elements via addAll`() {
        // Given
        val cache = ConcurrentCache<Int>()

        // When
        cache.addAll(listOf(1, 2, 3, 3))

        // Then
        assertThat(cache.size()).isEqualTo(3)
        assertThat(cache.contains(2)).isTrue()
    }

    @Test
    fun `should remove elements`() {
        // Given
        val cache = ConcurrentCache<Int>()
        cache.add(1)

        // When / Then
        assertThat(cache.remove(1)).isTrue()
        assertThat(cache.contains(1)).isFalse()
        assertThat(cache.remove(1)).isFalse()
    }

    @Test
    fun `should clear all elements`() {
        // Given
        val cache = ConcurrentCache<Int>()
        cache.addAll(listOf(1, 2, 3))

        // When
        cache.clear()

        // Then
        assertThat(cache.size()).isZero()
    }

    @Test
    fun `should be safe under concurrent writes`() {
        // Given: 8 threads adding 5_000 unique UUIDs each
        val cache = ConcurrentCache<UUID>()
        val threads = 8
        val perThread = 5_000
        val pool = Executors.newFixedThreadPool(threads)
        val startGate = CountDownLatch(1)
        val doneGate = CountDownLatch(threads)
        repeat(threads) {
            pool.submit {
                startGate.await()
                repeat(perThread) { cache.add(UUID.randomUUID()) }
                doneGate.countDown()
            }
        }

        // When
        startGate.countDown()
        assertThat(doneGate.await(10, TimeUnit.SECONDS)).isTrue()
        pool.shutdownNow()

        // Then: every UUID was unique, so the size must equal the total inserts
        assertThat(cache.size()).isEqualTo(threads * perThread)
    }
}
