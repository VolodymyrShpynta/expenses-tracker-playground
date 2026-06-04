import type { ReactNode } from 'react';
import PieChartIcon from '@mui/icons-material/PieChart';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import BarChartIcon from '@mui/icons-material/BarChart';
import PrivacyTipIcon from '@mui/icons-material/PrivacyTip';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import type { ParseKeys } from 'i18next';

// `labelKey` is typed via i18next module augmentation (see src/i18n/i18next.d.ts):
// `ParseKeys` exposes the union of every leaf key in en.json, so a typo in any
// of the literals below — or in code that calls `translate(item.labelKey)` —
// is a TypeScript compile error rather than a silent missing-translation
// fallback at runtime.
export interface NavItem {
  labelKey: ParseKeys;
  path: string;
  icon: ReactNode;
}

export const NAV_ITEMS: NavItem[] = [
  { labelKey: 'nav.categories', path: '/', icon: <PieChartIcon /> },
  { labelKey: 'nav.transactions', path: '/transactions', icon: <ReceiptLongIcon /> },
  { labelKey: 'nav.overview', path: '/overview', icon: <BarChartIcon /> },
];

/**
 * Account / privacy entries shown to every authenticated user. Kept
 * separate from `NAV_ITEMS` so the bottom navigation on mobile stays
 * compact (privacy lives in the side drawer only).
 */
export const ACCOUNT_NAV_ITEMS: NavItem[] = [
  { labelKey: 'nav.privacy', path: '/account/privacy', icon: <PrivacyTipIcon /> },
];

/**
 * Operator-only entries. Filtered by the `gdpr-admin` realm role at
 * the consumption site (see `SidebarContent`).
 */
export const ADMIN_NAV_ITEMS: NavItem[] = [
  { labelKey: 'nav.adminUsers', path: '/admin/users', icon: <AdminPanelSettingsIcon /> },
];

/**
 * Active-index resolver for the primary nav (sidebar + bottom nav).
 * Returns `-1` when the current route is not in `NAV_ITEMS` (e.g. the
 * user is on `/account/privacy` or `/admin/users`) so neither the
 * sidebar nor the bottom navigation highlights a primary item.
 */
export function navIndex(pathname: string): number {
  return NAV_ITEMS.findIndex((n) => n.path === pathname);
}
