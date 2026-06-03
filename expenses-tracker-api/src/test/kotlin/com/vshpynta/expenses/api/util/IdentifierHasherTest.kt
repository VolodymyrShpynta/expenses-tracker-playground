package com.vshpynta.expenses.api.util

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

/**
 * Pure unit tests for [IdentifierHasher]. The hashing is deterministic
 * and unsalted by design — the whole point is that the same `user_id`
 * always produces the same `user_id_hash`, so audit rows in
 * `gdpr_erasure_log` / `processing_restriction_log` can be correlated
 * with a pre-erasure identifier *before* the subject is erased.
 */
class IdentifierHasherTest {

    private val hasher = IdentifierHasher()

    @Test
    fun `should produce a deterministic 64-char lowercase hex string`() {
        // When
        val hashed = hasher.hash("user-123")

        // Then
        assertThat(hashed).hasSize(64)
        assertThat(hashed).matches(Regex("[0-9a-f]{64}").toPattern())
    }

    @Test
    fun `should produce the same hash for the same input across calls`() {
        // Given / When
        val first = hasher.hash("alice@example.com")
        val second = hasher.hash("alice@example.com")

        // Then: hashing is stable so audit rows can be cross-referenced
        assertThat(first).isEqualTo(second)
    }

    @Test
    fun `should produce different hashes for different inputs`() {
        // Given / When
        val a = hasher.hash("user-a")
        val b = hasher.hash("user-b")

        // Then
        assertThat(a).isNotEqualTo(b)
    }

    @Test
    fun `should match the published SHA-256 vector for empty string`() {
        // Given: the SHA-256 of the empty string is a known constant
        val expected = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

        // When
        val actual = hasher.hash("")

        // Then: we're really computing SHA-256, not some other digest
        assertThat(actual).isEqualTo(expected)
    }
}
