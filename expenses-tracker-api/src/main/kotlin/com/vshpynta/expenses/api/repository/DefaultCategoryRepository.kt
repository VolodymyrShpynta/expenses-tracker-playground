package com.vshpynta.expenses.api.repository

import com.vshpynta.expenses.api.model.DefaultCategory
import kotlinx.coroutines.flow.Flow
import org.springframework.data.r2dbc.repository.Query
import org.springframework.data.repository.kotlin.CoroutineCrudRepository
import org.springframework.stereotype.Repository

/**
 * Read-only repository for the default_categories template table.
 */
@Repository
interface DefaultCategoryRepository : CoroutineCrudRepository<DefaultCategory, String> {

    @Query("SELECT * FROM default_categories ORDER BY sort_order, template_key")
    fun findAllOrdered(): Flow<DefaultCategory>
}
