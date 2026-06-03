package com.vshpynta.expenses.api.repository.gdpr

import com.vshpynta.expenses.api.model.gdpr.ProcessingRestriction
import kotlinx.coroutines.flow.Flow
import org.springframework.data.r2dbc.repository.Modifying
import org.springframework.data.r2dbc.repository.Query
import org.springframework.data.repository.kotlin.CoroutineCrudRepository
import org.springframework.stereotype.Repository
import java.time.Instant

/**
 * Live state for Art. 18 restrictions. PK is `user_id` so the hot-path
 * "is this user restricted?" check is a single primary-key lookup
 * (called by the write guard on every command).
 */
@Repository
interface ProcessingRestrictionRepository : CoroutineCrudRepository<ProcessingRestriction, String> {

    @Query("SELECT EXISTS (SELECT 1 FROM processing_restrictions WHERE user_id = :userId)")
    suspend fun existsByUserId(userId: String): Boolean

    @Query("SELECT * FROM processing_restrictions WHERE user_id = :userId")
    suspend fun findByUserId(userId: String): ProcessingRestriction?

    /**
     * Insert a restriction row. Conflict-on-PK is rejected at the call
     * site (idempotency is intentionally **not** baked in here — the
     * service must explicitly decide whether re-applying a restriction
     * is allowed for a given ground).
     */
    @Modifying
    @Query(
        """
        INSERT INTO processing_restrictions
            (user_id, restricted_at, ground, requested_by, actor_id, reason_note, lift_notice_sent_at)
        VALUES
            (:#{#r.userId}, :#{#r.restrictedAt}, :#{#r.ground}, :#{#r.requestedBy},
             :#{#r.actorId}, :#{#r.reasonNote}, :#{#r.liftNoticeSentAt})
        """
    )
    suspend fun insert(r: ProcessingRestriction): Int

    /**
     * Stamps the Art. 18(3) pre-lift notice timestamp. Returns the number
     * of rows updated so the caller can detect "no live restriction" vs
     * "already-stamped" without a separate read.
     */
    @Modifying
    @Query(
        """
        UPDATE processing_restrictions
        SET lift_notice_sent_at = :sentAt
        WHERE user_id = :userId AND lift_notice_sent_at IS NULL
        """
    )
    suspend fun stampLiftNotice(userId: String, sentAt: Instant): Int

    /**
     * Deletes the live restriction row. The audit row in
     * `processing_restriction_log` is preserved and is what proves the
     * restriction ever existed.
     */
    @Modifying
    @Query("DELETE FROM processing_restrictions WHERE user_id = :userId")
    suspend fun deleteByUserId(userId: String): Int

    /**
     * Used by the inactivity job to skip any user who is currently
     * restricted (Art. 18(1)(c) explicitly preserves data for legal
     * claims; auto-erasing such an account would be a serious failure).
     * Returns the full list (small — restrictions are rare) so the job
     * can build an in-memory `Set<String>` for an O(1) check.
     */
    @Query("SELECT user_id FROM processing_restrictions")
    fun findAllRestrictedUserIds(): Flow<String>
}
