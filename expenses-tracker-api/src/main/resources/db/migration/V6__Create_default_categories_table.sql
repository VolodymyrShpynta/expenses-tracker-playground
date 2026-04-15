-- Migration V6: Create default_categories template table
-- Stores the set of categories that are seeded for new users on first access.
-- Admins can modify this table at runtime without redeployment.

CREATE TABLE default_categories (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    icon VARCHAR(50) NOT NULL,
    color VARCHAR(7) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0
);

-- Seed with the same defaults from V4
INSERT INTO default_categories (id, name, icon, color, sort_order) VALUES
('a0000000-0000-4000-8000-000000000001', 'Beauty',         'Face',              '#00bcd4', 0),
('a0000000-0000-4000-8000-000000000002', 'Car',            'DirectionsCar',     '#9e9e9e', 1),
('a0000000-0000-4000-8000-000000000003', 'Charity',        'VolunteerActivism', '#fdd835', 2),
('a0000000-0000-4000-8000-000000000004', 'Children',       'ChildFriendly',     '#7e57c2', 3),
('a0000000-0000-4000-8000-000000000005', 'Clothing',       'Checkroom',         '#cddc39', 4),
('a0000000-0000-4000-8000-000000000006', 'Communication',  'Phone',             '#2196f3', 5),
('a0000000-0000-4000-8000-000000000007', 'Education',      'School',            '#3f51b5', 6),
('a0000000-0000-4000-8000-000000000008', 'Entertainment',  'Movie',             '#ff7043', 7),
('a0000000-0000-4000-8000-000000000009', 'Farm',           'Agriculture',       '#c8e6c9', 8),
('a0000000-0000-4000-8000-00000000000a', 'Food',           'ShoppingCart',      '#5b8def', 9),
('a0000000-0000-4000-8000-00000000000b', 'Gifts',          'CardGiftcard',      '#e53935', 10),
('a0000000-0000-4000-8000-00000000000c', 'Health',         'LocalHospital',     '#4caf50', 11),
('a0000000-0000-4000-8000-00000000000d', 'House',          'Home',              '#4caf50', 12),
('a0000000-0000-4000-8000-00000000000e', 'Hygiene',        'SelfImprovement',   '#8d6e63', 13),
('a0000000-0000-4000-8000-00000000000f', 'Parents',        'FamilyRestroom',    '#795548', 14),
('a0000000-0000-4000-8000-000000000010', 'Pet',            'Pets',              '#607d8b', 15),
('a0000000-0000-4000-8000-000000000011', 'Restaurant',     'Restaurant',        '#ff5722', 16),
('a0000000-0000-4000-8000-000000000012', 'Sport',          'FitnessCenter',     '#1a237e', 17),
('a0000000-0000-4000-8000-000000000013', 'Tech',           'Laptop',            '#616161', 18),
('a0000000-0000-4000-8000-000000000014', 'Transportation', 'DirectionsBus',     '#f5a623', 19),
('a0000000-0000-4000-8000-000000000015', 'Travel',         'Flight',            '#00acc1', 20),
('a0000000-0000-4000-8000-000000000016', 'Utilities',      'FlashOn',           '#ffc107', 21);
