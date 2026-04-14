-- Migration V2: Add currency column to expense_projections
-- Stores the ISO 4217 currency code for the expense amount

ALTER TABLE expense_projections ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'USD';
