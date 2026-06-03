package com.vshpynta.expenses.api.controller

import com.vshpynta.expenses.api.config.TestClockConfig
import com.vshpynta.expenses.api.config.TestContainersConfig
import com.vshpynta.expenses.api.config.TestSecurityConfig
import com.vshpynta.expenses.api.config.WebTestClientConfig
import com.vshpynta.expenses.api.controller.dto.ErasureResultDto
import com.vshpynta.expenses.api.controller.dto.LiftNoticeAcknowledgedDto
import com.vshpynta.expenses.api.controller.dto.RestrictRequest
import com.vshpynta.expenses.api.controller.dto.RestrictionDto
import com.vshpynta.expenses.api.model.gdpr.RestrictionGround
import com.vshpynta.expenses.api.model.gdpr.RestrictionRequester
import com.vshpynta.expenses.api.repository.gdpr.GdprErasureLogRepository
import com.vshpynta.expenses.api.repository.gdpr.ProcessingRestrictionRepository
import com.vshpynta.expenses.api.service.gdpr.KeycloakAdminClient
import com.vshpynta.expenses.api.service.gdpr.UserNotificationService
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.reactor.awaitSingle
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.whenever
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.r2dbc.core.DatabaseClient
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.reactive.server.WebTestClient
import org.springframework.test.web.reactive.server.expectBody
import java.time.Duration
import java.time.Instant

/**
 * End-to-end HTTP tests for [UserAccountController]. Covers Art. 17
 * (DELETE /api/users/me), Art. 18 lifecycle including the two-step
 * lift, the fresh-auth gate, and the 423-Locked response that a
 * restricted user gets on any write.
 *
 * Uses [TestClockConfig] so the 7-day Art. 18(3) dwell window can be
 * fast-forwarded; the [TestSecurityConfig] decoder reads from the same
 * clock so `auth_time` stays consistent with frozen "now".
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@Import(WebTestClientConfig::class, TestContainersConfig::class, TestSecurityConfig::class, TestClockConfig::class)
@ActiveProfiles("test")
class UserAccountControllerTest {

    companion object {
        private const val TEST_USER_ID = TestSecurityConfig.TEST_USER_ID
        private val NOW: Instant = Instant.parse("2026-06-01T00:00:00Z")
    }

    @Autowired
    private lateinit var webTestClient: WebTestClient

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
            databaseClient.sql("DELETE FROM processing_restriction_log").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM processing_restrictions").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM account_activity").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM expense_events").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM expense_projections").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM categories").fetch().rowsUpdated().awaitSingle()
        }
        testClock.advanceTo(NOW)
        runBlocking { whenever(keycloakAdmin.deleteUser(any())) doReturn true }
    }

    // ---- Art. 17 erasure ----

    @Test
    fun `DELETE me should erase the caller and return cascade summary`() {
        // When
        webTestClient.delete()
            .uri("/api/users/me")
            .exchange()
            .expectStatus().isOk
            .expectBody<ErasureResultDto>()
            .consumeWith { response ->
                val body = response.responseBody!!
                assertThat(body.userId).isEqualTo(TEST_USER_ID)
                assertThat(body.requestedBy.name).isEqualTo("SUBJECT")
                assertThat(body.keycloakDeleted).isTrue()
                assertThat(body.followUpInstructions).isNotEmpty()
            }

        // Then: an audit row exists
        runBlocking {
            assertThat(erasureLog.findAll().toList()).hasSize(1)
        }
    }

    @Test
    fun `DELETE me should return 401 when auth_time is stale`() {
        webTestClient.delete()
            .uri("/api/users/me")
            .header(HttpHeaders.AUTHORIZATION, "Bearer ${TestSecurityConfig.TOKEN_STALE}")
            .exchange()
            .expectStatus().isUnauthorized
            .expectHeader().exists("WWW-Authenticate")
    }

    @Test
    fun `DELETE me should return 401 when auth_time claim is missing`() {
        webTestClient.delete()
            .uri("/api/users/me")
            .header(HttpHeaders.AUTHORIZATION, "Bearer ${TestSecurityConfig.TOKEN_NO_AUTH_TIME}")
            .exchange()
            .expectStatus().isUnauthorized
    }

    @Test
    fun `DELETE me should surface keycloakDeleted=false in the response when Keycloak fails`() {
        // Given
        runBlocking { whenever(keycloakAdmin.deleteUser(any())) doReturn false }

        // When / Then
        webTestClient.delete()
            .uri("/api/users/me")
            .exchange()
            .expectStatus().isOk
            .expectBody<ErasureResultDto>()
            .consumeWith { response ->
                val body = response.responseBody!!
                assertThat(body.keycloakDeleted).isFalse()
                // Extra instruction is appended when the IdP wasn't cascaded
                assertThat(body.followUpInstructions.first())
                    .contains("identity-provider account")
            }
    }

    // ---- Art. 18 restrict / lift ----

    @Test
    fun `GET restriction should return 204 when no restriction exists`() {
        webTestClient.get()
            .uri("/api/users/me/restriction")
            .exchange()
            .expectStatus().isNoContent
    }

    @Test
    fun `POST restrict should create a restriction and return 201`() {
        // When
        webTestClient.post()
            .uri("/api/users/me/restrict")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(RestrictRequest(ground = RestrictionGround.ACCURACY_CONTESTED, reasonNote = "wrong category"))
            .exchange()
            .expectStatus().isCreated
            .expectBody<RestrictionDto>()
            .consumeWith { response ->
                val body = response.responseBody!!
                assertThat(body.userId).isEqualTo(TEST_USER_ID)
                assertThat(body.ground).isEqualTo(RestrictionGround.ACCURACY_CONTESTED)
                assertThat(body.requestedBy).isEqualTo(RestrictionRequester.SUBJECT)
                assertThat(body.liftNoticeSentAt).isNull()
            }

        // Then: GET now returns the same row
        webTestClient.get()
            .uri("/api/users/me/restriction")
            .exchange()
            .expectStatus().isOk
    }

    @Test
    fun `POST restrict twice should return 409 conflict`() {
        // Given
        postRestrict()

        // When / Then
        webTestClient.post()
            .uri("/api/users/me/restrict")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(RestrictRequest(ground = RestrictionGround.OBJECTION_PENDING, reasonNote = "again"))
            .exchange()
            .expectStatus().isEqualTo(409)
    }

    @Test
    fun `DELETE restrict first should send pre-lift notice and return 202`() {
        // Given
        postRestrict()

        // When
        webTestClient.delete()
            .uri("/api/users/me/restrict")
            .exchange()
            .expectStatus().isAccepted
            .expectBody<LiftNoticeAcknowledgedDto>()
            .consumeWith { response ->
                val body = response.responseBody!!
                assertThat(body.liftNoticeSentAt).isEqualTo(NOW)
                assertThat(body.liftAvailableAt).isEqualTo(NOW.plus(Duration.ofDays(7)))
            }
    }

    @Test
    fun `DELETE restrict twice before dwell should return 409`() {
        // Given: notice was sent
        postRestrict()
        webTestClient.delete().uri("/api/users/me/restrict").exchange().expectStatus().isAccepted

        // When: try to lift only a few minutes later
        testClock.advanceBy(Duration.ofMinutes(5))

        // Then
        webTestClient.delete()
            .uri("/api/users/me/restrict")
            .exchange()
            .expectStatus().isEqualTo(409)
    }

    @Test
    fun `DELETE restrict twice after dwell should return 204 and clear restriction`() {
        // Given: notice has been sent
        postRestrict()
        webTestClient.delete().uri("/api/users/me/restrict").exchange().expectStatus().isAccepted

        // When: dwell elapses
        testClock.advanceBy(Duration.ofDays(8))

        // Then
        webTestClient.delete()
            .uri("/api/users/me/restrict")
            .exchange()
            .expectStatus().isNoContent

        runBlocking {
            assertThat(restrictionRepository.findByUserId(TEST_USER_ID)).isNull()
        }
    }

    // ---- Art. 18 write guard ----

    @Test
    fun `should return 423 Locked when a restricted user attempts a write`() {
        // Given: user is restricted
        postRestrict()

        // When / Then: any write under /api/expenses must be rejected
        webTestClient.post()
            .uri("/api/expenses")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(
                mapOf(
                    "description" to "Coffee",
                    "amount" to 450,
                    "currency" to "USD",
                    "categoryId" to java.util.UUID.randomUUID().toString(),
                    "date" to "2026-06-01T10:00:00Z",
                )
            )
            .exchange()
            .expectStatus().isEqualTo(423)
            .expectBody()
            .jsonPath("$.gdprArticle").isEqualTo("18")
            .jsonPath("$.ground").isEqualTo("ACCURACY_CONTESTED")
    }

    private fun postRestrict() {
        webTestClient.post()
            .uri("/api/users/me/restrict")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(RestrictRequest(ground = RestrictionGround.ACCURACY_CONTESTED, reasonNote = "self"))
            .exchange()
            .expectStatus().isCreated
    }
}
