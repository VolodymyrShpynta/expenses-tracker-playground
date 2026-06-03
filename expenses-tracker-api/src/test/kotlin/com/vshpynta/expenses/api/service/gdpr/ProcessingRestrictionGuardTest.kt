package com.vshpynta.expenses.api.service.gdpr

import com.vshpynta.expenses.api.config.TestContainersConfig
import com.vshpynta.expenses.api.config.TestSecurityConfig
import com.vshpynta.expenses.api.model.gdpr.ProcessingRestriction
import com.vshpynta.expenses.api.model.gdpr.RestrictionGround
import com.vshpynta.expenses.api.model.gdpr.RestrictionRequester
import com.vshpynta.expenses.api.repository.gdpr.ProcessingRestrictionRepository
import com.vshpynta.expenses.api.service.auth.UserContextService
import kotlinx.coroutines.reactor.awaitSingle
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
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
import java.time.Instant

/**
 * Integration tests for [ProcessingRestrictionGuard]. Uses the real
 * repository against Testcontainers Postgres so the SQL-level PK lookup
 * is exercised (not just a mocked repository method).
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestContainersConfig::class, TestSecurityConfig::class)
class ProcessingRestrictionGuardTest {

    companion object {
        private const val TEST_USER_ID = TestSecurityConfig.TEST_USER_ID
        private const val OTHER_USER_ID = "another-user"
    }

    @Autowired
    private lateinit var guard: ProcessingRestrictionGuard

    @Autowired
    private lateinit var restrictionRepository: ProcessingRestrictionRepository

    @Autowired
    private lateinit var databaseClient: DatabaseClient

    @MockitoBean
    private lateinit var userContextService: UserContextService

    @BeforeEach
    fun setup() {
        runBlocking {
            databaseClient.sql("DELETE FROM processing_restrictions").fetch().rowsUpdated().awaitSingle()
            whenever(userContextService.currentUserId()) doReturn TEST_USER_ID
        }
    }

    @Test
    fun `should allow writes when the current user has no restriction row`() {
        runBlocking {
            // Given: no rows in processing_restrictions

            // When / Then: guard returns normally
            guard.requireWritesAllowed()
        }
    }

    @Test
    fun `should throw ProcessingRestrictedException when the current user is restricted`() {
        // Given
        runBlocking {
            restrictionRepository.insert(restrictionFor(TEST_USER_ID, RestrictionGround.ACCURACY_CONTESTED))
        }

        // When / Then
        assertThatThrownBy {
            runBlocking { guard.requireWritesAllowed() }
        }
            .isInstanceOf(ProcessingRestrictedException::class.java)
            .satisfies({ ex ->
                ex as ProcessingRestrictedException
                assertThat(ex.userId).isEqualTo(TEST_USER_ID)
                assertThat(ex.ground).isEqualTo(RestrictionGround.ACCURACY_CONTESTED)
            })
    }

    @Test
    fun `should look up by explicit user id when caller already knows it`() {
        // Given: restriction exists for OTHER_USER_ID but not for TEST_USER_ID
        runBlocking {
            restrictionRepository.insert(restrictionFor(OTHER_USER_ID, RestrictionGround.OBJECTION_PENDING))
        }

        // When / Then: explicit user id wins over the currentUserId() mock
        assertThatThrownBy {
            runBlocking { guard.requireWritesAllowed(OTHER_USER_ID) }
        }.isInstanceOf(ProcessingRestrictedException::class.java)

        runBlocking { guard.requireWritesAllowed(TEST_USER_ID) }
    }

    private fun restrictionFor(userId: String, ground: RestrictionGround) = ProcessingRestriction(
        userId = userId,
        restrictedAt = Instant.parse("2026-06-01T00:00:00Z"),
        ground = ground,
        requestedBy = RestrictionRequester.SUBJECT,
        actorId = userId,
    )
}
