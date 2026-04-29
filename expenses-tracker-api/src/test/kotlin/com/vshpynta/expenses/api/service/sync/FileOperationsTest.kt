package com.vshpynta.expenses.api.service.sync

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.vshpynta.expenses.api.model.EventEntry
import com.vshpynta.expenses.api.model.EventSyncFile
import com.vshpynta.expenses.api.model.ExpensePayload
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File
import java.nio.file.Path
import java.util.UUID

/**
 * Unit tests for [FileOperations]: round-trip JSON read/write (plain and
 * gzipped), graceful handling of missing or corrupt files, and SHA-256
 * checksum semantics.
 */
class FileOperationsTest {

    private val objectMapper: ObjectMapper = jacksonObjectMapper()
    private val operations = FileOperations(objectMapper)

    private fun sampleSyncFile(): EventSyncFile {
        val expenseId = UUID.randomUUID()
        return EventSyncFile(
            events = listOf(
                EventEntry(
                    eventId = UUID.randomUUID().toString(),
                    timestamp = 1_700_000_000_000L,
                    eventType = "EXPENSE_CREATED",
                    expenseId = expenseId.toString(),
                    payload = ExpensePayload(id = expenseId, amount = 100, updatedAt = 1L, userId = "u1"),
                    userId = "u1",
                )
            )
        )
    }

    @Test
    fun `should round trip JSON without compression`(@TempDir tempDir: Path): Unit = runBlocking {
        // Given
        val target = tempDir.resolve("sync.json").toFile()
        val original = sampleSyncFile()

        // When
        operations.writeJson(target, original, compressed = false)
        val loaded = operations.readJson(target, EventSyncFile::class.java, compressed = false)

        // Then
        assertThat(target).exists()
        assertThat(loaded).isEqualTo(original)
    }

    @Test
    fun `should round trip JSON with gzip compression`(@TempDir tempDir: Path): Unit = runBlocking {
        // Given
        val target = tempDir.resolve("sync.json.gz").toFile()
        val original = sampleSyncFile()

        // When
        operations.writeJson(target, original, compressed = true)
        val loaded = operations.readJson(target, EventSyncFile::class.java, compressed = true)

        // Then: compressed output must not be parseable as plain JSON
        assertThat(loaded).isEqualTo(original)
        assertThat(target.readBytes().take(2)).containsExactly(0x1f.toByte(), 0x8b.toByte())
    }

    @Test
    fun `should create parent directories on write`(@TempDir tempDir: Path): Unit = runBlocking {
        // Given: deeply nested target whose parents don't exist yet
        val target = tempDir.resolve("a/b/c/sync.json").toFile()
        assertThat(target.parentFile).doesNotExist()

        // When
        operations.writeJson(target, sampleSyncFile(), compressed = false)

        // Then
        assertThat(target).exists()
    }

    @Test
    fun `should return null when reading a missing file`(@TempDir tempDir: Path): Unit = runBlocking {
        // Given
        val missing = tempDir.resolve("absent.json").toFile()

        // When
        val loaded = operations.readJson(missing, EventSyncFile::class.java, compressed = false)

        // Then
        assertThat(loaded).isNull()
    }

    @Test
    fun `should return null when JSON is malformed`(@TempDir tempDir: Path): Unit = runBlocking {
        // Given
        val target = tempDir.resolve("broken.json").toFile()
        target.writeText("{ this is not json")

        // When
        val loaded = operations.readJson(target, EventSyncFile::class.java, compressed = false)

        // Then: runCatching swallows parse errors and returns null
        assertThat(loaded).isNull()
    }

    @Test
    fun `should compute deterministic SHA-256 checksum`(@TempDir tempDir: Path): Unit = runBlocking {
        // Given: two files with identical content
        val a = File(tempDir.toFile(), "a.txt").apply { writeText("hello") }
        val b = File(tempDir.toFile(), "b.txt").apply { writeText("hello") }
        val c = File(tempDir.toFile(), "c.txt").apply { writeText("hello!") }

        // When
        val checksumA = operations.calculateChecksum(a)
        val checksumB = operations.calculateChecksum(b)
        val checksumC = operations.calculateChecksum(c)

        // Then
        assertThat(checksumA).isNotNull
        assertThat(checksumA).isEqualTo(checksumB)
        assertThat(checksumA).isNotEqualTo(checksumC)
    }

    @Test
    fun `should return null checksum for missing file`(@TempDir tempDir: Path): Unit = runBlocking {
        val checksum = operations.calculateChecksum(tempDir.resolve("absent.txt").toFile())
        assertThat(checksum).isNull()
    }

    @Test
    fun `should match checksum only when content unchanged`(@TempDir tempDir: Path): Unit = runBlocking {
        // Given
        val target = tempDir.resolve("data.txt").toFile().apply { writeText("v1") }
        val checksum = operations.calculateChecksum(target)

        // Then: equal content matches
        assertThat(operations.matchesChecksum(target, checksum)).isTrue()

        // When: content changes
        target.writeText("v2")

        // Then: stale checksum no longer matches
        assertThat(operations.matchesChecksum(target, checksum)).isFalse()
    }

    @Test
    fun `should reject null and missing-file inputs to matchesChecksum`(@TempDir tempDir: Path): Unit = runBlocking {
        val target = tempDir.resolve("data.txt").toFile().apply { writeText("v1") }
        val missing = tempDir.resolve("absent.txt").toFile()

        assertThat(operations.matchesChecksum(target, null)).isFalse()
        assertThat(operations.matchesChecksum(missing, "anything")).isFalse()
    }
}
