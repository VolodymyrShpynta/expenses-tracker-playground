package com.vshpynta.expenses.api.controller

import com.vshpynta.expenses.api.config.TestContainersConfig
import com.vshpynta.expenses.api.config.WebTestClientConfig
import com.vshpynta.expenses.api.dto.ExpenseRequest
import com.vshpynta.expenses.api.dto.ExpenseResponse
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.reactive.server.WebTestClient
import java.math.BigDecimal
import java.time.LocalDateTime

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(WebTestClientConfig::class, TestContainersConfig::class)
@ActiveProfiles("test")
class ExpensesControllerTest {

    @Autowired
    private lateinit var webTestClient: WebTestClient

    @Test
    fun `should add expense`() {
        val request = ExpenseRequest(
            description = "Groceries",
            amount = BigDecimal("50.00"),
            category = "Food",
            date = LocalDateTime.now()
        )

        webTestClient.post()
            .uri("/api/expenses")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(request)
            .exchange()
            .expectStatus().isCreated
            .expectBody()
            .jsonPath("$.id").exists()
            .jsonPath("$.description").isEqualTo("Groceries")
            .jsonPath("$.amount").isNumber
            .jsonPath("$.category").isEqualTo("Food")
    }

    @Test
    fun `should get all expenses`() {
        webTestClient.get()
            .uri("/api/expenses")
            .exchange()
            .expectStatus().isOk
            .expectBody()
            .jsonPath("$").isArray
    }

    @Test
    fun `should get expense by id`() {
        // First create an expense
        val request = ExpenseRequest(
            description = "Transport",
            amount = BigDecimal("25.50"),
            category = "Transportation",
            date = LocalDateTime.now()
        )

        val createdResponse = webTestClient.post()
            .uri("/api/expenses")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(request)
            .exchange()
            .expectStatus().isCreated
            .expectBody(ExpenseResponse::class.java)
            .returnResult()
            .responseBody

        // Then get it by ID
        webTestClient.get()
            .uri("/api/expenses/${createdResponse!!.id}")
            .exchange()
            .expectStatus().isOk
            .expectBody()
            .jsonPath("$.id").isNotEmpty
            .jsonPath("$.description").isEqualTo("Transport")
            .jsonPath("$.amount").isNumber
            .jsonPath("$.category").isEqualTo("Transportation")
    }
}
