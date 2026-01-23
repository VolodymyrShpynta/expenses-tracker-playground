package com.vshpynta.expenses.api.service.sync

import com.fasterxml.jackson.databind.ObjectMapper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.apache.commons.codec.digest.DigestUtils
import org.springframework.stereotype.Component
import java.io.File
import java.util.zip.GZIPInputStream
import java.util.zip.GZIPOutputStream

/**
 * General-purpose file operations utility
 *
 * Provides reusable file I/O operations without business logic:
 * - File reading/writing with optional compression
 * - Checksum calculation and comparison
 * - JSON serialization/deserialization
 */
@Component
class FileOperations(
    private val objectMapper: ObjectMapper
) {

    /**
     * Reads JSON from file and deserializes to specified type
     * Supports optional Gzip compression
     */
    suspend fun <T> readJson(file: File, type: Class<T>, compressed: Boolean = false): T? =
        withContext(Dispatchers.IO) {
            if (!file.exists()) return@withContext null

            runCatching {
                if (compressed) {
                    file.inputStream().use { fileInput ->
                        GZIPInputStream(fileInput).use { gzipInput ->
                            objectMapper.readValue(gzipInput, type)
                        }
                    }
                } else {
                    objectMapper.readValue(file, type)
                }
            }.getOrNull()
        }

    /**
     * Writes object as JSON to file
     * Supports optional Gzip compression
     */
    suspend fun writeJson(file: File, value: Any, compressed: Boolean = false) =
        withContext(Dispatchers.IO) {
            ensureParentDirectories(file)

            if (compressed) {
                file.outputStream().use { fileOutput ->
                    GZIPOutputStream(fileOutput).use { gzipOutput ->
                        objectMapper.writerWithDefaultPrettyPrinter()
                            .writeValue(gzipOutput, value)
                    }
                }
            } else {
                objectMapper.writerWithDefaultPrettyPrinter()
                    .writeValue(file, value)
            }
        }

    /**
     * Calculates SHA-256 checksum of file contents
     */
    suspend fun calculateChecksum(file: File): String? = withContext(Dispatchers.IO) {
        if (!file.exists()) return@withContext null

        runCatching {
            file.inputStream().use { DigestUtils.sha256Hex(it) }
        }.getOrNull()
    }

    /**
     * Checks if file's checksum matches the provided checksum
     * Returns true if they match, false otherwise
     * Returns false if file doesn't exist or checksum calculation fails
     */
    suspend fun matchesChecksum(file: File, expectedChecksum: String?): Boolean {
        if (expectedChecksum == null) return false
        val actualChecksum = calculateChecksum(file) ?: return false
        return actualChecksum == expectedChecksum
    }

    /**
     * Ensures parent directories exist for the file
     */
    suspend fun ensureParentDirectories(file: File) = withContext(Dispatchers.IO) {
        file.parentFile?.mkdirs()
    }

    /**
     * Checks if file exists
     */
    suspend fun exists(file: File): Boolean = withContext(Dispatchers.IO) {
        file.exists()
    }
}
