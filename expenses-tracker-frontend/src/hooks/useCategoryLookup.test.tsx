import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import CategoryIcon from '@mui/icons-material/Category';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import type { Category } from '../types/category';

const useCategoryCatalogMock = vi.fn();
vi.mock('./useCategories', () => ({
  useCategoryCatalog: () => useCategoryCatalogMock(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key === 'categoryTemplates.food' ? 'Food (translated)' : key,
    i18n: { language: 'en' },
  }),
}));

const { useCategoryLookup } = await import('./useCategoryLookup');

function category(partial: Partial<Category> & { id: string }): Category {
  return {
    name: null,
    icon: 'Category',
    color: '#000000',
    sortOrder: 0,
    updatedAt: 0,
    templateKey: null,
    deleted: false,
    activeExpenseCount: 0,
    ...partial,
  };
}

describe('useCategoryLookup', () => {
  it('resolves a custom category from its id (name from row)', () => {
    useCategoryCatalogMock.mockReturnValue({
      categories: [
        category({ id: 'cat-1', name: 'Travel', icon: 'Restaurant', color: '#5b8def' }),
      ],
    });

    const { result } = renderHook(() => useCategoryLookup());

    expect(result.current.resolve('cat-1')).toEqual({
      name: 'Travel',
      color: '#5b8def',
      icon: RestaurantIcon,
    });
  });

  it('resolves templated rows via the i18n template namespace', () => {
    useCategoryCatalogMock.mockReturnValue({
      categories: [
        category({ id: 'cat-1', name: null, templateKey: 'food', icon: 'Restaurant', color: '#e53935' }),
      ],
    });

    const { result } = renderHook(() => useCategoryLookup());

    expect(result.current.resolve('cat-1').name).toBe('Food (translated)');
  });

  it('returns the orphan default for unknown ids', () => {
    useCategoryCatalogMock.mockReturnValue({ categories: [] });

    const { result } = renderHook(() => useCategoryLookup());

    expect(result.current.resolve('missing')).toEqual({
      name: '',
      color: '#78909c',
      icon: CategoryIcon,
    });
  });

  it('falls back to CategoryIcon for unknown icon keys', () => {
    useCategoryCatalogMock.mockReturnValue({
      categories: [
        category({ id: 'cat-1', name: 'X', icon: 'totally-not-a-real-icon', color: '#000000' }),
      ],
    });

    const { result } = renderHook(() => useCategoryLookup());

    expect(result.current.resolve('cat-1').icon).toBe(CategoryIcon);
  });

  it('uses empty string as the name for a row with no name and no templateKey', () => {
    useCategoryCatalogMock.mockReturnValue({
      categories: [category({ id: 'cat-1', name: null, templateKey: null })],
    });

    const { result } = renderHook(() => useCategoryLookup());

    expect(result.current.resolve('cat-1').name).toBe('');
  });
});
