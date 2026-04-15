-- Migration V3: Create categories table for user-configurable expense categories
-- Stores category name, icon key (mapped to MUI icon on frontend), and color (hex)

CREATE TABLE categories (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(50) NOT NULL,
    color VARCHAR(7) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL,
    deleted BOOLEAN NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX idx_categories_name ON categories(name) WHERE deleted = false;
CREATE INDEX idx_categories_deleted ON categories(deleted);
CREATE INDEX idx_categories_sort_order ON categories(sort_order);
