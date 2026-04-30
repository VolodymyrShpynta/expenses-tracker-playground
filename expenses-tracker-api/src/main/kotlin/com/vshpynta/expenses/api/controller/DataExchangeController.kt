package com.vshpynta.expenses.api.controller

import com.vshpynta.expenses.api.controller.dto.ImportResultDto
import com.vshpynta.expenses.api.service.DataExchangeService
import kotlinx.coroutines.reactive.awaitFirst
import org.springframework.core.io.buffer.DataBuffer
import org.springframework.core.io.buffer.DataBufferUtils
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.http.codec.multipart.FilePart
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.time.LocalDate

/**
 * Export / import endpoints. The user picks a format (JSON for full
 * fidelity, ZIP-of-CSV for spreadsheet interop) and either downloads a
 * snapshot of their data or uploads one to merge in.
 *
 * The format choice is exposed as a query parameter on export and
 * detected from the filename suffix on import (`.json` / `.zip` /
 * `.csv`) so the same endpoint can serve every flow without forcing
 * the frontend into format-aware URL routing.
 */
@RestController
@RequestMapping("/api/data")
class DataExchangeController(
    private val dataExchangeService: DataExchangeService
) {

    @GetMapping("/export")
    suspend fun export(
        @RequestParam(defaultValue = "json") format: String
    ): ResponseEntity<ByteArray> {
        val exportFormat = ExportFormat.fromName(format)
            ?: throw badRequest("Unsupported export format: '$format' (use 'json' or 'csv')")
        val body = exportPayload(exportFormat)
        val filename = "expenses-tracker-export-${LocalDate.now()}.${exportFormat.extension}"
        return downloadResponse(filename, exportFormat.mediaType, body)
    }

    /**
     * Accepts a multipart upload. Format is dispatched on the file
     * extension — explicit and predictable, and matches how every other
     * consumer expense app handles export uploads.
     */
    @PostMapping("/import", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    suspend fun import(@RequestPart("file") filePart: FilePart): ImportResultDto {
        val filename = filePart.filename().lowercase()
        val bytes = collectBytes(filePart)
        return when {
            filename.endsWith(".json") -> dataExchangeService.importJson(bytes)
            filename.endsWith(".zip") -> dataExchangeService.importCsvZip(bytes)
            filename.endsWith(".csv") -> dataExchangeService.importExpensesCsv(bytes)
            else -> throw badRequest(
                "Unsupported file format: '$filename' (expected .json, .zip, or .csv)"
            )
        }
    }

    private suspend fun exportPayload(format: ExportFormat): ByteArray = when (format) {
        ExportFormat.JSON -> dataExchangeService.exportAsJson()
        ExportFormat.CSV -> dataExchangeService.exportAsCsvZip()
    }

    private fun downloadResponse(
        filename: String,
        contentType: MediaType,
        body: ByteArray
    ): ResponseEntity<ByteArray> =
        ResponseEntity.ok()
            .contentType(contentType)
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"$filename\"")
            .body(body)

    private suspend fun collectBytes(filePart: FilePart): ByteArray {
        val joined: DataBuffer = DataBufferUtils.join(filePart.content()).awaitFirst()
        return try {
            ByteArray(joined.readableByteCount()).also { joined.read(it) }
        } finally {
            DataBufferUtils.release(joined)
        }
    }

    private fun badRequest(message: String): ResponseStatusException =
        ResponseStatusException(HttpStatus.BAD_REQUEST, message)

    /**
     * Couples the public format name with its file extension and HTTP
     * media type so all three move together when a new format is added.
     * The CSV variant ships as a ZIP wrapping `categories.csv` and
     * `expenses.csv`, hence the `zip` extension.
     */
    private enum class ExportFormat(val extension: String, val mediaType: MediaType) {
        JSON("json", MediaType.APPLICATION_JSON),
        CSV("zip", MediaType.parseMediaType("application/zip"));

        companion object {
            fun fromName(name: String): ExportFormat? =
                entries.firstOrNull { it.name.equals(name, ignoreCase = true) }
        }
    }
}
