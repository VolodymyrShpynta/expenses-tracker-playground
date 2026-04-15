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
import SavingsIcon from '@mui/icons-material/Savings';
import CoffeeIcon from '@mui/icons-material/Coffee';
import LocalBarIcon from '@mui/icons-material/LocalBar';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import BookIcon from '@mui/icons-material/Book';
import BuildIcon from '@mui/icons-material/Build';
import LocalGroceryStoreIcon from '@mui/icons-material/LocalGroceryStore';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import ChildCareIcon from '@mui/icons-material/ChildCare';
import CakeIcon from '@mui/icons-material/Cake';
import LocalParkingIcon from '@mui/icons-material/LocalParking';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import LocalLaundryServiceIcon from '@mui/icons-material/LocalLaundryService';
import SmokingRoomsIcon from '@mui/icons-material/SmokingRooms';
import BrushIcon from '@mui/icons-material/Brush';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import WifiIcon from '@mui/icons-material/Wifi';
import type { SvgIconComponent } from '@mui/icons-material';
import type { Category } from '../types/category.ts';

export interface CategoryConfig {
  icon: SvgIconComponent;
  color: string; // primary color for the icon circle
}

/** Available icon definitions for category configuration */
export interface IconOption {
  key: string;
  icon: SvgIconComponent;
  label: string;
}

/**
 * Map from icon key (stored in DB) to MUI icon component.
 */
export const ICON_MAP: Record<string, SvgIconComponent> = {
  ShoppingCart: ShoppingCartIcon,
  DirectionsBus: DirectionsBusIcon,
  LocalHospital: LocalHospitalIcon,
  CardGiftcard: CardGiftcardIcon,
  ChildFriendly: ChildFriendlyIcon,
  SelfImprovement: SelfImprovementIcon,
  DirectionsCar: DirectionsCarIcon,
  Checkroom: CheckroomIcon,
  Phone: PhoneIcon,
  Face: FaceIcon,
  Home: HomeIcon,
  FamilyRestroom: FamilyRestroomIcon,
  Pets: PetsIcon,
  Agriculture: AgricultureIcon,
  Laptop: LaptopIcon,
  VolunteerActivism: VolunteerActivismIcon,
  FitnessCenter: FitnessCenterIcon,
  Restaurant: RestaurantIcon,
  Movie: MovieIcon,
  FlashOn: FlashOnIcon,
  School: SchoolIcon,
  Flight: FlightIcon,
  Category: CategoryIcon,
  Savings: SavingsIcon,
  Coffee: CoffeeIcon,
  LocalBar: LocalBarIcon,
  MusicNote: MusicNoteIcon,
  SportsEsports: SportsEsportsIcon,
  Book: BookIcon,
  Build: BuildIcon,
  LocalGroceryStore: LocalGroceryStoreIcon,
  WaterDrop: WaterDropIcon,
  ChildCare: ChildCareIcon,
  Cake: CakeIcon,
  LocalParking: LocalParkingIcon,
  AttachMoney: AttachMoneyIcon,
  AccountBalance: AccountBalanceIcon,
  LocalLaundryService: LocalLaundryServiceIcon,
  SmokingRooms: SmokingRoomsIcon,
  Brush: BrushIcon,
  CameraAlt: CameraAltIcon,
  Wifi: WifiIcon,
};

/**
 * Predefined icon options for the category icon picker.
 */
export const AVAILABLE_ICONS: IconOption[] = Object.entries(ICON_MAP).map(([key, icon]) => ({
  key,
  icon,
  label: key.replace(/([A-Z])/g, ' $1').trim(),
}));

/**
 * Predefined color palette for the category color picker.
 */
export const AVAILABLE_COLORS: string[] = [
  '#5b8def', '#f5a623', '#4caf50', '#e53935', '#7e57c2',
  '#8d6e63', '#1a237e', '#9e9e9e', '#cddc39', '#2196f3',
  '#00bcd4', '#795548', '#607d8b', '#c8e6c9', '#616161',
  '#fdd835', '#ff7043', '#ffc107', '#3f51b5', '#00acc1',
  '#ff5722', '#78909c', '#e91e63', '#009688', '#ff9800',
  '#673ab7', '#03a9f4', '#8bc34a', '#f44336', '#ffeb3b',
];

const DEFAULT_CONFIG: CategoryConfig = {
  icon: CategoryIcon,
  color: '#78909c',
};

/**
 * Runtime cache of backend categories, keyed by lowercase name.
 * Set via setBackendCategories() when categories are fetched.
 */
let backendCategoryMap: Record<string, CategoryConfig> = {};
let backendCategoryNames: string[] = [];

/**
 * Update the runtime category config from backend categories.
 * Call this when categories are fetched from the API.
 */
export function setBackendCategories(categories: Category[]): void {
  const map: Record<string, CategoryConfig> = {};
  const names: string[] = [];
  for (const cat of categories) {
    const icon = ICON_MAP[cat.icon] ?? CategoryIcon;
    map[cat.name.toLowerCase()] = { icon, color: cat.color };
    names.push(cat.name);
  }
  backendCategoryMap = map;
  backendCategoryNames = names;
}

/**
 * Returns the list of category names from the backend.
 */
export function getAllCategoryNames(): string[] {
  return backendCategoryNames;
}

/**
 * Resolve icon key string to MUI icon component.
 */
export function getIconByKey(key: string): SvgIconComponent {
  return ICON_MAP[key] ?? CategoryIcon;
}

export function getCategoryConfig(category: string): CategoryConfig {
  return backendCategoryMap[category.toLowerCase()] ?? DEFAULT_CONFIG;
}

/**
 * Returns the accent color for a category (used in donut chart slices).
 */
export function getCategoryColor(category: string): string {
  return getCategoryConfig(category).color;
}
