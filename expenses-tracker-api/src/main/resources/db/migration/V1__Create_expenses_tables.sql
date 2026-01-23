-- Migration V1: Create all tables for expenses tracker with event sourcing architecture
-- Uses portable SQL syntax (no PostgreSQL-specific types like UUID or JSONB)
-- Tables and columns use event sourcing terminology from the start

-- =====================================================
-- Table 1: expense_projections (Read Model / Materialized View)
-- =====================================================
-- Purpose: Query-optimized current state of expenses, rebuilt from events
CREATE TABLE expense_projections (
    id VARCHAR(36) PRIMARY KEY,
    description VARCHAR(500),
    amount BIGINT NOT NULL,
    category VARCHAR(100),
    date VARCHAR(50),
    updated_at BIGINT NOT NULL,
    deleted BOOLEAN NOT NULL DEFAULT false
);

-- Indexes for expense_projections
CREATE INDEX idx_expense_projections_updated_at ON expense_projections(updated_at);
CREATE INDEX idx_expense_projections_deleted ON expense_projections(deleted);
CREATE INDEX idx_expense_projections_category ON expense_projections(category);

-- =====================================================
-- Table 2: expense_events (Event Store / Source of Truth)
-- =====================================================
-- Purpose: Immutable append-only event log of all expense modifications
CREATE TABLE expense_events (
    event_id VARCHAR(36) PRIMARY KEY,
    timestamp BIGINT NOT NULL,
    event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('CREATED', 'UPDATED', 'DELETED')),
    expense_id VARCHAR(36) NOT NULL,
    payload TEXT NOT NULL,
    committed BOOLEAN NOT NULL DEFAULT false
);

-- Indexes for expense_events
CREATE INDEX idx_expense_events_committed ON expense_events(committed);
CREATE INDEX idx_expense_events_timestamp ON expense_events(timestamp);
CREATE INDEX idx_expense_events_expense_id ON expense_events(expense_id);

-- =====================================================
-- Table 3: processed_events (Idempotency Registry)
-- =====================================================
-- Purpose: Tracks which events have been processed to prevent duplicate application
CREATE TABLE processed_events (
    event_id VARCHAR(36) PRIMARY KEY
);

-- Index for fast lookup
CREATE INDEX idx_processed_events_event_id ON processed_events(event_id);
