-- Migration V1: Create all tables for expenses tracker with sync support
-- Uses portable SQL syntax (no PostgreSQL-specific types like UUID or JSONB)

-- Create expenses table (UUID stored as VARCHAR for portability)
CREATE TABLE expenses (
    id VARCHAR(36) PRIMARY KEY,
    description VARCHAR(500),
    amount BIGINT NOT NULL,
    category VARCHAR(100),
    date VARCHAR(50),
    updated_at BIGINT NOT NULL,
    deleted BOOLEAN NOT NULL DEFAULT false
);

-- Create indexes for expenses
CREATE INDEX idx_expenses_updated_at ON expenses(updated_at);
CREATE INDEX idx_expenses_deleted ON expenses(deleted);
CREATE INDEX idx_expenses_category ON expenses(category);

-- Operations log table
CREATE TABLE operations (
    op_id VARCHAR(36) PRIMARY KEY,
    ts BIGINT NOT NULL,
    device_id VARCHAR(255) NOT NULL,
    op_type VARCHAR(20) NOT NULL CHECK (op_type IN ('CREATE', 'UPDATE', 'DELETE')),
    entity_id VARCHAR(36) NOT NULL,
    payload TEXT NOT NULL,
    committed BOOLEAN NOT NULL DEFAULT false
);

-- Indexes for operations table
CREATE INDEX idx_operations_committed ON operations(committed);
CREATE INDEX idx_operations_device_id ON operations(device_id);
CREATE INDEX idx_operations_ts ON operations(ts);

-- Applied operations registry (prevents duplicate application)
CREATE TABLE applied_operations (
    op_id VARCHAR(36) PRIMARY KEY
);

-- Create index for fast lookup
CREATE INDEX idx_applied_operations_op_id ON applied_operations(op_id);
