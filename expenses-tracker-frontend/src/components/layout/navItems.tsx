import type { ReactNode } from 'react';
import PieChartIcon from '@mui/icons-material/PieChart';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import BarChartIcon from '@mui/icons-material/BarChart';
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

export function navIndex(pathname: string): number {
  const idx = NAV_ITEMS.findIndex((n) => n.path === pathname);
  return idx >= 0 ? idx : 0;
}
