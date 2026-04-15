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

    @Column("name")
    val name: String,

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
    val userId: String
) : Persistable<UUID> {
    override fun getId(): UUID = categoryId
    override fun isNew(): Boolean = true
}
