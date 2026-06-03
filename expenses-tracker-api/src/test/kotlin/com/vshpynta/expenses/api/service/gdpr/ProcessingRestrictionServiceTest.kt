package com.vshpynta.expenses.api.service.gdpr

import com.vshpynta.expenses.api.config.TestClockConfig
import com.vshpynta.expenses.api.config.TestContainersConfig
import com.vshpynta.expenses.api.config.TestSecurityConfig
import com.vshpynta.expenses.api.model.gdpr.RestrictionGround
import com.vshpynta.expenses.api.model.gdpr.RestrictionLogEvent
import com.vshpynta.expenses.api.model.gdpr.RestrictionRequester
import com.vshpynta.expenses.api.repository.gdpr.ProcessingRestrictionLogRepository
import com.vshpynta.expenses.api.repository.gdpr.ProcessingRestrictionRepository
import com.vshpynta.expenses.api.util.IdentifierHasher
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.reactor.awaitSingle
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.eq
import org.mockito.kotlin.verify
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.r2dbc.core.DatabaseClient
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.bean.override.mockito.MockitoBean
import java.time.Duration
import java.time.Instant

/**
 * Integration tests for [ProcessingRestrictionService]. Covers the full
 * Art. 18 lifecycle (restrict → pre-lift notice → lift) including the
 * dwell window enforcement, which is the mechanism that gives the
 * Art. 18(3) notification duty teeth.
 *
 * Uses [TestClockConfig] so the dwell window can be advanced past in
 * milliseconds rather than 7 real days; uses a [MockitoBean] for
 * [UserNotificationService] so we can assert the pre-lift notice was
 * actually dispatched.
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestContainersConfig::class, TestSecurityConfig::class, TestClockConfig::class)
class ProcessingRestrictionServiceTest {

    companion object {
        private const val USER_ID = "subject-123"
        private const val ADMIN_ID = "admin-007"
        private val INITIAL_TIME: Instant = Instant.parse("2026-06-01T00:00:00Z")
    }

    @Autowired
    private lateinit var service: ProcessingRestrictionService

    @Autowired
    private lateinit var restrictionRepository: ProcessingRestrictionRepository

    @Autowired
    private lateinit var logRepository: ProcessingRestrictionLogRepository

    @Autowired
    private lateinit var hasher: IdentifierHasher

    @Autowired
    private lateinit var databaseClient: DatabaseClient

    @Autowired
    private lateinit var testClock: TestClockConfig

    @MockitoBean
    private lateinit var notifier: UserNotificationService

    @BeforeEach
    fun setup() {
        runBlocking {
            databaseClient.sql("DELETE FROM processing_restrictions").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM processing_restriction_log").fetch().rowsUpdated().awaitSingle()
        }
        testClock.advanceTo(INITIAL_TIME)
    }

    @Test
    fun `should record a new restriction with audit row`() {
        runBlocking {
            // When
            val restriction = service.restrict(
                userId = USER_ID,
                ground = RestrictionGround.ACCURACY_CONTESTED,
                requestedBy = RestrictionRequester.SUBJECT,
                actorId = USER_ID,
                reasonNote = "I dispute the categorisation",
            )

            // Then: live state matches
            assertThat(restriction.userId).isEqualTo(USER_ID)
            assertThat(restriction.ground).isEqualTo(RestrictionGround.ACCURACY_CONTESTED)
            assertThat(restriction.requestedBy).isEqualTo(RestrictionRequester.SUBJECT)
            assertThat(restriction.restrictedAt).isEqualTo(INITIAL_TIME)
            assertThat(restriction.liftNoticeSentAt).isNull()

            // And: audit log row with hashed identifiers
            val logs = logRepository.findAll().toList()
            assertThat(logs).hasSize(1)
            val entry = logs.single()
            assertThat(entry.event).isEqualTo(RestrictionLogEvent.RESTRICTED)
            assertThat(entry.ground).isEqualTo(RestrictionGround.ACCURACY_CONTESTED)
            assertThat(entry.userIdHash).isEqualTo(hasher.hash(USER_ID))
            assertThat(entry.actorIdHash).isEqualTo(hasher.hash(USER_ID))
            assertThat(entry.reasonNote).isEqualTo("I dispute the categorisation")
        }
    }

    @Test
    fun `should reject a second restrict when one is already active`() {
        runBlocking {
            // Given
            service.restrict(USER_ID, RestrictionGround.ACCURACY_CONTESTED, RestrictionRequester.SUBJECT, USER_ID, null)
        }

        // When / Then: re-restricting is a conflict (caller must lift first if ground changes)
        assertThatThrownBy {
            runBlocking {
                service.restrict(USER_ID, RestrictionGround.OBJECTION_PENDING, RestrictionRequester.SUBJECT, USER_ID, null)
            }
        }.isInstanceOf(RestrictionStateConflictException::class.java)
    }

    @Test
    fun `should send pre-lift notice and stamp the timestamp`() {
        runBlocking {
            // Given: an active restriction
            service.restrict(USER_ID, RestrictionGround.OBJECTION_PENDING, RestrictionRequester.SUBJECT, USER_ID, null)
            testClock.advanceBy(Duration.ofHours(1))

            // When
            service.sendPreLiftNotice(USER_ID, RestrictionRequester.SUBJECT, USER_ID)

            // Then: stamped on the live row
            val refreshed = restrictionRepository.findByUserId(USER_ID)!!
            assertThat(refreshed.liftNoticeSentAt).isEqualTo(INITIAL_TIME.plus(Duration.ofHours(1)))

            // And: notifier was called with the configured dwell
            verify(notifier).sendPreLiftNotice(eq(USER_ID), any())

            // And: an audit row for LIFT_NOTICE_SENT exists in addition to the RESTRICTED row
            val events = logRepository.findAll().toList().map { it.event }
            assertThat(events).containsExactlyInAnyOrder(
                RestrictionLogEvent.RESTRICTED,
                RestrictionLogEvent.LIFT_NOTICE_SENT,
            )
        }
    }

    @Test
    fun `should reject pre-lift notice when no restriction exists`() {
        assertThatThrownBy {
            runBlocking { service.sendPreLiftNotice(USER_ID, RestrictionRequester.SUBJECT, USER_ID) }
        }.isInstanceOf(RestrictionStateConflictException::class.java)
    }

    @Test
    fun `should reject pre-lift notice when one was already sent`() {
        runBlocking {
            service.restrict(USER_ID, RestrictionGround.OBJECTION_PENDING, RestrictionRequester.SUBJECT, USER_ID, null)
            service.sendPreLiftNotice(USER_ID, RestrictionRequester.SUBJECT, USER_ID)
        }

        assertThatThrownBy {
            runBlocking { service.sendPreLiftNotice(USER_ID, RestrictionRequester.SUBJECT, USER_ID) }
        }.isInstanceOf(RestrictionStateConflictException::class.java)
    }

    @Test
    fun `should reject lift when no restriction exists`() {
        assertThatThrownBy {
            runBlocking { service.lift(USER_ID, RestrictionRequester.SUBJECT, USER_ID) }
        }.isInstanceOf(RestrictionStateConflictException::class.java)
    }

    @Test
    fun `should reject lift when no pre-lift notice has been sent`() {
        runBlocking {
            service.restrict(USER_ID, RestrictionGround.OBJECTION_PENDING, RestrictionRequester.SUBJECT, USER_ID, null)
        }

        assertThatThrownBy {
            runBlocking { service.lift(USER_ID, RestrictionRequester.SUBJECT, USER_ID) }
        }.isInstanceOf(RestrictionLiftPreconditionException::class.java)
    }

    @Test
    fun `should reject lift before the dwell window has elapsed`() {
        runBlocking {
            service.restrict(USER_ID, RestrictionGround.OBJECTION_PENDING, RestrictionRequester.SUBJECT, USER_ID, null)
            service.sendPreLiftNotice(USER_ID, RestrictionRequester.SUBJECT, USER_ID)
            // Only one hour has passed — default dwell is 7 days
            testClock.advanceBy(Duration.ofHours(1))
        }

        assertThatThrownBy {
            runBlocking { service.lift(USER_ID, RestrictionRequester.SUBJECT, USER_ID) }
        }.isInstanceOf(RestrictionLiftPreconditionException::class.java)
    }

    @Test
    fun `should lift restriction after dwell window with audit row`() {
        runBlocking {
            service.restrict(USER_ID, RestrictionGround.OBJECTION_PENDING, RestrictionRequester.ADMIN, ADMIN_ID, "verified")
            service.sendPreLiftNotice(USER_ID, RestrictionRequester.ADMIN, ADMIN_ID)
            // Step past dwell — default is 7 days
            testClock.advanceBy(Duration.ofDays(8))

            // When
            service.lift(USER_ID, RestrictionRequester.ADMIN, ADMIN_ID)

            // Then: live row is gone
            assertThat(restrictionRepository.findByUserId(USER_ID)).isNull()

            // And: 3 audit rows — RESTRICTED, LIFT_NOTICE_SENT, UNRESTRICTED — in chronological order
            val events = logRepository.findAll().toList().sortedBy { it.id }.map { it.event }
            assertThat(events).containsExactly(
                RestrictionLogEvent.RESTRICTED,
                RestrictionLogEvent.LIFT_NOTICE_SENT,
                RestrictionLogEvent.UNRESTRICTED,
            )

            // Admin-actor hash differs from subject hash
            val unrestricted = logRepository.findAll().toList().single { it.event == RestrictionLogEvent.UNRESTRICTED }
            assertThat(unrestricted.userIdHash).isEqualTo(hasher.hash(USER_ID))
            assertThat(unrestricted.actorIdHash).isEqualTo(hasher.hash(ADMIN_ID))
        }
    }

    @Test
    fun `liftAvailableAt should return noticeSentAt plus dwell`() {
        // Given
        val noticeSentAt = Instant.parse("2026-06-01T00:00:00Z")

        // When
        val available = service.liftAvailableAt(noticeSentAt)

        // Then: default dwell is 7 days
        assertThat(available).isEqualTo(noticeSentAt.plus(Duration.ofDays(7)))
    }
}
