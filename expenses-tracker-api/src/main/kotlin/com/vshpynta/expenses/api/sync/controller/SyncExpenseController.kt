package com.vshpynta.expenses.api.sync.controller

import com.vshpynta.expenses.api.sync.model.SyncExpense
import com.vshpynta.expenses.api.sync.service.ExpenseWriteService
import com.vshpynta.expenses.api.sync.service.SyncService
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
@RequestMapping("/api/v2/expenses")
class SyncExpenseController(
    private val expenseWriteService: ExpenseWriteService,
    private val syncService: SyncService
) {

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    suspend fun createExpense(@RequestBody request: CreateExpenseRequest): ExpenseDto {
        val expense = expenseWriteService.createExpense(
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
        val expense = expenseWriteService.updateExpense(
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
        val deleted = expenseWriteService.deleteExpense(UUID.fromString(id))
        if (!deleted) {
            throw NoSuchElementException("Expense not found: $id")
        }
    }

    @GetMapping
    suspend fun getAllExpenses(): Flow<ExpenseDto> {
        return expenseWriteService.getAllExpenses()
            .map { it.toDto() }
    }

    @GetMapping("/{id}")
    suspend fun getExpenseById(@PathVariable id: String): ExpenseDto {
        val expense = expenseWriteService.getExpenseById(UUID.fromString(id))
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

// DTOs
data class CreateExpenseRequest(
    val description: String,
    val amount: Long,  // cents
    val category: String,
    val date: String  // ISO 8601
)

data class UpdateExpenseRequest(
    val description: String? = null,
    val amount: Long? = null,
    val category: String? = null,
    val date: String? = null
)

data class ExpenseDto(
    val id: String,
    val description: String,
    val amount: Long,
    val category: String,
    val date: String,
    val updatedAt: Long,
    val deleted: Boolean
)

data class SyncResultDto(
    val deviceId: String,
    val message: String
)

data class DeviceIdDto(
    val deviceId: String
)
