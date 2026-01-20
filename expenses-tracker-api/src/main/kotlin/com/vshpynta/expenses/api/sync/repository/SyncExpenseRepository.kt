package com.vshpynta.expenses.api.sync.repository

import com.vshpynta.expenses.api.sync.model.SyncExpense
import kotlinx.coroutines.flow.Flow
import org.springframework.data.r2dbc.repository.Query
import org.springframework.data.repository.kotlin.CoroutineCrudRepository
import org.springframework.stereotype.Repository
import java.util.*

@Repository
interface SyncExpenseRepository : CoroutineCrudRepository<SyncExpense, UUID> {

    @Query("SELECT * FROM expenses WHERE deleted = false")
    fun findAllActive(): Flow<SyncExpense>

    @Query("SELECT * FROM expenses WHERE id = :id")
    suspend fun findByIdOrNull(id: UUID): SyncExpense?
}
