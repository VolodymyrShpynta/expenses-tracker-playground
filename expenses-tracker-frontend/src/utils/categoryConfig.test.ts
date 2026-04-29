import { describe, expect, it } from 'vitest';
import CategoryIcon from '@mui/icons-material/Category';
import {
  AVAILABLE_COLORS,
  AVAILABLE_ICONS,
  ICON_MAP,
  getIconByKey,
} from './categoryConfig.ts';

describe('ICON_MAP', () => {
  it('exposes a non-empty catalog of MUI icons keyed by stable string ids', () => {
    expect(Object.keys(ICON_MAP).length).toBeGreaterThan(20);
    expect(ICON_MAP.Category).toBe(CategoryIcon);
  });
});

describe('AVAILABLE_ICONS', () => {
  it('mirrors ICON_MAP and derives a human label from the key', () => {
    expect(AVAILABLE_ICONS).toHaveLength(Object.keys(ICON_MAP).length);
    const shoppingCart = AVAILABLE_ICONS.find((o) => o.key === 'ShoppingCart');
    expect(shoppingCart?.label).toBe('Shopping Cart');
  });
});

describe('AVAILABLE_COLORS', () => {
  it('contains only valid CSS hex colors', () => {
    expect(AVAILABLE_COLORS.length).toBeGreaterThan(0);
    for (const color of AVAILABLE_COLORS) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('has no duplicate colors', () => {
    expect(new Set(AVAILABLE_COLORS).size).toBe(AVAILABLE_COLORS.length);
  });
});

describe('getIconByKey', () => {
  it('returns the mapped icon for a known key', () => {
    expect(getIconByKey('ShoppingCart')).toBe(ICON_MAP.ShoppingCart);
  });

  it('falls back to the neutral CategoryIcon for an unknown key', () => {
    expect(getIconByKey('totally-not-a-real-icon')).toBe(CategoryIcon);
  });
});
