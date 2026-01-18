package com.vshpynta.expenses.api.controller

import com.vshpynta.expenses.api.dto.ExpenseRequest
import com.vshpynta.expenses.api.dto.ExpenseResponse
import com.vshpynta.expenses.api.entity.Expense
import com.vshpynta.expenses.api.repository.ExpenseRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.*
import java.time.LocalDateTime

@RestController
@RequestMapping("/api/expenses")
class ExpensesController(
    private val expenseRepository: ExpenseRepository
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
    suspend fun getExpenseById(@PathVariable id: Long): ExpenseResponse {
        val expense = expenseRepository.findById(id)
            ?: throw NoSuchElementException("Expense with id $id not found")

        return expense.toResponse()
    }

    private fun Expense.toResponse() = ExpenseResponse(
        id = id!!,
        description = description,
        amount = amount,
        category = category,
        date = date
    )
}
