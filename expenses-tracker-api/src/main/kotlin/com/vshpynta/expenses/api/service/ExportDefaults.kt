package com.vshpynta.expenses.api.service

/**
 * Constants shared by the export / import pipeline so the canonical
 * fallback values are defined exactly once.
 *
 * `internal` keeps these scoped to the API module — nothing outside the
 * export/import pipeline has a legitimate reason to reach for them.
 */
internal object ExportDefaults {
    const val DEFAULT_ICON: String = "Category"
    const val DEFAULT_COLOR: String = "#78909c"
    const val UNCATEGORIZED_LABEL: String = "Uncategorized"
}
