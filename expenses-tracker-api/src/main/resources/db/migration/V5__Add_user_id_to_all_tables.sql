-- Migration V5: Add user_id column to all user-scoped tables for multi-user support
-- Existing data is dropped because user_id is NOT NULL and there is no default user to assign to

-- 1. Truncate all tables in dependency order
DELETE FROM processed_events;
DELETE FROM expense_events;
DELETE FROM expense_projections;
DELETE FROM categories;

-- 2. Add user_id column to expense_projections
ALTER TABLE expense_projections ADD COLUMN user_id VARCHAR(255) NOT NULL;
CREATE INDEX idx_expense_projections_user_id ON expense_projections(user_id);

-- 3. Add user_id column to expense_events
ALTER TABLE expense_events ADD COLUMN user_id VARCHAR(255) NOT NULL;
CREATE INDEX idx_expense_events_user_id ON expense_events(user_id);

-- 4. Add user_id column to categories
-- Drop the old unique index on name (was global), recreate as per-user
DROP INDEX IF EXISTS idx_categories_name;
ALTER TABLE categories ADD COLUMN user_id VARCHAR(255) NOT NULL;
CREATE UNIQUE INDEX idx_categories_name_user ON categories(user_id, name) WHERE deleted = false;
CREATE INDEX idx_categories_user_id ON categories(user_id);
