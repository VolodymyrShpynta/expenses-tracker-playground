/**
 * Static catalog of icons + colors used by the category UI.
 *
 * The web frontend uses MUI material icons keyed by Pascal-case names
 * (`ShoppingCart`, `DirectionsBus`, …). Categories stored in the database
 * carry that same key so a shared icon vocabulary works across all clients.
 *
 * On mobile we render through `@expo/vector-icons/MaterialIcons`, which
 * uses kebab-case names (`shopping-cart`, `directions-bus`, …). This map
 * translates the stored MUI key to the equivalent MaterialIcons name.
 *
 * Keep `ICON_KEYS` aligned with `expenses-tracker-frontend/src/utils/categoryConfig.ts`
 * — both clients must accept the same set of stored keys.
 */
import type { ComponentProps } from 'react';
import { MaterialIcons } from '@expo/vector-icons';

export type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

/**
 * Stored MUI icon key → MaterialIcons name (kebab-case). Both clients
 * agree on the stored key vocabulary; only the rendered representation
 * differs.
 */
export const ICON_MAP: Readonly<Record<string, MaterialIconName>> = {
  ShoppingCart: 'shopping-cart',
  DirectionsBus: 'directions-bus',
  LocalHospital: 'local-hospital',
  CardGiftcard: 'card-giftcard',
  ChildFriendly: 'child-friendly',
  SelfImprovement: 'self-improvement',
  DirectionsCar: 'directions-car',
  Checkroom: 'checkroom',
  Phone: 'phone',
  Face: 'face',
  Home: 'home',
  FamilyRestroom: 'family-restroom',
  Pets: 'pets',
  Agriculture: 'agriculture',
  Laptop: 'laptop',
  VolunteerActivism: 'volunteer-activism',
  FitnessCenter: 'fitness-center',
  Restaurant: 'restaurant',
  Movie: 'movie',
  FlashOn: 'flash-on',
  School: 'school',
  Flight: 'flight',
  Category: 'category',
  Savings: 'savings',
  Coffee: 'coffee',
  LocalBar: 'local-bar',
  MusicNote: 'music-note',
  SportsEsports: 'sports-esports',
  Book: 'book',
  Build: 'build',
  LocalGroceryStore: 'local-grocery-store',
  WaterDrop: 'water-drop',
  ChildCare: 'child-care',
  Cake: 'cake',
  LocalParking: 'local-parking',
  AttachMoney: 'attach-money',
  AccountBalance: 'account-balance',
  LocalLaundryService: 'local-laundry-service',
  SmokingRooms: 'smoking-rooms',
  Brush: 'brush',
  CameraAlt: 'camera-alt',
  Wifi: 'wifi',
};

/** Stored icon keys, in catalogue order. Used to drive the icon picker grid. */
export const ICON_KEYS: ReadonlyArray<string> = Object.keys(ICON_MAP);

/** Predefined color palette for the category color picker. */
export const AVAILABLE_COLORS: ReadonlyArray<string> = [
  '#5b8def', '#f5a623', '#4caf50', '#e53935', '#7e57c2',
  '#8d6e63', '#1a237e', '#9e9e9e', '#cddc39', '#2196f3',
  '#00bcd4', '#795548', '#607d8b', '#c8e6c9', '#616161',
  '#fdd835', '#ff7043', '#ffc107', '#3f51b5', '#00acc1',
  '#ff5722', '#78909c', '#e91e63', '#009688', '#ff9800',
  '#673ab7', '#03a9f4', '#8bc34a', '#f44336', '#ffeb3b',
];

/** Resolve a stored MUI icon key to a MaterialIcons name with a neutral fallback. */
export function getMaterialIconName(key: string | undefined): MaterialIconName {
  if (!key) return 'category';
  return ICON_MAP[key] ?? 'category';
}
