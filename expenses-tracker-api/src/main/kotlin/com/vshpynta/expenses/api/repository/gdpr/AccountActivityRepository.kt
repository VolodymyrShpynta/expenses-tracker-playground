package com.vshpynta.expenses.api.repository.gdpr

import com.vshpynta.expenses.api.model.gdpr.AccountActivity
import kotlinx.coroutines.flow.Flow
import org.springframework.data.r2dbc.repository.Modifying
import org.springframework.data.r2dbc.repository.Query
import org.springframework.data.repository.kotlin.CoroutineCrudRepository
import org.springframework.stereotype.Repository
import java.time.Instant

@Repository
interface AccountActivityRepository : CoroutineCrudRepository<AccountActivity, String> {

    @Query("SELECT * FROM account_activity WHERE user_id = :userId")
    suspend fun findByUserId(userId: String): AccountActivity?

    /**
     * UPSERT the last-seen timestamp. The composite write — INSERT or
     * UPDATE — happens atomically so two concurrent requests can't
     * leave the row half-written. The conditional `WHERE` guarantees the
     * stored timestamp is monotonically non-decreasing.
     */
    @Modifying
    @Query(
        """
        INSERT INTO account_activity (user_id, last_seen_at)
        VALUES (:userId, :seenAt)
        ON CONFLICT (user_id) DO UPDATE SET
            last_seen_at = EXCLUDED.last_seen_at
        WHERE EXCLUDED.last_seen_at > account_activity.last_seen_at
        """
    )
    suspend fun touch(userId: String, seenAt: Instant): Int

    @Modifying
    @Query(
        """
        UPDATE account_activity
        SET inactivity_warning_sent_at = :sentAt
        WHERE user_id = :userId
        """
    )
    suspend fun stampWarningSent(userId: String, sentAt: Instant): Int

    /**
     * Candidates for the inactivity-warning step. A row qualifies when
     * (a) it has been inactive past the warning threshold, AND (b) the
     * warning email hasn't been sent yet.
     */
    @Query(
        """
        SELECT * FROM account_activity
        WHERE last_seen_at < :inactiveBefore
          AND inactivity_warning_sent_at IS NULL
        """
    )
    fun findCandidatesForWarning(inactiveBefore: Instant): Flow<AccountActivity>

    /**
     * Candidates for the inactivity-erasure step. A row qualifies when
     * (a) the warning was sent AND the grace window has elapsed since
     * then, AND (b) the user hasn't logged in since the warning was
     * sent (still inactive).
     */
    @Query(
        """
        SELECT * FROM account_activity
        WHERE inactivity_warning_sent_at IS NOT NULL
          AND inactivity_warning_sent_at < :graceCutoff
          AND last_seen_at <= inactivity_warning_sent_at
        """
    )
    fun findCandidatesForErasure(graceCutoff: Instant): Flow<AccountActivity>

    @Modifying
    @Query("DELETE FROM account_activity WHERE user_id = :userId")
    suspend fun deleteByUserId(userId: String): Int
}
