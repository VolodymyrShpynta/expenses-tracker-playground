package com.vshpynta.expenses.api.controller.dto

import com.vshpynta.expenses.api.controller.dto.FieldLimits.CATEGORY_COLOR_LENGTH


/**
 * Request-side field length limits.
 *
 * These are intentionally smaller than the DB column widths to reserve headroom
 * and produce clean 400 responses at the API boundary instead of DB constraint errors.
 *
 *  DB column widths (see V1/V2/V3 migrations):
 *    - expense_projections.description  VARCHAR(500)
 *    - expense_projections.category     VARCHAR(100)
 *    - expense_projections.date         VARCHAR(50)
 *    - expense_projections.currency     VARCHAR(3)
 *    - categories.name                  VARCHAR(100)
 *    - categories.icon                  VARCHAR(50)
 *    - categories.color                 VARCHAR(7)
 */
object FieldLimits {
    const val EXPENSE_DESCRIPTION_MAX = 200
    const val EXPENSE_CATEGORY_MAX = 50
    const val EXPENSE_DATE_MAX = 50
    const val CURRENCY_CODE_LENGTH = 3

    const val CATEGORY_NAME_MAX = 50
    const val CATEGORY_ICON_MAX = 50
    const val CATEGORY_COLOR_LENGTH = 7

    /** Six-digit hex color, e.g. `#ff5722`. Width matches [CATEGORY_COLOR_LENGTH]. */
    const val CATEGORY_COLOR_PATTERN = "^#[0-9a-fA-F]{6}$"
}
