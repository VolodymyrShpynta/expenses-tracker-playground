package com.vshpynta.expenses.api.repository

import com.vshpynta.expenses.api.entity.Expense
import org.springframework.data.repository.kotlin.CoroutineCrudRepository
import org.springframework.stereotype.Repository

@Repository
interface ExpenseRepository : CoroutineCrudRepository<Expense, Long>
