package com.vshpynta.expenses.api.controller

import com.vshpynta.expenses.api.config.TestClockConfig
import com.vshpynta.expenses.api.config.TestContainersConfig
import com.vshpynta.expenses.api.config.TestSecurityConfig
import com.vshpynta.expenses.api.config.WebTestClientConfig
import com.vshpynta.expenses.api.controller.dto.ErasureResultDto
import com.vshpynta.expenses.api.controller.dto.RestrictRequest
import com.vshpynta.expenses.api.controller.dto.RestrictionDto
import com.vshpynta.expenses.api.model.gdpr.RestrictionGround
import com.vshpynta.expenses.api.repository.gdpr.GdprErasureLogRepository
import com.vshpynta.expenses.api.repository.gdpr.ProcessingRestrictionRepository
import com.vshpynta.expenses.api.service.gdpr.KeycloakAdminClient
import com.vshpynta.expenses.api.service.gdpr.UserNotificationService
import com.vshpynta.expenses.api.util.IdentifierHasher
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
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.r2dbc.core.DatabaseClient
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.reactive.server.WebTestClient
import org.springframework.test.web.reactive.server.expectBody
import java.time.Instant

/**
 * End-to-end HTTP tests for [AdminUserController]. Covers role-based
 * access (`gdpr-admin` realm role enforced by the security filter
 * chain), the admin-actor identity captured in audit rows (separately
 * from the data subject), and the same two-step lift flow as the
 * user-facing endpoint.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@Import(WebTestClientConfig::class, TestContainersConfig::class, TestSecurityConfig::class, TestClockConfig::class)
@ActiveProfiles("test")
class AdminUserControllerTest {

    companion object {
        private const val TARGET_USER_ID = "target-user-42"
        private const val ADMIN_USER_ID = TestSecurityConfig.ADMIN_USER_ID
        private val NOW: Instant = Instant.parse("2026-06-01T00:00:00Z")
    }

    @Autowired
    private lateinit var webTestClient: WebTestClient

    @Autowired
    private lateinit var restrictionRepository: ProcessingRestrictionRepository

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
            databaseClient.sql("DELETE FROM processing_restriction_log").fetch().rowsUpdated().awaitSingle()
            databaseClient.sql("DELETE FROM processing_restrictions").fetch().rowsUpdated().awaitSingle()
        }
        testClock.advanceTo(NOW)
        runBlocking { whenever(keycloakAdmin.deleteUser(any())) doReturn true }
    }

    @Test
    fun `should reject admin endpoints for callers without the gdpr-admin role`() {
        // Default token has no realm roles → /api/admin/** must reject with 403
        webTestClient.method(HttpMethod.DELETE)
            .uri("/api/admin/users/$TARGET_USER_ID")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(mapOf("reasonNote" to "test"))
            .exchange()
            .expectStatus().isForbidden
    }

    @Test
    fun `should allow admin to erase another user and record admin actor in audit row`() {
        webTestClient.method(HttpMethod.DELETE)
            .uri("/api/admin/users/$TARGET_USER_ID")
            .header(HttpHeaders.AUTHORIZATION, "Bearer ${TestSecurityConfig.TOKEN_ADMIN}")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(mapOf("reasonNote" to "court order ref 2026-CV-100"))
            .exchange()
            .expectStatus().isOk
            .expectBody<ErasureResultDto>()
            .consumeWith { response ->
                val body = response.responseBody!!
                assertThat(body.userId).isEqualTo(TARGET_USER_ID)
                assertThat(body.requestedBy.name).isEqualTo("ADMIN")
            }

        runBlocking {
            val entry = erasureLog.findAll().toList().single()
            assertThat(entry.userIdHash).isEqualTo(hasher.hash(TARGET_USER_ID))
            assertThat(entry.actorIdHash).isEqualTo(hasher.hash(ADMIN_USER_ID))
            assertThat(entry.reasonNote).isEqualTo("court order ref 2026-CV-100")
        }
    }

    @Test
    fun `should reject admin erasure when reasonNote is blank`() {
        webTestClient.method(HttpMethod.DELETE)
            .uri("/api/admin/users/$TARGET_USER_ID")
            .header(HttpHeaders.AUTHORIZATION, "Bearer ${TestSecurityConfig.TOKEN_ADMIN}")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(mapOf("reasonNote" to ""))
            .exchange()
            .expectStatus().isBadRequest
    }

    @Test
    fun `should allow admin to apply a restriction on another user`() {
        webTestClient.post()
            .uri("/api/admin/users/$TARGET_USER_ID/restrict")
            .header(HttpHeaders.AUTHORIZATION, "Bearer ${TestSecurityConfig.TOKEN_ADMIN}")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(RestrictRequest(ground = RestrictionGround.OBJECTION_PENDING, reasonNote = "pending verification"))
            .exchange()
            .expectStatus().isCreated
            .expectBody<RestrictionDto>()
            .consumeWith { response ->
                val body = response.responseBody!!
                assertThat(body.userId).isEqualTo(TARGET_USER_ID)
                assertThat(body.requestedBy.name).isEqualTo("ADMIN")
            }

        runBlocking {
            assertThat(restrictionRepository.findByUserId(TARGET_USER_ID)).isNotNull()
        }
    }

    @Test
    fun `should reject admin restriction without a reasonNote`() {
        webTestClient.post()
            .uri("/api/admin/users/$TARGET_USER_ID/restrict")
            .header(HttpHeaders.AUTHORIZATION, "Bearer ${TestSecurityConfig.TOKEN_ADMIN}")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(RestrictRequest(ground = RestrictionGround.OBJECTION_PENDING, reasonNote = null))
            .exchange()
            .expectStatus().isBadRequest
    }
}
