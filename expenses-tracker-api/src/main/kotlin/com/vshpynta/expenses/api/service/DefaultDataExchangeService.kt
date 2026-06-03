package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.controller.dto.ExportFile
import com.vshpynta.expenses.api.controller.dto.ImportResultDto
import com.vshpynta.expenses.api.util.JsonOperations
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service

/**
 * Default (business) implementation of [DataExchangeService].
 *
 * Knows nothing about GDPR — Art. 18 restriction enforcement is the
 * sole responsibility of the `GdprAwareDataExchangeService` decorator,
 * which is the `@Primary` bean and the one controllers receive when
 * they inject [DataExchangeService].
 *
 * Both `export*` methods return the HTTP-ready [ByteArray] so the
 * controller stays format-agnostic and never touches a serializer
 * directly. Programmatic callers that need the structured snapshot
 * (tests, future internal consumers) should depend on [DataExporter]
 * instead — that's the correct seam, and keeps this facade focused on
 * "format → bytes".
 *
 * See the design notes on the collaborators for the full rationale on
 * identity reuse, last-write-wins, and the asymmetric CSV-injection
 * sanitization.
 */
@Service("defaultDataExchangeService")
class DefaultDataExchangeService(
    private val dataExporter: DataExporter,
    private val dataImporter: DataImporter,
    private val csvCodec: DataExchangeCsvCodec,
    private val jsonOperations: JsonOperations,
) : DataExchangeService {

    companion object {
        private val logger = LoggerFactory.getLogger(DefaultDataExchangeService::class.java)
        private const val MISSING_EXPENSES_CSV = "Archive must contain expenses.csv"
    }

    override suspend fun exportAsJson(): ByteArray =
        jsonOperations.toJson(dataExporter.exportSnapshot()).toByteArray(Charsets.UTF_8)

    override suspend fun exportAsCsvZip(): ByteArray = csvCodec.encode(dataExporter.exportSnapshot())

    override suspend fun importJson(bytes: ByteArray): ImportResultDto {
        val export = runCatching {
            jsonOperations.fromJson(String(bytes, Charsets.UTF_8), ExportFile::class.java)
        }.getOrElse {
            logger.warn("Failed to parse export JSON", it)
            return ImportResultDto(0, 0, 0, fatal = "Malformed JSON: ${it.message}")
        }
        return dataImporter.applyImport(export.categories, export.expenses)
    }

    override suspend fun importCsvZip(bytes: ByteArray): ImportResultDto {
        val decoded = csvCodec.decodeArchive(bytes)
            ?: return ImportResultDto(0, 0, 0, fatal = MISSING_EXPENSES_CSV)
        return dataImporter.applyImport(decoded.categories, decoded.expenses)
    }

    override suspend fun importExpensesCsv(bytes: ByteArray): ImportResultDto {
        val expenses = csvCodec.decodeExpensesCsv(bytes)
        return dataImporter.applyImport(emptyList(), expenses)
    }
}
