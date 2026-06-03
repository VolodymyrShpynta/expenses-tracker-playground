package com.vshpynta.expenses.api.repository.gdpr

import com.vshpynta.expenses.api.model.gdpr.GdprErasureLogEntry
import org.springframework.data.r2dbc.repository.Modifying
import org.springframework.data.r2dbc.repository.Query
import org.springframework.data.repository.kotlin.CoroutineCrudRepository
import org.springframework.stereotype.Repository

/**
 * Audit log for Art. 17 erasures. The row itself is append-only with
 * one narrow exception: [markKeycloakDeleted] flips the
 * `keycloak_deleted` flag from `false` to `true` once the Keycloak
 * account has actually been deleted (best-effort, post-commit). All
 * other fields are write-once at insert time and are never modified
 * or deleted.
 */
@Repository
interface GdprErasureLogRepository : CoroutineCrudRepository<GdprErasureLogEntry, Long> {

    /**
     * One-way flip of `keycloak_deleted` from `false` to `true` on the
     * row identified by [id]. Idempotent — re-running is a no-op
     * because the `WHERE` clause already filters out flipped rows.
     */
    @Modifying
    @Query("UPDATE gdpr_erasure_log SET keycloak_deleted = true WHERE id = :id AND keycloak_deleted = false")
    suspend fun markKeycloakDeleted(id: Long): Int
}
