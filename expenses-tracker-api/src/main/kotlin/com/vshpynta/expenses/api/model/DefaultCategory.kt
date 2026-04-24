package com.vshpynta.expenses.api.model

import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Column
import org.springframework.data.relational.core.mapping.Table

/**
 * Template category used to seed new users with a default set of categories.
 * Stored in the `default_categories` table (no user_id).
 *
 * Display names are translated on the frontend via the
 * `categoryTemplates.<templateKey>` i18n namespace, so this row carries no
 * `name` or `language` of its own — `templateKey` is the only identifier.
 */
@Table("default_categories")
data class DefaultCategory(
    @Id
    @Column("template_key")
    val templateKey: String,

    @Column("icon")
    val icon: String,

    @Column("color")
    val color: String,

    @Column("sort_order")
    val sortOrder: Int = 0,
)
