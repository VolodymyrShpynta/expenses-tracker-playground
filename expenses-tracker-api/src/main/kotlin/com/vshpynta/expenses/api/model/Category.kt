package com.vshpynta.expenses.api.model

import org.springframework.data.annotation.Id
import org.springframework.data.domain.Persistable
import org.springframework.data.relational.core.mapping.Column
import org.springframework.data.relational.core.mapping.Table
import java.util.UUID

/**
 * User-configurable expense category with icon and color.
 * Implements Persistable to always treat saves as inserts (upsert via repository query).
 */
@Table("categories")
data class Category(
    @Id
    @Column("id")
    val categoryId: UUID = UUID.randomUUID(),

    /**
     * Display name override. `null` for pristine templated rows — the
     * frontend then renders the translated `categoryTemplates.<templateKey>`.
     * For user-created (custom) categories `templateKey` is `null` and `name`
     * MUST be non-null; the DB CHECK constraint enforces "at least one".
     */
    @Column("name")
    val name: String?,

    @Column("icon")
    val icon: String,

    @Column("color")
    val color: String,

    @Column("sort_order")
    val sortOrder: Int = 0,

    @Column("updated_at")
    val updatedAt: Long,

    @Column("deleted")
    val deleted: Boolean = false,

    @Column("user_id")
    val userId: String,

    /**
     * Stable slug linking this row to a template in `default_categories`.
     * `null` means the user created the category themselves (custom).
     * Non-null categories are managed by the seeder / reset flow.
     */
    @Column("template_key")
    val templateKey: String? = null
) : Persistable<UUID> {
    override fun getId(): UUID = categoryId
    override fun isNew(): Boolean = true
}
