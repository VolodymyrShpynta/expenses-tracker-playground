package com.vshpynta.expenses.api.controller.dto

import com.fasterxml.jackson.annotation.JsonPropertyOrder

/**
 * Export file envelope used by the JSON export/import path.
 *
 * Versioned so that future schema changes can be detected and migrated
 * (or rejected) on import. The shape mirrors the public DTOs so the file
 * is human-readable and trivially diffable. Amounts stay in cents to
 * preserve precision across all ISO-4217 currencies (incl. zero-decimal
 * ones like JPY).
 *
 * Note: this format is intentionally a portable export, not a true
 * backup — primary keys are not preserved across the boundary, so an
 * import "merges into my data" rather than restoring a snapshot
 * verbatim. A full backup would require event-history fidelity and is
 * not what this format represents.
 */
data class ExportFile(
    val version: Int = 1,
    val exportedAt: String,
    val categories: List<ExportCategory>,
    val expenses: List<ExportExpense>
)

/**
 * Category snapshot — drops `activeExpenseCount` (a derived field) and
 * keeps `templateKey` so reset-to-defaults still works after import.
 *
 * Field order is fixed by `@JsonPropertyOrder` so Jackson CSV emits the
 * columns in a stable, human-friendly sequence (and so the JSON shape
 * matches the CSV column order).
 */
@JsonPropertyOrder("name", "icon", "color", "sortOrder", "templateKey")
data class ExportCategory(
    val name: String?,
    val icon: String,
    val color: String,
    val sortOrder: Int,
    val templateKey: String?
)

/**
 * Expense snapshot. `category` is the human-readable category label
 * resolved at export time; on import we use it (case-insensitive) to map
 * to a real category, so exports remain valid even if category UUIDs
 * change between devices.
 *
 * Field names go on the wire as-is (camelCase) — the wire format is
 * deliberately uniform with the rest of the API surface, no per-field
 * snake_case overrides.
 */
@JsonPropertyOrder("date", "description", "amountMinor", "currency", "category")
data class ExportExpense(
    val date: String,                                  // ISO 8601
    val description: String,
    val amountMinor: Long,                             // cents
    val currency: String,                              // ISO 4217
    val category: String                               // category label at export time
)

/**
 * Result of an import operation.
 *
 * Two error channels intentionally:
 *  - [fatal] is set when the upload as a whole could not be processed
 *    (e.g. malformed JSON, missing required CSV entry). When [fatal] is
 *    set, [categoriesCreated] / [expensesCreated] are 0 and the UI
 *    surfaces this as an error.
 *  - [errors] holds per-row failures from a partially-successful
 *    import — the upload was readable but specific rows could not be
 *    applied. The UI surfaces this as a warning summary.
 */
data class ImportResultDto(
    val categoriesCreated: Int,
    val expensesCreated: Int,
    val skipped: Int,
    val errors: List<RowError> = emptyList(),
    val fatal: String? = null
)

/**
 * Per-row import failure. Carries the [kind] (`category` / `expense`)
 * and a user-recognisable [label] separately so the frontend can format
 * the row consistently and translate the prefix; [message] is the
 * underlying validation / persistence error and stays as-is.
 */
data class RowError(
    val kind: String,
    val label: String,
    val message: String?
)
