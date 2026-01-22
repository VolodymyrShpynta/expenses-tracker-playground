package com.vshpynta.expenses.api.model

import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Column
import org.springframework.data.relational.core.mapping.Table
import java.util.UUID

/**
 * Entity for processed_events table (event idempotency registry)
 * Tracks which events have already been processed to ensure idempotency
 */
@Table("processed_events")
data class ProcessedEvent(
    @Id
    @Column("event_id")
    val eventId: UUID
)
