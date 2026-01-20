package com.vshpynta.expenses.api.controller

import com.vshpynta.expenses.api.dto.ExpenseRequest
import com.vshpynta.expenses.api.dto.ExpenseResponse
import com.vshpynta.expenses.api.entity.Expense
import com.vshpynta.expenses.api.repository.ExpenseRepositoryImpl
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDateTime
import java.util.UUID

@RestController
@RequestMapping("/api/expenses")
class ExpensesController(
    private val expenseRepository: ExpenseRepositoryImpl
) {

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    suspend fun addExpense(@RequestBody request: ExpenseRequest): ExpenseResponse {
        val expense = Expense(
            description = request.description,
            amount = request.amount,
            category = request.category,
            date = request.date ?: LocalDateTime.now()
        )

        val savedExpense = expenseRepository.save(expense)

        return savedExpense.toResponse()
    }

    @GetMapping
    suspend fun getExpenses(): Flow<ExpenseResponse> {
        return expenseRepository.findAll()
            .map { it.toResponse() }
    }

    @GetMapping("/{id}")
    suspend fun getExpenseById(@PathVariable id: String): ExpenseResponse {
        val expense = expenseRepository.findById(UUID.fromString(id))
            ?: throw NoSuchElementException("Expense with id $id not found")

        return expense.toResponse()
    }

    private fun Expense.toResponse() = ExpenseResponse(
        id = id.toString(),
        description = description,
        amount = amount,
        category = category,
        date = date
    )
}
