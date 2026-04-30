package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.controller.dto.ExportCategory
import com.vshpynta.expenses.api.controller.dto.ExportExpense
import com.vshpynta.expenses.api.controller.dto.ExportFile
import com.vshpynta.expenses.api.model.Category
import com.vshpynta.expenses.api.repository.CategoryRepository
import com.vshpynta.expenses.api.repository.ExpenseProjectionRepository
import com.vshpynta.expenses.api.service.ExportDefaults.UNCATEGORIZED_LABEL
import com.vshpynta.expenses.api.service.auth.UserContextService
import com.vshpynta.expenses.api.util.TimeProvider
import kotlinx.coroutines.flow.toList
import org.springframework.stereotype.Service
import java.time.Instant

/**
 * Assembles the canonical [ExportFile] snapshot for the current user.
 *
 * Format-agnostic: the same in-memory shape feeds both the JSON and the
 * CSV-in-ZIP export paths. Soft-deleted categories are still consulted
 * when resolving expense labels — historic expenses keep their original
 * category name even after the category is archived — but they are
 * excluded from the exported `categories` list to match what the
 * frontend renders.
 */
@Service
class DataExporter(
    private val categoryRepository: CategoryRepository,
    private val projectionRepository: ExpenseProjectionRepository,
    private val userContextService: UserContextService,
    private val timeProvider: TimeProvider
) {

    suspend fun exportSnapshot(): ExportFile {
        val userId = userContextService.currentUserId()
        val categories = categoryRepository.findAllByUserId(userId).toList()
        val labelByCategoryId = categories.associate { it.categoryId to it.exportLabel() }
        val expenses = projectionRepository.findAllActiveByUserId(userId).toList()

        return ExportFile(
            version = 1,
            exportedAt = Instant.ofEpochMilli(timeProvider.currentTimeMillis()).toString(),
            categories = categories
                .filter { !it.deleted }
                .sortedBy { it.sortOrder }
                .map { it.toExportCategory() },
            expenses = expenses.map { expense ->
                ExportExpense(
                    date = expense.date ?: "",
                    description = expense.description ?: "",
                    amountMinor = expense.amount,
                    currency = expense.currency,
                    category = expense.categoryId
                        ?.let { labelByCategoryId[it] }
                        ?: UNCATEGORIZED_LABEL
                )
            }
        )
    }

    private fun Category.exportLabel(): String =
        name?.takeUnless { it.isBlank() } ?: templateKey ?: UNCATEGORIZED_LABEL

    private fun Category.toExportCategory() = ExportCategory(
        name = name,
        icon = icon,
        color = color,
        sortOrder = sortOrder,
        templateKey = templateKey
    )
}
