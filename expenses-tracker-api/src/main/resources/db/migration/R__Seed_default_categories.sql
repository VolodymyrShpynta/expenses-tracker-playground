-- =============================================================================
-- Repeatable migration: default_categories reference data.
-- =============================================================================
-- Flyway re-applies this script automatically whenever its checksum changes
-- (after every successful versioned migration on boot). One row per logical
-- category — display names live on the frontend in the i18n
-- `categoryTemplates.<template_key>` namespace, so adding a new language is
-- a frontend-only change. Adding or removing a template requires editing
-- this file *and* the locale JSONs in lockstep.
--
-- Safety: `categories.template_key` stores the slug as a *value*, not a
-- foreign key reference, so wiping `default_categories` between user
-- requests does not affect existing user categories or break the
-- "reset to defaults" upsert.
--
-- The whole script is one Flyway transaction — partial application cannot
-- happen, even if a single INSERT fails.
-- =============================================================================

DELETE FROM default_categories;

INSERT INTO default_categories (template_key, icon, color, sort_order) VALUES
    ('beauty',         'Face',              '#00bcd4',  0),
    ('car',            'DirectionsCar',     '#9e9e9e',  1),
    ('charity',        'VolunteerActivism', '#fdd835',  2),
    ('children',       'ChildFriendly',     '#7e57c2',  3),
    ('clothing',       'Checkroom',         '#cddc39',  4),
    ('communication',  'Phone',             '#2196f3',  5),
    ('education',      'School',            '#3f51b5',  6),
    ('entertainment',  'Movie',             '#ff7043',  7),
    ('farm',           'Agriculture',       '#c8e6c9',  8),
    ('food',           'ShoppingCart',      '#5b8def',  9),
    ('gifts',          'CardGiftcard',      '#e53935', 10),
    ('health',         'LocalHospital',     '#4caf50', 11),
    ('house',          'Home',              '#4caf50', 12),
    ('hygiene',        'SelfImprovement',   '#8d6e63', 13),
    ('parents',        'FamilyRestroom',    '#795548', 14),
    ('pet',            'Pets',              '#607d8b', 15),
    ('restaurant',     'Restaurant',        '#ff5722', 16),
    ('sport',          'FitnessCenter',     '#1a237e', 17),
    ('tech',           'Laptop',            '#616161', 18),
    ('transportation', 'DirectionsBus',     '#f5a623', 19),
    ('travel',         'Flight',            '#00acc1', 20),
    ('utilities',      'FlashOn',           '#ffc107', 21);
