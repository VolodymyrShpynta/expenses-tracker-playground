package com.vshpynta.expenses.api.model

import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Column
import org.springframework.data.relational.core.mapping.Table
import java.util.UUID

/**
 * Template category used to seed new users with a default set of categories.
 * Stored in the `default_categories` table (no user_id).
 */
@Table("default_categories")
data class DefaultCategory(
    @Id
    @Column("id")
    val categoryId: UUID,

    @Column("name")
    val name: String,

    @Column("icon")
    val icon: String,

    @Column("color")
    val color: String,

    @Column("sort_order")
    val sortOrder: Int = 0,
)
