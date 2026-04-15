-- Migration V4: Seed default categories
-- These match the previously hardcoded frontend category list.
-- Users can add, edit, or remove categories after seeding.

INSERT INTO categories (id, name, icon, color, sort_order, updated_at, deleted) VALUES
('a0000000-0000-4000-8000-000000000001', 'Beauty',         'Face',              '#00bcd4', 0,  1713200000000, false),
('a0000000-0000-4000-8000-000000000002', 'Car',            'DirectionsCar',     '#9e9e9e', 1,  1713200000000, false),
('a0000000-0000-4000-8000-000000000003', 'Charity',        'VolunteerActivism', '#fdd835', 2,  1713200000000, false),
('a0000000-0000-4000-8000-000000000004', 'Children',       'ChildFriendly',     '#7e57c2', 3,  1713200000000, false),
('a0000000-0000-4000-8000-000000000005', 'Clothing',       'Checkroom',         '#cddc39', 4,  1713200000000, false),
('a0000000-0000-4000-8000-000000000006', 'Communication',  'Phone',             '#2196f3', 5,  1713200000000, false),
('a0000000-0000-4000-8000-000000000007', 'Education',      'School',            '#3f51b5', 6,  1713200000000, false),
('a0000000-0000-4000-8000-000000000008', 'Entertainment',  'Movie',             '#ff7043', 7,  1713200000000, false),
('a0000000-0000-4000-8000-000000000009', 'Farm',           'Agriculture',       '#c8e6c9', 8,  1713200000000, false),
('a0000000-0000-4000-8000-00000000000a', 'Food',           'ShoppingCart',      '#5b8def', 9,  1713200000000, false),
('a0000000-0000-4000-8000-00000000000b', 'Gifts',          'CardGiftcard',      '#e53935', 10, 1713200000000, false),
('a0000000-0000-4000-8000-00000000000c', 'Health',         'LocalHospital',     '#4caf50', 11, 1713200000000, false),
('a0000000-0000-4000-8000-00000000000d', 'House',          'Home',              '#4caf50', 12, 1713200000000, false),
('a0000000-0000-4000-8000-00000000000e', 'Hygiene',        'SelfImprovement',   '#8d6e63', 13, 1713200000000, false),
('a0000000-0000-4000-8000-00000000000f', 'Parents',        'FamilyRestroom',    '#795548', 14, 1713200000000, false),
('a0000000-0000-4000-8000-000000000010', 'Pet',            'Pets',              '#607d8b', 15, 1713200000000, false),
('a0000000-0000-4000-8000-000000000011', 'Restaurant',     'Restaurant',        '#ff5722', 16, 1713200000000, false),
('a0000000-0000-4000-8000-000000000012', 'Sport',          'FitnessCenter',     '#1a237e', 17, 1713200000000, false),
('a0000000-0000-4000-8000-000000000013', 'Tech',           'Laptop',            '#616161', 18, 1713200000000, false),
('a0000000-0000-4000-8000-000000000014', 'Transportation', 'DirectionsBus',     '#f5a623', 19, 1713200000000, false),
('a0000000-0000-4000-8000-000000000015', 'Travel',         'Flight',            '#00acc1', 20, 1713200000000, false),
('a0000000-0000-4000-8000-000000000016', 'Utilities',      'FlashOn',           '#ffc107', 21, 1713200000000, false);
