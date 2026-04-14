package com.vshpynta.expenses.api.controller

import com.vshpynta.expenses.api.config.TestContainersConfig
import com.vshpynta.expenses.api.config.WebTestClientConfig
import com.vshpynta.expenses.api.controller.dto.CreateExpenseRequest
import com.vshpynta.expenses.api.controller.dto.ExpenseDto
import com.vshpynta.expenses.api.controller.dto.UpdateExpenseRequest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.reactive.server.WebTestClient
import org.springframework.test.web.reactive.server.expectBody

/**
 * Integration tests for sync controller endpoints
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(WebTestClientConfig::class, TestContainersConfig::class)
@ActiveProfiles("test")
class SyncExpenseControllerTest {

    @Autowired
    private lateinit var webTestClient: WebTestClient

    @Test
    fun `should create expense`() {
        val request = CreateExpenseRequest(
            description = "Coffee",
            amount = 450,  // $4.50 in cents
            currency = "USD",
            category = "Food",
            date = "2026-01-20T10:00:00Z"
        )

        webTestClient.post()
            .uri("/api/expenses")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(request)
            .exchange()
            .expectStatus().isCreated
            .expectBody<ExpenseDto>()
            .consumeWith { response ->
                val expense = response.responseBody!!
                assertThat(expense.description).isEqualTo("Coffee")
                assertThat(expense.amount).isEqualTo(450L)
                assertThat(expense.category).isEqualTo("Food")
                assertThat(expense.deleted).isFalse()
            }
    }

    @Test
    fun `should get all expenses`() {
        // Create an expense first
        val request = CreateExpenseRequest(
            description = "Lunch",
            amount = 1200,
            currency = "USD",
            category = "Food",
            date = "2026-01-20T12:00:00Z"
        )

        webTestClient.post()
            .uri("/api/expenses")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(request)
            .exchange()
            .expectStatus().isCreated

        // Get all expenses
        webTestClient.get()
            .uri("/api/expenses")
            .exchange()
            .expectStatus().isOk
            .expectBody<List<ExpenseDto>>()
            .consumeWith { response ->
                val expenses = response.responseBody!!
                assertThat(expenses).isNotEmpty()
                assertThat(expenses).anyMatch { it.description == "Lunch" }
            }
    }

    @Test
    fun `should update expense`() {
        // Create expense
        val createRequest = CreateExpenseRequest(
            description = "Original",
            amount = 1000,
            currency = "USD",
            category = "Food",
            date = "2026-01-20T10:00:00Z"
        )

        val created = webTestClient.post()
            .uri("/api/expenses")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(createRequest)
            .exchange()
            .expectStatus().isCreated
            .expectBody<ExpenseDto>()
            .returnResult()
            .responseBody!!

        // Update expense
        val updateRequest = UpdateExpenseRequest(
            description = "Updated",
            amount = 2000
        )

        webTestClient.put()
            .uri("/api/expenses/${created.id}")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(updateRequest)
            .exchange()
            .expectStatus().isOk
            .expectBody<ExpenseDto>()
            .consumeWith { response ->
                val updated = response.responseBody!!
                assertThat(updated.description).isEqualTo("Updated")
                assertThat(updated.amount).isEqualTo(2000L)
                assertThat(updated.updatedAt).isGreaterThan(created.updatedAt)
            }
    }

    @Test
    fun `should delete expense`() {
        // Create expense
        val createRequest = CreateExpenseRequest(
            description = "To Delete",
            amount = 500,
            currency = "USD",
            category = "Test",
            date = "2026-01-20T10:00:00Z"
        )

        val created = webTestClient.post()
            .uri("/api/expenses")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(createRequest)
            .exchange()
            .expectStatus().isCreated
            .expectBody<ExpenseDto>()
            .returnResult()
            .responseBody!!

        // Delete expense
        webTestClient.delete()
            .uri("/api/expenses/${created.id}")
            .exchange()
            .expectStatus().isNoContent

        // Verify deletion
        webTestClient.get()
            .uri("/api/expenses/${created.id}")
            .exchange()
            .expectStatus().isNotFound
    }

    @Test
    fun `should trigger sync`() {
        // Create some expenses
        val request = CreateExpenseRequest(
            description = "Sync Test",
            amount = 1500,
            currency = "USD",
            category = "Test",
            date = "2026-01-20T10:00:00Z"
        )

        webTestClient.post()
            .uri("/api/expenses")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(request)
            .exchange()
            .expectStatus().isCreated

        // Trigger sync
        webTestClient.post()
            .uri("/api/expenses/sync")
            .exchange()
            .expectStatus().isOk
            .expectBody()
            .jsonPath("$.message").isEqualTo("Sync completed successfully")
    }

    @Test
    fun `should return 404 for non-existent expense`() {
        val nonExistentId = "00000000-0000-0000-0000-000000000000"

        webTestClient.get()
            .uri("/api/expenses/$nonExistentId")
            .exchange()
            .expectStatus().isNotFound
    }
}
