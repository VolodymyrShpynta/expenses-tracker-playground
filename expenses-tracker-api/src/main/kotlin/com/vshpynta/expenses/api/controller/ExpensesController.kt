package com.vshpynta.expenses.api.controller

import com.vshpynta.expenses.api.model.SyncExpense
import com.vshpynta.expenses.api.service.ExpenseService
import com.vshpynta.expenses.api.service.SyncService
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

/**
 * REST controller for sync-enabled expense operations
 */
@RestController
@RequestMapping("/api/expenses")
class ExpensesController(
    private val expenseService: ExpenseService,
    private val syncService: SyncService
) {

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    suspend fun createExpense(@RequestBody request: CreateExpenseRequest): ExpenseDto {
        val expense = expenseService.createExpense(
            description = request.description,
            amount = request.amount,
            category = request.category,
            date = request.date
        )
        return expense.toDto()
    }

    @PutMapping("/{id}")
    suspend fun updateExpense(
        @PathVariable id: String,
        @RequestBody request: UpdateExpenseRequest
    ): ExpenseDto {
        val expense = expenseService.updateExpense(
            id = UUID.fromString(id),
            description = request.description,
            amount = request.amount,
            category = request.category,
            date = request.date
        ) ?: throw NoSuchElementException("Expense not found: $id")

        return expense.toDto()
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    suspend fun deleteExpense(@PathVariable id: String) {
        val deleted = expenseService.deleteExpense(UUID.fromString(id))
        if (!deleted) {
            throw NoSuchElementException("Expense not found: $id")
        }
    }

    @GetMapping
    suspend fun getAllExpenses(): Flow<ExpenseDto> {
        return expenseService.getAllExpenses()
            .map { it.toDto() }
    }

    @GetMapping("/{id}")
    suspend fun getExpenseById(@PathVariable id: String): ExpenseDto {
        val expense = expenseService.getExpenseById(UUID.fromString(id))
            ?: throw NoSuchElementException("Expense not found: $id")
        return expense.toDto()
    }

    @PostMapping("/sync")
    suspend fun triggerSync(): SyncResultDto {
        syncService.performFullSync()
        return SyncResultDto(
            deviceId = syncService.getDeviceId(),
            message = "Sync completed successfully"
        )
    }

    @GetMapping("/device-id")
    suspend fun getDeviceId(): DeviceIdDto {
        return DeviceIdDto(deviceId = syncService.getDeviceId())
    }

    private fun SyncExpense.toDto() = ExpenseDto(
        id = id.toString(),
        description = description ?: "",
        amount = amount,
        category = category ?: "",
        date = date ?: "",
        updatedAt = updatedAt,
        deleted = deleted
    )
}

