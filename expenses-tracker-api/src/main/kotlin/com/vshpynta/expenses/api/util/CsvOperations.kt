package com.vshpynta.expenses.api.util

import com.fasterxml.jackson.core.JsonGenerator
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.SerializerProvider
import com.fasterxml.jackson.databind.module.SimpleModule
import com.fasterxml.jackson.databind.ser.std.StdSerializer
import com.fasterxml.jackson.dataformat.csv.CsvMapper
import com.fasterxml.jackson.dataformat.csv.CsvSchema
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import org.springframework.stereotype.Component

/**
 * RFC-4180 CSV reader / writer backed by Jackson CSV
 * (`jackson-dataformat-csv`).
 *
 * Callers pass a Kotlin data class annotated with `@JsonPropertyOrder`
 * (and optional `@JsonProperty` for header overrides). Jackson CSV
 * builds the schema from the class and binds rows to / from instances —
 * so the file format lives with the DTO, in one place.
 *
 * The mapper is private to this class so its serializer chain cannot
 * leak into JSON paths. It is customized with a String serializer that
 * sanitizes leading characters which spreadsheets would interpret as
 * formulas (CVE-2014-3524 family) — the OWASP-recommended mitigation.
 *
 * Sanitization is **write-only and asymmetric** by design. The leading
 * apostrophe added on export is not stripped on import, so a string
 * stored as `"=lunch"` round-trips through CSV as `"'=lunch"` (one
 * extra apostrophe per cycle). This is intentional:
 *  - the apostrophe is a spreadsheet-rendering convention, not a CSV
 *    format convention — the read side has no reliable way to tell a
 *    sanitization apostrophe apart from a user-typed one
 *    (e.g. `"'=tax-exempt"`);
 *  - CSV is positioned as the spreadsheet-interop format, not the
 *    lossless export format (use JSON for round-trip fidelity);
 *  - the affected cells are rare (only those starting with `=`, `+`,
 *    `-`, `@`, tab or CR), and the corruption is bounded (one byte per
 *    affected cell per round trip — values stay readable).
 *
 * Note on the formula-sanitization feature: Jackson CSV does not ship a
 * built-in. The upstream feature request
 * (`CsvGenerator.Feature.SANITIZE_STRING_VALUES`, also discussed as
 * `SANITIZE_FORMULAS` / `SANITIZE_FOR_EXCEL`) has been open since 2022
 * with no merged implementation:
 * https://github.com/FasterXML/jackson-dataformats-text/issues/326
 * The pattern below — register a `StdSerializer<String>` via a
 * `SimpleModule` — is the prevailing community workaround referenced
 * directly in that issue's discussion. If/when Jackson ships a native
 * feature, we can replace [CsvFormulaSanitizationModule] with a single
 * `configure(...)` call.
 *
 * Configuration choices:
 * - **CRLF line terminators** — RFC-4180 §2.1 specifies CRLF, and Excel
 *   on Windows requires it for clean import.
 * - **`""` ↔ `null`** — empty cells round-trip to nullable Kotlin
 *   properties so e.g. `ExportCategory.templateKey = null` survives
 *   export → import without becoming the string "".
 * - **Default (lenient) quoting policy** — Jackson CSV's lenient check
 *   over-quotes a few values (e.g., `#5b8def`, `'-1`) but is the only
 *   mode that reliably quotes bare `\n`-containing cells. The strict
 *   mode (`STRICT_CHECK_FOR_QUOTING`) skips quoting for bare `\n` when
 *   the schema's line separator is `\r\n`, which would corrupt
 *   round-trips. The extra quotes are valid CSV and harmless to
 *   spreadsheets.
 * - **Column reordering tolerated on read** — users who edit the export
 *   in a spreadsheet sometimes reorder columns; we follow the file's
 *   header instead of the schema's ordinal positions.
 * - **Unknown columns ignored on read** — keeps imports forward-compatible
 *   if a future export adds extra columns.
 */
@Component
class CsvOperations {

    @PublishedApi
    internal val csvMapper: CsvMapper = CsvMapper().apply {
        registerKotlinModule()
        registerModule(CsvFormulaSanitizationModule())
        configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
    }

    /**
     * Serializes `rows` as RFC-4180 CSV with a header row taken from the
     * `@JsonPropertyOrder` / `@JsonProperty` annotations on `T`. Cells
     * that look like spreadsheet formulas are pre-pended with a literal
     * apostrophe so opening the file in Excel / LibreOffice / Sheets
     * never executes a formula.
     */
    final inline fun <reified T : Any> write(rows: Collection<T>): String {
        val schema = schemaFor<T>().withHeader()
        return csvMapper.writer(schema).writeValueAsString(rows)
    }

    /**
     * Parses RFC-4180 CSV into a list of `T`, using the file's first row
     * as the header. Tolerates LF / CRLF line endings, columns in any
     * order, and unknown extra columns. Empty cells deserialize to
     * `null` for nullable `T` properties. Empty input yields an empty
     * list (Jackson CSV would otherwise throw `CsvReadException`).
     */
    final inline fun <reified T : Any> parse(content: String): List<T> {
        if (content.isBlank()) return emptyList()
        val schema = schemaFor<T>().withHeader().withColumnReordering(true)
        return csvMapper.readerFor(T::class.java).with(schema)
            .readValues<T>(content)
            .use { it.readAll() }
    }

    @PublishedApi
    internal final inline fun <reified T : Any> schemaFor(): CsvSchema =
        csvMapper.schemaFor(T::class.java)
            .withLineSeparator("\r\n")
            .withNullValue("")

    /**
     * Spreadsheet formula injection mitigation — runs on every String
     * value the [csvMapper] serializes. The mapper is private so the
     * only strings it ever touches are CSV cells; this never affects
     * JSON paths. See the OWASP "Formula Injection" cheat sheet.
     *
     * Naming tracks the (still pending) Jackson upstream proposal
     * `CsvGenerator.Feature.SANITIZE_FORMULAS` so a future swap is a
     * simple search-and-replace.
     * See https://github.com/FasterXML/jackson-dataformats-text/issues/326
     */
    private class CsvFormulaSanitizationModule : SimpleModule() {
        init {
            addSerializer(String::class.java, CsvFormulaSanitizingStringSerializer())
        }
    }

    private class CsvFormulaSanitizingStringSerializer :
        StdSerializer<String>(String::class.java) {

        override fun serialize(value: String, gen: JsonGenerator, provider: SerializerProvider) {
            gen.writeString(sanitize(value))
        }

        private fun sanitize(raw: String): String {
            if (raw.isEmpty()) return raw
            return when (raw[0]) {
                '=', '+', '-', '@', '\t', '\r' -> "'$raw"
                else -> raw
            }
        }
    }
}

