package com.vshpynta.expenses.api.dto

import java.math.BigDecimal
import java.time.LocalDateTime

data class ExpenseRequest(
    val description: String,
    val amount: BigDecimal,
    val category: String,
    val date: LocalDateTime? = null
)

data class ExpenseResponse(
    val id: Long,
    val description: String,
    val amount: BigDecimal,
    val category: String,
    val date: LocalDateTime
)
