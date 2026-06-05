package com.vshpynta.expenses.api.service.gdpr

import com.vshpynta.expenses.api.config.TestClockConfig
import com.vshpynta.expenses.api.config.TestContainersConfig
import com.vshpynta.expenses.api.config.TestSecurityConfig
import com.vshpynta.expenses.api.model.Category
import com.vshpynta.expenses.api.model.EventType
import com.vshpynta.expenses.api.model.ExpenseEvent
import com.vshpynta.expenses.api.model.ExpenseProjection
import com.vshpynta.expenses.api.model.gdpr.ErasureRequester
import com.vshpynta.expenses.api.model.gdpr.ProcessingRestriction
import com.vshpynta.expenses.api.model.gdpr.RestrictionGround
import com.vshpynta.expenses.api.model.gdpr.RestrictionRequester
import com.vshpynta.expenses.api.repository.CategoryRepository
import com.vshpynta.expenses.api.repository.ExpenseEventRepository
import com.vshpynta.expenses.api.repository.ExpenseProjectionRepository
import com.vshpynta.expenses.api.repository.gdpr.AccountActivityRepository
import com.vshpynta.expenses.api.repository.gdpr.GdprErasureLogRepository
import com.vshpynta.expenses.api.repository.gdpr.ProcessingRestrictionRepository
import com.vshpynta.expenses.api.util.IdentifierHasher
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.reactor.awaitSingle
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.eq
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.r2dbc.core.DatabaseClient
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.bean.override.mockito.MockitoBean
import java.time.Instant
import java.util.UUID

/**
 * Integration tests for [GdprErasureService]. Verifies that the
 * cascade actually wipes every per-user table, that the audit row is
 * written with hashed identifiers (so it survives the erasure without
 * re-introducing personal data), and that the `keycloakDeleted` flag
 * faithfully reflects the Keycloak outcome.
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestContainersConfig::class, TestSecurityConfig::class, TestClockConfig::class)
class GdprErasureServiceTest {

    companion object {
        private const val USER_ID = "subject-to-erase"
        private const val OTHER_USER_ID = "untouched-user"
        private val NOW: Instant = Instant.parse("2026-06-01T00:00:00Z")
    }

    @Autowired
    private lateinit var service: GdprErasureService

    @Autowired
    private lateinit var eventRepository: ExpenseEventRepository

    @Autowired
    private lateinit var projectionRepository: ExpenseProjectionRepository

    @Autowired
    private lateinit var categoryRepository: CategoryRepository

    @Autowired
    private lateinit var restrictionRepository: ProcessingRestrictionRepository

    @Autowired
    private lateinit var activityRepository: AccountActivityRepository

    @Autowired
    private lateinit var erasureLog: GdprErasureLogRepository

    @Autowired
    private lateinit var hasher: IdentifierHasher

    @Autowired
    private lateinit var databaseClient: DatabaseClient

    @Autowired
    private lateinit var testClock: TestClockConfig

    @MockitoBean
    private lateinit var keycloakAdmin: KeycloakAdminClient

    @MockitoBean
    private lateinit var notifier: UserNotificationService

    @BeforeEach
    fun setup() {
        runBlocking {
            databaseClient.sql("DELETE FROM gdpr_erasure_log").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM account_activity").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM processing_restrictions").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM session_revocations").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM expense_events").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM expense_projections").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM categories").fetch().rowsUpdated().awaitSingle()
        }
        testClock.advanceTo(NOW)
    }

    @Test
    fun `should erase all per-user data and record audit row with hashed ids`() {
        runBlocking {
            // Given: a user with a footprint in every table + an unrelated user that must survive
            seedUserFootprint(USER_ID)
            seedUserFootprint(OTHER_USER_ID)
            whenever(keycloakAdmin.deleteUser(USER_ID)) doReturn true

            // When
            val result = service.eraseUser(
                userId = USER_ID,
                requestedBy = ErasureRequester.SUBJECT,
                actorId = USER_ID,
                reasonNote = "subject-initiated",
            )

            // Then: counts come back from the cascade
            assertThat(result.userId).isEqualTo(USER_ID)
            assertThat(result.requestedBy).isEqualTo(ErasureRequester.SUBJECT)
            assertThat(result.eventsDeleted).isEqualTo(1L)
            assertThat(result.projectionsDeleted).isEqualTo(1L)
            assertThat(result.categoriesDeleted).isEqualTo(1L)
            assertThat(result.keycloakDeleted).isTrue()
            assertThat(result.occurredAt).isEqualTo(NOW)

            // And: per-user rows are gone for the erased subject
            assertThat(countRows("expense_events", USER_ID)).isZero()
            assertThat(countRows("expense_projections", USER_ID)).isZero()
            assertThat(countRows("categories", USER_ID)).isZero()
            assertThat(restrictionRepository.findByUserId(USER_ID)).isNull()
            assertThat(activityRepository.findByUserId(USER_ID)).isNull()

            // And: the unrelated user is completely intact
            assertThat(countRows("expense_events", OTHER_USER_ID)).isEqualTo(1L)
            assertThat(countRows("expense_projections", OTHER_USER_ID)).isEqualTo(1L)
            assertThat(countRows("categories", OTHER_USER_ID)).isEqualTo(1L)

            // And: the audit row uses hashed identifiers (so it survives erasure)
            val logs = erasureLog.findAll().toList()
            assertThat(logs).hasSize(1)
            val entry = logs.single()
            assertThat(entry.userIdHash).isEqualTo(hasher.hash(USER_ID))
            assertThat(entry.actorIdHash).isEqualTo(hasher.hash(USER_ID))
            assertThat(entry.requestedBy).isEqualTo(ErasureRequester.SUBJECT)
            assertThat(entry.eventsDeleted).isEqualTo(1L)
            assertThat(entry.keycloakDeleted).isTrue()
            assertThat(entry.reasonNote).isEqualTo("subject-initiated")

            // And: the subject got their erasure confirmation
            verify(notifier).sendErasureConfirmation(eq(USER_ID))
        }
    }

    @Test
    fun `should record keycloakDeleted=false when Keycloak deletion fails`() {
        runBlocking {
            // Given: data exists; Keycloak admin reports failure (or is disabled)
            seedUserFootprint(USER_ID)
            whenever(keycloakAdmin.deleteUser(USER_ID)) doReturn false

            // When
            val result = service.eraseUser(USER_ID, ErasureRequester.ADMIN, "admin-99", "policy")

            // Then: DB cascade still ran, only the keycloakDeleted flag reflects the failure
            assertThat(result.keycloakDeleted).isFalse()
            assertThat(result.eventsDeleted).isEqualTo(1L)
            assertThat(countRows("expense_events", USER_ID)).isZero()

            val entry = erasureLog.findAll().toList().single()
            assertThat(entry.keycloakDeleted).isFalse()
            assertThat(entry.actorIdHash).isEqualTo(hasher.hash("admin-99"))
            verify(notifier).sendErasureConfirmation(eq(USER_ID))
        }
    }

    @Test
    fun `should still report success when notifier throws after the DB cascade commits`() {
        runBlocking {
            // Given: data exists; Keycloak succeeds; the notifier blows up
            seedUserFootprint(USER_ID)
            whenever(keycloakAdmin.deleteUser(USER_ID)) doReturn true
            whenever(notifier.sendErasureConfirmation(USER_ID))
                .thenThrow(RuntimeException("SMTP down"))

            // When: erasure must NOT propagate the notifier failure
            val result = service.eraseUser(USER_ID, ErasureRequester.SUBJECT, USER_ID, null)

            // Then: the cascade is reported as a success — DB rows are gone, audit row exists
            assertThat(result.eventsDeleted).isEqualTo(1L)
            assertThat(result.keycloakDeleted).isTrue()
            assertThat(countRows("expense_events", USER_ID)).isZero()
            assertThat(erasureLog.findAll().toList()).hasSize(1)
            // And: the notifier was at least invoked
            verify(notifier).sendErasureConfirmation(eq(USER_ID))
        }
    }

    @Test
    fun `should clear active restriction and activity rows as part of cascade`() {
        runBlocking {
            // Given: a user with a restriction and an activity row
            restrictionRepository.insert(
                ProcessingRestriction(
                    userId = USER_ID,
                    restrictedAt = NOW,
                    ground = RestrictionGround.OBJECTION_PENDING,
                    requestedBy = RestrictionRequester.SUBJECT,
                    actorId = USER_ID,
                )
            )
            activityRepository.touch(USER_ID, NOW)
            whenever(keycloakAdmin.deleteUser(any())) doReturn true

            // When
            service.eraseUser(USER_ID, ErasureRequester.SUBJECT, USER_ID, null)

            // Then
            assertThat(restrictionRepository.findByUserId(USER_ID)).isNull()
            assertThat(activityRepository.findByUserId(USER_ID)).isNull()
        }
    }

    /**
     * Seeds one row in each per-user table so the cascade has something
     * to delete. Uses repository APIs directly (no command service) to
     * avoid pulling in the write-guard.
     */
    private suspend fun seedUserFootprint(userId: String) {
        val expenseId = UUID.randomUUID()
        val categoryId = UUID.randomUUID()
        val nowMillis = NOW.toEpochMilli()

        eventRepository.save(
            ExpenseEvent(
                eventId = UUID.randomUUID(),
                timestamp = nowMillis,
                eventType = EventType.CREATED,
                expenseId = expenseId,
                payload = "{}",
                userId = userId,
            )
        )

        projectionRepository.projectFromEvent(
            ExpenseProjection(
                id = expenseId,
                description = "seed",
                amount = 100L,
                currency = "USD",
                categoryId = categoryId,
                date = "2026-06-01T00:00:00Z",
                updatedAt = nowMillis,
                deleted = false,
                userId = userId,
            )
        )

        categoryRepository.save(
            Category(
                categoryId = categoryId,
                name = "Seed",
                icon = "category",
                color = "#000000",
                updatedAt = nowMillis,
                deleted = false,
                userId = userId,
                templateKey = null,
            )
        )
    }

    private suspend fun countRows(table: String, userId: String): Long =
        databaseClient.sql("SELECT COUNT(*) FROM $table WHERE user_id = :u")
            .bind("u", userId)
            .map { row -> row.get(0, Long::class.javaObjectType) ?: 0L }
            .one()
            .awaitSingle()
}
