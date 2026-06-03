package com.vshpynta.expenses.api.service.gdpr

import com.vshpynta.expenses.api.config.TestClockConfig
import com.vshpynta.expenses.api.config.TestContainersConfig
import com.vshpynta.expenses.api.config.TestSecurityConfig
import com.vshpynta.expenses.api.model.gdpr.ProcessingRestriction
import com.vshpynta.expenses.api.model.gdpr.RestrictionGround
import com.vshpynta.expenses.api.model.gdpr.RestrictionRequester
import com.vshpynta.expenses.api.repository.gdpr.AccountActivityRepository
import com.vshpynta.expenses.api.repository.gdpr.GdprErasureLogRepository
import com.vshpynta.expenses.api.repository.gdpr.ProcessingRestrictionRepository
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.reactor.awaitSingle
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.eq
import org.mockito.kotlin.never
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.r2dbc.core.DatabaseClient
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.TestPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoBean
import java.time.Duration
import java.time.Instant

/**
 * Integration tests for [InactivityRetentionJob]. The job's
 * `@ConditionalOnProperty` master switch is enabled here via
 * [TestPropertySource]; the schedule cron is left at the production
 * default (03:00 UTC), which won't fire during a test run, so we drive
 * the job by calling `runTick()` directly.
 *
 * Uses [TestClockConfig] to fast-forward past the multi-year warning
 * threshold and the 90-day grace window in zero wall-clock time.
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestContainersConfig::class, TestSecurityConfig::class, TestClockConfig::class)
@TestPropertySource(properties = ["app.gdpr.inactivity.enabled=true"])
class InactivityRetentionJobTest {

    companion object {
        private val FIRST_TICK: Instant = Instant.parse("2030-01-01T03:00:00Z")
        // last_seen 4 years ago — well past the 3-year warning threshold
        private val LONG_AGO: Instant = FIRST_TICK.minus(Duration.ofDays(365L * 4L))
        // last_seen recent — should not be warned
        private val RECENT: Instant = FIRST_TICK.minus(Duration.ofDays(30))
    }

    @Autowired
    private lateinit var job: InactivityRetentionJob

    @Autowired
    private lateinit var activityRepository: AccountActivityRepository

    @Autowired
    private lateinit var restrictionRepository: ProcessingRestrictionRepository

    @Autowired
    private lateinit var erasureLog: GdprErasureLogRepository

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
            databaseClient.sql("DELETE FROM expense_events").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM expense_projections").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM categories").fetch().rowsUpdated().awaitSingle()
        }
        testClock.advanceTo(FIRST_TICK)
        runBlocking { whenever(keycloakAdmin.deleteUser(any())) doReturn true }
    }

    @Test
    fun `should send warning and stamp timestamp for inactive users`() {
        runBlocking {
            // Given: one inactive user (no warning yet), one recently active user
            val inactiveUserId = "inactive-user"
            val activeUserId = "active-user"
            activityRepository.touch(inactiveUserId, LONG_AGO)
            activityRepository.touch(activeUserId, RECENT)

            // When
            job.runTick()

            // Then: warning went to the inactive user only
            verify(notifier).sendInactivityWarning(eq(inactiveUserId), eq(90L))
            verify(notifier, never()).sendInactivityWarning(eq(activeUserId), any())

            // And: warning_sent_at was stamped
            val stamped = activityRepository.findByUserId(inactiveUserId)!!
            assertThat(stamped.inactivityWarningSentAt).isEqualTo(FIRST_TICK)

            val untouched = activityRepository.findByUserId(activeUserId)!!
            assertThat(untouched.inactivityWarningSentAt).isNull()
        }
    }

    @Test
    fun `should not warn the same user twice across consecutive ticks`() {
        runBlocking {
            val userId = "inactive-user"
            activityRepository.touch(userId, LONG_AGO)

            // When: tick once
            job.runTick()
            // ... and again the next day
            testClock.advanceBy(Duration.ofDays(1))
            job.runTick()

            // Then: warning sent only once
            verify(notifier, times(1)).sendInactivityWarning(eq(userId), any())
        }
    }

    @Test
    fun `should erase users still inactive past the grace window`() {
        runBlocking {
            // Given: user was warned long enough ago that the 90-day grace window has elapsed,
            // AND they have not logged in since the warning
            val userId = "doomed-user"
            val warningSent = FIRST_TICK.minus(Duration.ofDays(120))
            activityRepository.touch(userId, warningSent.minus(Duration.ofDays(1)))
            activityRepository.stampWarningSent(userId, warningSent)

            // When
            job.runTick()

            // Then: user was erased (audit row exists)
            val logs = erasureLog.findAll().toList()
            assertThat(logs).hasSize(1)
            assertThat(logs.single().requestedBy.name).isEqualTo("INACTIVITY_JOB")

            // And: the user's activity row is gone (deleted by the erasure cascade)
            assertThat(activityRepository.findByUserId(userId)).isNull()

            // And: the user got a confirmation
            verify(notifier).sendErasureConfirmation(eq(userId))
        }
    }

    @Test
    fun `should NOT erase users who logged in after the warning was sent`() {
        runBlocking {
            // Given: warning was sent 120 days ago BUT the user logged in 10 days ago
            val userId = "returning-user"
            val warningSent = FIRST_TICK.minus(Duration.ofDays(120))
            activityRepository.touch(userId, FIRST_TICK.minus(Duration.ofDays(10)))
            activityRepository.stampWarningSent(userId, warningSent)

            // When
            job.runTick()

            // Then: no erasure
            assertThat(erasureLog.findAll().toList()).isEmpty()
            assertThat(activityRepository.findByUserId(userId)).isNotNull()
            verify(notifier, never()).sendErasureConfirmation(any())
        }
    }

    @Test
    fun `should skip restricted users entirely - no warning and no erasure`() {
        runBlocking {
            // Given: an inactive user who is ALSO under Art. 18 restriction —
            // Art. 18(1)(c) explicitly preserves data for legal claims; the
            // job must never touch such an account.
            val userId = "restricted-inactive"
            activityRepository.touch(userId, LONG_AGO)
            val warningSent = FIRST_TICK.minus(Duration.ofDays(120))
            activityRepository.stampWarningSent(userId, warningSent)
            restrictionRepository.insert(
                ProcessingRestriction(
                    userId = userId,
                    restrictedAt = LONG_AGO,
                    ground = RestrictionGround.CONTROLLER_NO_LONGER_NEEDS,
                    requestedBy = RestrictionRequester.SUBJECT,
                    actorId = userId,
                )
            )

            // When
            job.runTick()

            // Then: not warned, not erased, restriction intact, audit log empty
            verify(notifier, never()).sendInactivityWarning(any(), any())
            verify(notifier, never()).sendErasureConfirmation(any())
            assertThat(erasureLog.findAll().toList()).isEmpty()
            assertThat(restrictionRepository.findByUserId(userId)).isNotNull()
        }
    }
}
