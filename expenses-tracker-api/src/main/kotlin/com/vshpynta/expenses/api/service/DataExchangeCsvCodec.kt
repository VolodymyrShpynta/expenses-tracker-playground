package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.controller.dto.ExportCategory
import com.vshpynta.expenses.api.controller.dto.ExportExpense
import com.vshpynta.expenses.api.controller.dto.ExportFile
import com.vshpynta.expenses.api.service.ExportDefaults.DEFAULT_COLOR
import com.vshpynta.expenses.api.service.ExportDefaults.DEFAULT_ICON
import com.vshpynta.expenses.api.service.ExportDefaults.UNCATEGORIZED_LABEL
import com.vshpynta.expenses.api.util.CsvOperations
import com.vshpynta.expenses.api.util.ZipArchive
import org.springframework.stereotype.Component

/**
 * CSV-in-ZIP codec for [ExportFile] — used in both directions
 * (export and import) by [DataExchangeService].
 *
 * Owns the data-exchange archive layout — which CSV files live in
 * the archive and under what names — and the per-CSV parsing rules
 * (sparse-row defaults, blank filtering). All generic ZIP byte handling
 * is delegated to [ZipArchive] so this class stays focused on CSV
 * concerns.
 *
 * The archive holds `categories.csv` and `expenses.csv` so a single
 * file round-trips the whole shape; users can also open the inner
 * files directly in a spreadsheet. Amounts are in minor units (cents)
 * so zero-decimal currencies (JPY, KRW) round-trip without precision
 * loss.
 *
 * **CSV is the spreadsheet-interop format, not the lossless one.**
 * Formula-injection sanitization is applied on write only (see
 * [CsvOperations]). Use JSON for true round-trip fidelity.
 */
@Component
class DataExchangeCsvCodec(
    private val csvOperations: CsvOperations,
    private val zipArchive: ZipArchive
) {

    companion object {
        private const val CATEGORIES_CSV = "categories.csv"
        private const val EXPENSES_CSV = "expenses.csv"
    }

    /**
     * Encodes `export` as a ZIP archive containing `categories.csv`
     * and `expenses.csv`. Header rows are emitted from the DTO's
     * `@JsonPropertyOrder`.
     */
    fun encode(export: ExportFile): ByteArray =
        zipArchive.pack(
            mapOf(
                CATEGORIES_CSV to csvOperations.write(export.categories).toByteArray(Charsets.UTF_8),
                EXPENSES_CSV to csvOperations.write(export.expenses).toByteArray(Charsets.UTF_8)
            )
        )

    /**
     * Decodes a ZIP archive into a parsed snapshot ready for
     * [DataImporter.applyImport]. Returns `null` if the mandatory
     * `expenses.csv` entry is missing — the caller surfaces this as a
     * user-facing error so a malformed upload doesn't silently produce
     * an empty import.
     */
    fun decodeArchive(bytes: ByteArray): DecodedArchive? {
        val entries = zipArchive.readByBasename(bytes)
        val expenses = entries[EXPENSES_CSV]?.toCsv()?.let { parseExpensesCsv(it) } ?: return null
        val categories = entries[CATEGORIES_CSV]?.toCsv()?.let { parseCategoriesCsv(it) } ?: emptyList()
        return DecodedArchive(categories, expenses)
    }

    /**
     * Decodes a standalone expenses CSV (no archive wrapper) — supports
     * the "drop a spreadsheet on the import dialog" UX.
     */
    fun decodeExpensesCsv(bytes: ByteArray): List<ExportExpense> =
        parseExpensesCsv(String(bytes, Charsets.UTF_8))

    /**
     * Parses a category CSV through Jackson CSV. Rows missing both a
     * name and a templateKey are filtered out — they carry no usable
     * information and would otherwise produce an empty category.
     */
    private fun parseCategoriesCsv(content: String): List<ExportCategory> =
        csvOperations.parse<ExportCategory>(content)
            .filter { !it.name.isNullOrBlank() || !it.templateKey.isNullOrBlank() }
            .map {
                it.copy(
                    icon = it.icon.ifBlank { DEFAULT_ICON },
                    color = it.color.ifBlank { DEFAULT_COLOR }
                )
            }

    /**
     * Parses an expense CSV through Jackson CSV. Rows without a
     * description are filtered out (they would fail validation
     * downstream anyway); blank currency / category cells are filled
     * with sensible defaults so a sparse spreadsheet still imports.
     */
    private fun parseExpensesCsv(content: String): List<ExportExpense> =
        csvOperations.parse<ExportExpense>(content)
            .filter { it.description.isNotBlank() }
            .map {
                it.copy(
                    currency = it.currency.ifBlank { "USD" },
                    category = it.category.ifBlank { UNCATEGORIZED_LABEL }
                )
            }

    private fun ByteArray.toCsv(): String = toString(Charsets.UTF_8)

    /** Result of decoding a CSV-in-ZIP archive. */
    data class DecodedArchive(
        val categories: List<ExportCategory>,
        val expenses: List<ExportExpense>
    )
}
