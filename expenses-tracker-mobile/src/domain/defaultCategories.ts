/**
 * Default category templates — port of the backend's
 * `R__Seed_default_categories.sql` repeatable migration.
 *
 * The display name lives on the i18n side (`categoryTemplates.<templateKey>`)
 * so adding a language is a JSON-only change. Adding or removing a
 * template here MUST be matched by the same change in
 * `expenses-tracker-api/src/main/resources/db/migration/R__Seed_default_categories.sql`
 * AND in `expenses-tracker-frontend/src/i18n/locales/*.json` →
 * `categoryTemplates`.
 */

export interface DefaultCategoryTemplate {
  readonly templateKey: string;
  readonly icon: string;
  readonly color: string;
  readonly sortOrder: number;
}

/**
 * Fallback color used when an expense references a category id that no
 * longer exists in the catalog (e.g. a sync replay surfaced a deletion
 * that hasn't reached this device yet). The hex matches the web
 * frontend's `useCategoryLookup` orphan so a user switching between
 * clients sees the same neutral muted tone.
 */
export const ORPHAN_CATEGORY_COLOR = '#78909c';

export const DEFAULT_CATEGORY_TEMPLATES: ReadonlyArray<DefaultCategoryTemplate> = [
  { templateKey: 'beauty', icon: 'Face', color: '#00bcd4', sortOrder: 0 },
  { templateKey: 'car', icon: 'DirectionsCar', color: '#9e9e9e', sortOrder: 1 },
  { templateKey: 'charity', icon: 'VolunteerActivism', color: '#fdd835', sortOrder: 2 },
  { templateKey: 'children', icon: 'ChildFriendly', color: '#7e57c2', sortOrder: 3 },
  { templateKey: 'clothing', icon: 'Checkroom', color: '#cddc39', sortOrder: 4 },
  { templateKey: 'communication', icon: 'Phone', color: '#2196f3', sortOrder: 5 },
  { templateKey: 'education', icon: 'School', color: '#3f51b5', sortOrder: 6 },
  { templateKey: 'entertainment', icon: 'Movie', color: '#ff7043', sortOrder: 7 },
  { templateKey: 'farm', icon: 'Agriculture', color: '#c8e6c9', sortOrder: 8 },
  { templateKey: 'food', icon: 'ShoppingCart', color: '#5b8def', sortOrder: 9 },
  { templateKey: 'gifts', icon: 'CardGiftcard', color: '#e53935', sortOrder: 10 },
  { templateKey: 'health', icon: 'LocalHospital', color: '#4caf50', sortOrder: 11 },
  { templateKey: 'house', icon: 'Home', color: '#4caf50', sortOrder: 12 },
  { templateKey: 'hygiene', icon: 'SelfImprovement', color: '#8d6e63', sortOrder: 13 },
  { templateKey: 'parents', icon: 'FamilyRestroom', color: '#795548', sortOrder: 14 },
  { templateKey: 'pet', icon: 'Pets', color: '#607d8b', sortOrder: 15 },
  { templateKey: 'restaurant', icon: 'Restaurant', color: '#ff5722', sortOrder: 16 },
  { templateKey: 'sport', icon: 'FitnessCenter', color: '#1a237e', sortOrder: 17 },
  { templateKey: 'tech', icon: 'Laptop', color: '#616161', sortOrder: 18 },
  { templateKey: 'transportation', icon: 'DirectionsBus', color: '#f5a623', sortOrder: 19 },
  { templateKey: 'travel', icon: 'Flight', color: '#00acc1', sortOrder: 20 },
  { templateKey: 'utilities', icon: 'FlashOn', color: '#ffc107', sortOrder: 21 },
];
