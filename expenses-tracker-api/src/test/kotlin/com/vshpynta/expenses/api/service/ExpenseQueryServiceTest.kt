package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.config.TestContainersConfig
import com.vshpynta.expenses.api.config.TestSecurityConfig
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
import java.util.UUID

/**
 * Integration tests for [ExpenseQueryService]. Confirms the read path
 * is scoped to the current user, hides soft-deleted projections, and
 * the existence check honours the same rules.
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestContainersConfig::class, TestSecurityConfig::class)
class ExpenseQueryServiceTest {

    companion object {
        private const val TEST_USER_ID = TestSecurityConfig.TEST_USER_ID
    }

    @Autowired
    private lateinit var commandService: ExpenseCommandService

    @Autowired
    private lateinit var queryService: ExpenseQueryService

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
            whenever(userContextService.currentUserId()) doReturn TEST_USER_ID
        }
    }

    @Test
    fun `should return only active projections for the current user`(): Unit = runBlocking {
        // Given: two active expenses and one soft-deleted
        val a = commandService.createExpense(
            description = "A", amount = 100, currency = "USD",
            categoryId = UUID.randomUUID(), date = "2026-01-01T00:00:00Z",
        )
        val b = commandService.createExpense(
            description = "B", amount = 200, currency = "USD",
            categoryId = UUID.randomUUID(), date = "2026-01-02T00:00:00Z",
        )
        val c = commandService.createExpense(
            description = "C", amount = 300, currency = "USD",
            categoryId = UUID.randomUUID(), date = "2026-01-03T00:00:00Z",
        )
        commandService.deleteExpense(c.id)

        // When
        val active = queryService.findAllExpenses().toList()

        // Then
        assertThat(active.map { it.id }).containsExactlyInAnyOrder(a.id, b.id)
        assertThat(active).noneMatch { it.deleted }
    }

    @Test
    fun `should return null for missing expense by id`(): Unit = runBlocking {
        assertThat(queryService.findExpenseById(UUID.randomUUID())).isNull()
    }

    @Test
    fun `should return null for soft-deleted expense by id`(): Unit = runBlocking {
        // Given
        val created = commandService.createExpense(
            description = "soft", amount = 10, currency = "USD",
            categoryId = UUID.randomUUID(), date = "2026-01-01T00:00:00Z",
        )
        commandService.deleteExpense(created.id)

        // When
        val found = queryService.findExpenseById(created.id)

        // Then
        assertThat(found).isNull()
    }

    @Test
    fun `should return projection for active expense by id`(): Unit = runBlocking {
        // Given
        val created = commandService.createExpense(
            description = "live", amount = 42, currency = "USD",
            categoryId = UUID.randomUUID(), date = "2026-01-01T00:00:00Z",
        )

        // When
        val found = queryService.findExpenseById(created.id)

        // Then: the read model returns exactly what the command persisted
        assertThat(found).isEqualTo(created)
    }

    @Test
    fun `should isolate per-user reads`(): Unit = runBlocking {
        // Given: an expense owned by TEST_USER_ID
        val mine = commandService.createExpense(
            description = "mine", amount = 50, currency = "USD",
            categoryId = UUID.randomUUID(), date = "2026-01-01T00:00:00Z",
        )

        // When: another user is the current principal
        whenever(userContextService.currentUserId()) doReturn "other-user"
        val theirs = queryService.findAllExpenses().toList()
        val theirById = queryService.findExpenseById(mine.id)

        // Then
        assertThat(theirs).isEmpty()
        assertThat(theirById).isNull()
    }
}
