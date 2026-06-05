package com.vshpynta.expenses.api.service.gdpr

import com.vshpynta.expenses.api.config.TestClockConfig
import com.vshpynta.expenses.api.config.TestContainersConfig
import com.vshpynta.expenses.api.config.TestSecurityConfig
import com.vshpynta.expenses.api.config.gdpr.GdprProperties
import com.vshpynta.expenses.api.config.gdpr.SessionRevocationListener
import com.vshpynta.expenses.api.model.gdpr.RevokedBy
import com.vshpynta.expenses.api.repository.gdpr.SessionRevocationRepository
import kotlinx.coroutines.reactor.awaitSingle
import kotlinx.coroutines.reactor.awaitSingleOrNull
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.awaitility.Awaitility.await
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.r2dbc.core.DatabaseClient
import org.springframework.test.context.ActiveProfiles
import java.time.Duration
import java.time.Instant

/**
 * Integration tests for [SessionRevocationService]. Verifies the
 * cutoff arithmetic (`now + 1s`), the conditional UPSERT semantics
 * (last-write-wins on `revoked_at`), and the cache invalidation that
 * makes the local pod see its own write immediately.
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestContainersConfig::class, TestSecurityConfig::class, TestClockConfig::class)
class SessionRevocationServiceTest {

    companion object {
        private const val USER_ID = "revocation-user"
        private val NOW: Instant = Instant.parse("2026-06-01T00:00:00Z")
    }

    @Autowired
    private lateinit var service: SessionRevocationService

    @Autowired
    private lateinit var repository: SessionRevocationRepository

    @Autowired
    private lateinit var databaseClient: DatabaseClient

    @Autowired
    private lateinit var testClock: TestClockConfig

    @Autowired
    private lateinit var listener: SessionRevocationListener

    @Autowired
    private lateinit var properties: GdprProperties

    @BeforeEach
    fun setup() {
        runBlocking {
            databaseClient.sql("DELETE FROM session_revocations").fetch().rowsUpdated().awaitSingle()
        }
        testClock.advanceTo(NOW)
        // The cache is loaded at startup via SessionRevocationListener and
        // mutated by every test; drop the whole thing so each test starts
        // from the same empty-cache baseline rather than relying on a
        // single user id.
        service.invalidateAll()
    }

    @Test
    fun `revokeAllSessions should write a row whose cutoff is 1 second past now`() {
        runBlocking {
            val rows = service.revokeAllSessions(USER_ID, RevokedBy.SUBJECT)

            assertThat(rows).isEqualTo(1)
            val row = repository.findByUserId(USER_ID)
            assertThat(row).isNotNull
            // Cutoff is now+1s — strictly greater than NOW so a same-second JWT is rejected
            assertThat(row!!.revokedBeforeIat).isEqualTo(NOW.plusSeconds(1))
            assertThat(row.revokedAt).isEqualTo(NOW)
            assertThat(row.revokedBy).isEqualTo(RevokedBy.SUBJECT)
            // Default 15-minute grace from application.yaml
            assertThat(row.expiresAt).isEqualTo(NOW.plus(Duration.ofMinutes(15)))
        }
    }

    @Test
    fun `revokeAllSessions twice should overwrite the row with the later cutoff`() {
        runBlocking {
            service.revokeAllSessions(USER_ID, RevokedBy.SUBJECT)
            testClock.advanceBy(Duration.ofSeconds(30))
            val later = NOW.plusSeconds(30)

            val rows = service.revokeAllSessions(USER_ID, RevokedBy.ADMIN)

            assertThat(rows).isEqualTo(1)
            val row = repository.findByUserId(USER_ID)
            assertThat(row!!.revokedAt).isEqualTo(later)
            assertThat(row.revokedBy).isEqualTo(RevokedBy.ADMIN)
            assertThat(row.revokedBeforeIat).isEqualTo(later.plusSeconds(1))
        }
    }

    @Test
    fun `findRevokedBeforeIat should return null for an unknown user`() {
        assertThat(service.findRevokedBeforeIat("nobody")).isNull()
    }

    @Test
    fun `findRevokedBeforeIat should return the cutoff after a revocation`() {
        runBlocking {
            service.revokeAllSessions(USER_ID, RevokedBy.ERASURE)
        }

        assertThat(service.findRevokedBeforeIat(USER_ID)).isEqualTo(NOW.plusSeconds(1))
    }

    @Test
    fun `revokeAllSessions should put the cache entry so the local pod sees its own write`() {
        // Prime the cache with the "no revocation" answer
        assertThat(service.findRevokedBeforeIat(USER_ID)).isNull()

        runBlocking {
            service.revokeAllSessions(USER_ID, RevokedBy.SUBJECT)
        }

        // The writer populates the cache synchronously — no DB round-trip
        // and no listener round-trip needed on the originating pod.
        assertThat(service.findRevokedBeforeIat(USER_ID)).isEqualTo(NOW.plusSeconds(1))
    }

    /**
     * Cross-pod simulation: another replica writes a revocation row and
     * fires `pg_notify(channel, userId)` without our pod going through
     * [SessionRevocationService.revokeAllSessions]. The LISTEN subscription
     * on this pod should pick up the broadcast and re-read the row,
     * replacing the stale cache entry with the freshly-written cutoff —
     * converging in milliseconds rather than relying on the
     * reconnect-time snapshot reload as a backstop.
     */
    @Test
    fun `pg_notify from another pod refreshes this pod's cache via LISTEN`() {
        // The listener subscribes asynchronously on @PostConstruct via SmartLifecycle;
        // wait until it's actually listening before publishing the test notification,
        // otherwise the NOTIFY may be sent into the void.
        await().atMost(Duration.ofSeconds(5)).untilAsserted {
            assertThat(listener.isListening())
                .withFailMessage("Session-revocation LISTEN subscription is not active")
                .isTrue
        }
        runBlocking {
            // Prime this pod's cache with the "no revocation" answer.
            assertThat(service.findRevokedBeforeIat(USER_ID)).isNull()

            // Simulate the other pod's effects: write the row and fire NOTIFY.
            // Crucially, do NOT touch this service — we want to prove the
            // listener path is what refreshes the cache.
            val revokedAt = NOW
            val cutoff = revokedAt.plusSeconds(1)
            databaseClient.sql(
                """
                INSERT INTO session_revocations
                    (user_id, revoked_before_iat, revoked_at, revoked_by, expires_at)
                VALUES
                    (:userId, :cutoff, :revokedAt, 'SUBJECT', :expiresAt)
                """.trimIndent()
            )
                .bind("userId", USER_ID)
                .bind("cutoff", cutoff)
                .bind("revokedAt", revokedAt)
                .bind("expiresAt", revokedAt.plus(Duration.ofMinutes(15)))
                .fetch().rowsUpdated().awaitSingle()

            databaseClient.sql("SELECT pg_notify(:channel, :userId)")
                .bind("channel", properties.revocation.notifyChannel)
                .bind("userId", USER_ID)
                .then().awaitSingleOrNull()
        }

        // The listener processes the notification on its own dispatcher,
        // so poll briefly until the cache reflects the new value.
        await().atMost(Duration.ofSeconds(5)).untilAsserted {
            assertThat(service.findRevokedBeforeIat(USER_ID)).isEqualTo(NOW.plusSeconds(1))
        }
    }
}
