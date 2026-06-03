package com.vshpynta.expenses.api.model.gdpr

import org.springframework.data.annotation.Id
import org.springframework.data.domain.Persistable
import org.springframework.data.relational.core.mapping.Column
import org.springframework.data.relational.core.mapping.Table
import java.time.Instant

/**
 * Last-seen tracking for the inactive-account retention policy. Updated
 * by [com.vshpynta.expenses.api.config.gdpr.AccountActivityFilter] on
 * each authenticated request (debounced).
 *
 * Stored locally rather than queried from Keycloak on every job tick so
 * the inactivity job doesn't fan out into per-user admin-API calls.
 */
@Table("account_activity")
data class AccountActivity(
    @Id
    @Column("user_id")
    val userId: String,

    @Column("last_seen_at")
    val lastSeenAt: Instant,

    /**
     * Timestamp at which the "your account will be erased in N days"
     * warning email was dispatched. Used to (a) avoid sending the
     * warning twice, (b) compute when the grace window has elapsed.
     */
    @Column("inactivity_warning_sent_at")
    val inactivityWarningSentAt: Instant? = null,
) : Persistable<String> {
    override fun getId(): String = userId
    override fun isNew(): Boolean = true
}
