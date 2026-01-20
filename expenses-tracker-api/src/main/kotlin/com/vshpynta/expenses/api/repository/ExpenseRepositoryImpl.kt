package com.vshpynta.expenses.api.repository

import com.vshpynta.expenses.api.entity.Expense
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.reactive.asFlow
import kotlinx.coroutines.reactive.awaitFirst
import kotlinx.coroutines.reactive.awaitFirstOrNull
import org.springframework.r2dbc.core.DatabaseClient
import org.springframework.stereotype.Repository
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.UUID

/**
 * Custom repository to bridge old API (BigDecimal/LocalDateTime) with new schema (BIGINT/VARCHAR)
 */
@Repository
class ExpenseRepositoryImpl(
    private val databaseClient: DatabaseClient
) {

    private val dateFormatter = DateTimeFormatter.ISO_DATE_TIME

    suspend fun save(expense: Expense): Expense {
        val id = expense.id ?: UUID.randomUUID()
        val amountCents = expense.amount.multiply(BigDecimal("100")).setScale(0, RoundingMode.HALF_UP).toLong()
        val dateStr = expense.date.format(dateFormatter)
        val now = System.currentTimeMillis()

        val sql = """
            INSERT INTO expenses (id, description, amount, category, date, updated_at, deleted)
            VALUES (:id, :description, :amount, :category, :date, :updated_at, :deleted)
            ON CONFLICT (id) DO UPDATE SET
                description = EXCLUDED.description,
                amount = EXCLUDED.amount,
                category = EXCLUDED.category,
                date = EXCLUDED.date,
                updated_at = EXCLUDED.updated_at,
                deleted = EXCLUDED.deleted
        """.trimIndent()

        databaseClient.sql(sql)
            .bind("id", id.toString())
            .bind("description", expense.description)
            .bind("amount", amountCents)
            .bind("category", expense.category)
            .bind("date", dateStr)
            .bind("updated_at", now)
            .bind("deleted", false)
            .fetch()
            .rowsUpdated()
            .awaitFirst()

        return expense.copy(id = id, updatedAt = now)
    }

    fun findAll(): Flow<Expense> {
        val sql = "SELECT * FROM expenses WHERE deleted = false"

        return databaseClient.sql(sql)
            .map { row, _ ->
                val amountCents = (row.get("amount") as? Number)?.toLong() ?: 0L
                val amountDollars = BigDecimal(amountCents).divide(BigDecimal("100"), 2, RoundingMode.HALF_UP)
                val dateStr = row.get("date", String::class.java) ?: ""
                val idStr = row.get("id", String::class.java) ?: ""

                Expense(
                    id = if (idStr.isNotEmpty()) UUID.fromString(idStr) else null,
                    description = row.get("description", String::class.java) ?: "",
                    amount = amountDollars,
                    category = row.get("category", String::class.java) ?: "",
                    date = LocalDateTime.parse(dateStr, dateFormatter),
                    updatedAt = (row.get("updated_at") as? Number)?.toLong() ?: 0L,
                    deleted = (row.get("deleted") as? Boolean) ?: false
                )
            }
            .all()
            .asFlow()
    }

    suspend fun findById(id: UUID): Expense? {
        val sql = "SELECT * FROM expenses WHERE id = :id AND deleted = false"

        return databaseClient.sql(sql)
            .bind("id", id.toString())
            .map { row, _ ->
                val amountCents = (row.get("amount") as? Number)?.toLong() ?: 0L
                val amountDollars = BigDecimal(amountCents).divide(BigDecimal("100"), 2, RoundingMode.HALF_UP)
                val dateStr = row.get("date", String::class.java) ?: ""
                val idStr = row.get("id", String::class.java) ?: ""

                Expense(
                    id = if (idStr.isNotEmpty()) UUID.fromString(idStr) else null,
                    description = row.get("description", String::class.java) ?: "",
                    amount = amountDollars,
                    category = row.get("category", String::class.java) ?: "",
                    date = LocalDateTime.parse(dateStr, dateFormatter),
                    updatedAt = (row.get("updated_at") as? Number)?.toLong() ?: 0L,
                    deleted = (row.get("deleted") as? Boolean) ?: false
                )
            }
            .one()
            .awaitFirstOrNull()
    }
}
