package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.controller.dto.ExportCategory
import com.vshpynta.expenses.api.controller.dto.ExportExpense
import com.vshpynta.expenses.api.controller.dto.ImportResultDto
import com.vshpynta.expenses.api.controller.dto.RowError
import com.vshpynta.expenses.api.model.Category
import com.vshpynta.expenses.api.repository.CategoryRepository
import com.vshpynta.expenses.api.service.ExportDefaults.DEFAULT_COLOR
import com.vshpynta.expenses.api.service.ExportDefaults.DEFAULT_ICON
import com.vshpynta.expenses.api.service.ExportDefaults.UNCATEGORIZED_LABEL
import com.vshpynta.expenses.api.service.auth.UserContextService
import kotlinx.coroutines.flow.toList
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.util.UUID

/**
 * Applies a parsed export snapshot through the standard write paths
 * ([CategoryService] / [ExpenseCommandService]) so events, projections
 * and sync entries are produced exactly as for a regular create.
 *
 * Format-agnostic — both the JSON and the CSV-in-ZIP decode paths feed
 * the same orchestrator, so format-specific concerns stay out of the
 * apply logic.
 */
@Service
class DataImporter(
    private val categoryRepository: CategoryRepository,
    private val categoryService: CategoryService,
    private val expenseCommandService: ExpenseCommandService,
    private val userContextService: UserContextService
) {

    companion object {
        private val logger = LoggerFactory.getLogger(DataImporter::class.java)
    }

    suspend fun applyImport(
        categories: List<ExportCategory>,
        expenses: List<ExportExpense>
    ): ImportResultDto {
        val resolver = loadCategoryResolver()
        val categoryOutcome = importCategories(categories, resolver)
        val expenseOutcome = importExpenses(expenses, resolver)
        val totalCategoriesCreated = categoryOutcome.created + resolver.autoCreated

        logger.info(
            "Import finished: {} categories, {} expenses (skipped: {})",
            totalCategoriesCreated,
            expenseOutcome.created,
            categoryOutcome.skipped + expenseOutcome.skipped
        )
        return ImportResultDto(
            categoriesCreated = totalCategoriesCreated,
            expensesCreated = expenseOutcome.created,
            skipped = categoryOutcome.skipped + expenseOutcome.skipped,
            errors = categoryOutcome.errors + expenseOutcome.errors
        )
    }

    /**
     * Inserts unknown categories from the export. Already-known
     * categories (matched by `templateKey` or `name`) are reused so
     * re-importing the same export is idempotent. Templated rows whose
     * `template_key` isn't known to this user are skipped — only the
     * seeder owns templated rows, and forging arbitrary template keys
     * would corrupt the reset-to-defaults flow.
     */
    private suspend fun importCategories(
        categories: List<ExportCategory>,
        resolver: CategoryResolver
    ): PhaseOutcome {
        val outcome = MutablePhaseOutcome()
        for (category in categories) {
            if (resolver.resolveExisting(category) != null) continue
            val displayName = category.name?.takeUnless { it.isBlank() }
            if (displayName == null) {
                logger.debug("Skipping templated category '{}' — template not present", category.templateKey)
                outcome.skipped++
                continue
            }
            outcome.tryRecord("category", displayName) {
                val created = categoryService.createCategory(
                    name = displayName,
                    icon = category.icon.ifBlank { DEFAULT_ICON },
                    color = category.color.ifBlank { DEFAULT_COLOR },
                    sortOrder = category.sortOrder
                )
                resolver.register(created)
            }
        }
        return outcome.toImmutable()
    }

    /**
     * Inserts each expense via the standard command path so events,
     * projections and sync entries are produced exactly as for a regular
     * create. Unknown category labels are auto-created by the resolver,
     * so an expense is never lost.
     */
    private suspend fun importExpenses(
        expenses: List<ExportExpense>,
        resolver: CategoryResolver
    ): PhaseOutcome {
        val outcome = MutablePhaseOutcome()
        for (expense in expenses) {
            outcome.tryRecord("expense", expense.description) {
                val categoryId = resolver.resolveOrCreateByLabel(expense.category)
                expenseCommandService.createExpense(
                    description = expense.description,
                    amount = expense.amountMinor,
                    currency = expense.currency,
                    categoryId = categoryId,
                    date = expense.date
                )
            }
        }
        return outcome.toImmutable()
    }

    /**
     * Runs `action`, accumulating per-item bookkeeping into the
     * outcome: success bumps `created`; any thrown error is logged,
     * appended to `errors` as a structured [RowError], and bumps
     * `skipped`. Pulled out so both phases (categories and expenses)
     * share the same retry/log/accumulate semantics without duplicating
     * the `runCatching { … }.onFailure { … }` ceremony.
     */
    private inline fun MutablePhaseOutcome.tryRecord(
        kind: String,
        label: String,
        action: () -> Unit
    ) {
        try {
            action()
            created++
        } catch (t: Throwable) {
            logger.warn("Skipping {} '{}' on import: {}", kind, label, t.message)
            errors.add(RowError(kind = kind, label = label, message = t.message))
            skipped++
        }
    }

    /**
     * Loads the current user's categories and indexes them by
     * `templateKey` and lower-cased `name` so the resolver can match
     * imported rows against existing categories without re-querying.
     */
    private suspend fun loadCategoryResolver(): CategoryResolver {
        val byTemplate = HashMap<String, UUID>()
        val byName = HashMap<String, UUID>()
        categoryRepository.findAllByUserId(userContextService.currentUserId())
            .toList()
            .filter { !it.deleted }
            .forEach { category ->
                category.templateKey?.let { byTemplate[it] = category.categoryId }
                category.name?.let { byName[it.lowercase()] = category.categoryId }
            }
        return CategoryResolver(byTemplate, byName)
    }

    /**
     * Resolves imported category labels to real category UUIDs. Existing
     * categories take precedence (matched first by `templateKey`, then
     * by case-insensitive `name`); unknown labels become fresh custom
     * categories so expenses are never lost on import.
     *
     * Modelled as an `inner class` so it can call into the outer
     * [DataImporter]'s collaborators ([categoryService]) directly —
     * threading them through a constructor would be ceremony for a
     * private nested helper that has no other call site.
     */
    private inner class CategoryResolver(
        private val byTemplateKey: MutableMap<String, UUID>,
        private val byName: MutableMap<String, UUID>
    ) {

        /**
         * Number of categories this resolver had to fabricate while
         * resolving expense labels. Surfaced to [applyImport] so the
         * import summary matches the DB state — otherwise auto-created
         * categories would not be reported in `categoriesCreated`.
         */
        var autoCreated: Int = 0
            private set

        fun resolveExisting(category: ExportCategory): UUID? {
            category.templateKey?.let { byTemplateKey[it] }?.let { return it }
            category.name?.let { byName[it.lowercase()] }?.let { return it }
            return null
        }

        fun register(category: Category) {
            category.templateKey?.let { byTemplateKey[it] = category.categoryId }
            category.name?.let { byName[it.lowercase()] = category.categoryId }
        }

        suspend fun resolveOrCreateByLabel(label: String): UUID {
            val trimmed = label.trim().ifEmpty { UNCATEGORIZED_LABEL }
            byTemplateKey[trimmed]?.let { return it }
            byName[trimmed.lowercase()]?.let { return it }
            val created = categoryService.createCategory(
                name = trimmed,
                icon = DEFAULT_ICON,
                color = DEFAULT_COLOR,
                sortOrder = 0
            )
            register(created)
            autoCreated++
            return created.categoryId
        }
    }

    /** Immutable result of importing a single phase (categories or expenses). */
    private data class PhaseOutcome(
        val created: Int,
        val skipped: Int,
        val errors: List<RowError>
    )

    /** Mutable accumulator used while a phase is running. */
    private class MutablePhaseOutcome {
        var created: Int = 0
        var skipped: Int = 0
        val errors: MutableList<RowError> = mutableListOf()

        fun toImmutable(): PhaseOutcome = PhaseOutcome(created, skipped, errors.toList())
    }
}
