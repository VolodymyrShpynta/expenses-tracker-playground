package com.vshpynta.expenses.api.repository

import com.vshpynta.expenses.api.model.ExpensePayload
import kotlinx.coroutines.reactive.awaitFirst
import kotlinx.coroutines.reactive.awaitFirstOrNull
import org.springframework.r2dbc.core.DatabaseClient
import org.springframework.stereotype.Repository
import java.util.*

/**
 * Custom repository for idempotent UPSERT operations
 * Uses explicit SQL for compatibility with PostgreSQL and future SQLite support
 */
@Repository
class ExpenseUpsertRepository(
    private val databaseClient: DatabaseClient
) {

    /**
     * Idempotent UPSERT for expense
     * Uses ON CONFLICT DO UPDATE with conditional WHERE clause
     * UUID stored as VARCHAR(36) for database portability
     */
    suspend fun upsertExpense(payload: ExpensePayload): Int {
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
            WHERE EXCLUDED.updated_at > expenses.updated_at OR EXCLUDED.deleted = true
        """.trimIndent()

        return databaseClient.sql(sql)
            .bind("id", payload.id.toString())
            .bind("description", payload.description ?: "")
            .bind("amount", payload.amount ?: 0L)
            .bind("category", payload.category ?: "")
            .bind("date", payload.date ?: "")
            .bind("updated_at", payload.updatedAt)
            .bind("deleted", payload.deleted ?: false)
            .fetch()
            .rowsUpdated()
            .awaitFirst().toLong().toInt()
    }

    /**
     * Soft delete expense (idempotent)
     */
    suspend fun softDeleteExpense(id: UUID, updatedAt: Long): Int {
        val sql = """
            UPDATE expenses 
            SET deleted = true, updated_at = :updated_at
            WHERE id = :id AND (updated_at < :updated_at OR deleted = false)
        """.trimIndent()

        return databaseClient.sql(sql)
            .bind("id", id.toString())
            .bind("updated_at", updatedAt)
            .fetch()
            .rowsUpdated()
            .awaitFirst().toLong().toInt()
    }

    /**
     * Insert operation into operations table
     */
    suspend fun insertOperation(
        opId: UUID,
        ts: Long,
        deviceId: String,
        opType: String,
        entityId: UUID,
        payload: String
    ): Int {
        val sql = """
            INSERT INTO operations (op_id, ts, device_id, op_type, entity_id, payload, committed)
            VALUES (:op_id, :ts, :device_id, :op_type, :entity_id, :payload, false)
        """.trimIndent()

        return databaseClient.sql(sql)
            .bind("op_id", opId.toString())
            .bind("ts", ts)
            .bind("device_id", deviceId)
            .bind("op_type", opType)
            .bind("entity_id", entityId.toString())
            .bind("payload", payload)
            .fetch()
            .rowsUpdated()
            .awaitFirst().toLong().toInt()
    }

    /**
     * Mark operation as applied (idempotent)
     */
    suspend fun markOperationAsApplied(opId: UUID): Int {
        val sql = """
            INSERT INTO applied_operations (op_id)
            VALUES (:op_id)
            ON CONFLICT (op_id) DO NOTHING
        """.trimIndent()

        val result = databaseClient.sql(sql)
            .bind("op_id", opId.toString())
            .fetch()
            .rowsUpdated()
            .awaitFirstOrNull()

        return (result?.toLong() ?: 0L).toInt()
    }

    /**
     * Check if operation has been applied
     */
    suspend fun isOperationApplied(opId: UUID): Boolean {
        val sql = "SELECT COUNT(*) as count FROM applied_operations WHERE op_id = :op_id"

        val count = databaseClient.sql(sql)
            .bind("op_id", opId.toString())
            .map { row, _ -> (row.get("count") as? Number)?.toLong() ?: 0L }
            .one()
            .awaitFirst()

        return count > 0
    }

    /**
     * Mark operations as committed for a device
     */
    suspend fun markOperationsAsCommitted(deviceId: String, opIds: List<UUID>): Int {
        if (opIds.isEmpty()) return 0

        val placeholders = opIds.indices.joinToString(",") { ":opId$it" }
        val sql = """
            UPDATE operations SET committed = true
            WHERE device_id = :device_id AND op_id IN ($placeholders)
        """.trimIndent()

        var spec = databaseClient.sql(sql)
            .bind("device_id", deviceId)

        opIds.forEachIndexed { index, uuid ->
            spec = spec.bind("opId$index", uuid.toString())
        }

        val result = spec.fetch()
            .rowsUpdated()
            .awaitFirstOrNull()

        return (result?.toLong() ?: 0L).toInt()
    }
}
