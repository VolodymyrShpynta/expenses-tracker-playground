package com.vshpynta.expenses.api.entity

import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Column
import org.springframework.data.relational.core.mapping.Table
import java.math.BigDecimal
import java.time.LocalDateTime

@Table("expenses")
data class Expense(
    @Id
    @Column("id")
    val id: Long? = null,

    @Column("description")
    val description: String,

    @Column("amount")
    val amount: BigDecimal,

    @Column("category")
    val category: String,

    @Column("date")
    val date: LocalDateTime = LocalDateTime.now()
)
