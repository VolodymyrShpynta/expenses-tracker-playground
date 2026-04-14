import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import CardGiftcardIcon from '@mui/icons-material/CardGiftcard';
import ChildFriendlyIcon from '@mui/icons-material/ChildFriendly';
import SelfImprovementIcon from '@mui/icons-material/SelfImprovement';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import CheckroomIcon from '@mui/icons-material/Checkroom';
import PhoneIcon from '@mui/icons-material/Phone';
import FaceIcon from '@mui/icons-material/Face';
import HomeIcon from '@mui/icons-material/Home';
import FamilyRestroomIcon from '@mui/icons-material/FamilyRestroom';
import PetsIcon from '@mui/icons-material/Pets';
import AgricultureIcon from '@mui/icons-material/Agriculture';
import LaptopIcon from '@mui/icons-material/Laptop';
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import MovieIcon from '@mui/icons-material/Movie';
import FlashOnIcon from '@mui/icons-material/FlashOn';
import SchoolIcon from '@mui/icons-material/School';
import FlightIcon from '@mui/icons-material/Flight';
import CategoryIcon from '@mui/icons-material/Category';
import type { SvgIconComponent } from '@mui/icons-material';

export interface CategoryConfig {
  icon: SvgIconComponent;
  color: string; // primary color for the icon circle
}

/**
 * Static mapping of known category names to icons and accent colors.
 * Keys are lowercase for case-insensitive lookup.
 */
const CATEGORY_MAP: Record<string, CategoryConfig> = {
  food: { icon: ShoppingCartIcon, color: '#5b8def' },
  groceries: { icon: ShoppingCartIcon, color: '#5b8def' },
  продукти: { icon: ShoppingCartIcon, color: '#5b8def' },
  transportation: { icon: DirectionsBusIcon, color: '#f5a623' },
  транспорт: { icon: DirectionsBusIcon, color: '#f5a623' },
  health: { icon: LocalHospitalIcon, color: '#4caf50' },
  здоровье: { icon: LocalHospitalIcon, color: '#4caf50' },
  "здоров'я": { icon: LocalHospitalIcon, color: '#4caf50' },
  gifts: { icon: CardGiftcardIcon, color: '#e53935' },
  подарки: { icon: CardGiftcardIcon, color: '#e53935' },
  подарунки: { icon: CardGiftcardIcon, color: '#e53935' },
  children: { icon: ChildFriendlyIcon, color: '#7e57c2' },
  kids: { icon: ChildFriendlyIcon, color: '#7e57c2' },
  дітки: { icon: ChildFriendlyIcon, color: '#7e57c2' },
  hygiene: { icon: SelfImprovementIcon, color: '#8d6e63' },
  гігієна: { icon: SelfImprovementIcon, color: '#8d6e63' },
  sport: { icon: FitnessCenterIcon, color: '#1a237e' },
  спорт: { icon: FitnessCenterIcon, color: '#1a237e' },
  car: { icon: DirectionsCarIcon, color: '#9e9e9e' },
  'vw tiguan': { icon: DirectionsCarIcon, color: '#9e9e9e' },
  clothing: { icon: CheckroomIcon, color: '#cddc39' },
  одяг: { icon: CheckroomIcon, color: '#cddc39' },
  communication: { icon: PhoneIcon, color: '#2196f3' },
  "зв'язок": { icon: PhoneIcon, color: '#2196f3' },
  beauty: { icon: FaceIcon, color: '#00bcd4' },
  'краса гало': { icon: FaceIcon, color: '#00bcd4' },
  house: { icon: HomeIcon, color: '#4caf50' },
  будинок: { icon: HomeIcon, color: '#4caf50' },
  parents: { icon: FamilyRestroomIcon, color: '#795548' },
  батьки: { icon: FamilyRestroomIcon, color: '#795548' },
  pet: { icon: PetsIcon, color: '#607d8b' },
  cat: { icon: PetsIcon, color: '#607d8b' },
  кіт: { icon: PetsIcon, color: '#607d8b' },
  farm: { icon: AgricultureIcon, color: '#c8e6c9' },
  ферма: { icon: AgricultureIcon, color: '#c8e6c9' },
  tech: { icon: LaptopIcon, color: '#616161' },
  техніка: { icon: LaptopIcon, color: '#616161' },
  charity: { icon: VolunteerActivismIcon, color: '#fdd835' },
  entertainment: { icon: MovieIcon, color: '#ff7043' },
  utilities: { icon: FlashOnIcon, color: '#ffc107' },
  education: { icon: SchoolIcon, color: '#3f51b5' },
  travel: { icon: FlightIcon, color: '#00acc1' },
  restaurant: { icon: RestaurantIcon, color: '#ff5722' },
};

const DEFAULT_CONFIG: CategoryConfig = {
  icon: CategoryIcon,
  color: '#78909c',
};

/**
 * Canonical display names for all known categories.
 * Order here defines the default display order for categories with zero spending.
 */
export const ALL_CATEGORY_NAMES: string[] = [
  'Food',
  'Transportation',
  'Health',
  'Gifts',
  'Children',
  'Hygiene',
  'Sport',
  'Car',
  'Clothing',
  'Communication',
  'Beauty',
  'House',
  'Parents',
  'Pet',
  'Farm',
  'Tech',
  'Charity',
  'Entertainment',
  'Utilities',
  'Education',
  'Travel',
  'Restaurant',
];

export function getCategoryConfig(category: string): CategoryConfig {
  return CATEGORY_MAP[category.toLowerCase()] ?? DEFAULT_CONFIG;
}

/**
 * Returns the accent color for a category (used in donut chart slices).
 */
export function getCategoryColor(category: string): string {
  return getCategoryConfig(category).color;
}
