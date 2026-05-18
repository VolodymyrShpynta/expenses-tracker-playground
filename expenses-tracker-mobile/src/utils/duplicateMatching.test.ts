/**
 * Tests for `duplicateMatching.ts` — same-name custom category detection.
 *
 * The behaviour matters for the category-create flow: an exact-name
 * collision with an *active* custom needs to surface the existing row,
 * a collision with an *archived* custom needs to offer restoration, and
 * a collision with a *template* category (one with `templateKey`)
 * shouldn't trigger any warning because the user could legitimately
 * pick the same display name for their own custom version.
 */
import { describe, expect, it } from 'vitest';

import { findDuplicateCustoms, normalizeName } from './duplicateMatching';
import type { Category } from '../domain/types';

// Factory input — explicitly permits `undefined` on the optional fields
// (the test suite uses `name: undefined` to opt out of the factory
// default, which `exactOptionalPropertyTypes` would otherwise forbid).
type FakeCategoryInput = {
  readonly id: string;
  readonly name?: string | undefined;
  readonly templateKey?: string | undefined;
  readonly icon?: string;
  readonly color?: string;
  readonly sortOrder?: number;
  readonly updatedAt?: number;
  readonly deleted?: boolean;
};

function fakeCategory(over: FakeCategoryInput): Category {
  // Build the object conditionally so that "opt-out" fields (name /
  // templateKey set to `undefined`) are *omitted* rather than set to
  // `undefined` — `exactOptionalPropertyTypes` forbids the latter.
  const base = {
    id: over.id,
    icon: over.icon ?? 'cat',
    color: over.color ?? '#000000',
    sortOrder: over.sortOrder ?? 0,
    updatedAt: over.updatedAt ?? 0,
    deleted: over.deleted ?? false,
  };
  const name: string | undefined = 'name' in over ? over.name : undefined;
  const templateKey: string | undefined =
    'templateKey' in over ? over.templateKey : undefined;
  return {
    ...base,
    ...(name !== undefined ? { name } : {}),
    ...(templateKey !== undefined ? { templateKey } : {}),
  };
}

describe('normalizeName', () => {
  it('should trim leading and trailing whitespace', () => {
    expect(normalizeName('  Groceries  ')).toBe('groceries');
  });

  it('should lowercase using locale rules', () => {
    expect(normalizeName('GROCERIES')).toBe('groceries');
    expect(normalizeName('Groceries')).toBe('groceries');
  });

  it('should preserve accented characters but treat case as equal', () => {
    // Given: two stylings of the same word
    // When/Then
    expect(normalizeName('Café')).toBe(normalizeName('CAFÉ'));
  });

  it('should return the empty string for whitespace-only input', () => {
    expect(normalizeName('   ')).toBe('');
  });
});

describe('findDuplicateCustoms', () => {
  it('should return null when the input is empty / whitespace', () => {
    // Given
    const catalog: Category[] = [fakeCategory({ id: 'a', name: 'Groceries' })];

    // When/Then
    expect(findDuplicateCustoms(catalog, '')).toBeNull();
    expect(findDuplicateCustoms(catalog, '   ')).toBeNull();
  });

  it('should return null when no custom category matches', () => {
    // Given
    const catalog: Category[] = [
      fakeCategory({ id: 'a', name: 'Travel' }),
      fakeCategory({ id: 'b', name: 'Subscriptions' }),
    ];

    // When/Then
    expect(findDuplicateCustoms(catalog, 'Groceries')).toBeNull();
  });

  it('should ignore template categories even when the name matches', () => {
    // Given: a template category named "Groceries"
    const catalog: Category[] = [
      fakeCategory({ id: 'tmpl', name: 'Groceries', templateKey: 'groceries' }),
    ];

    // When/Then: templates are not customs, so no duplicate
    expect(findDuplicateCustoms(catalog, 'Groceries')).toBeNull();
  });

  it('should ignore categories with no `name` field', () => {
    // Given: a malformed catalog row
    const catalog: Category[] = [fakeCategory({ id: 'noname', name: undefined })];

    // When/Then: nothing to compare against
    expect(findDuplicateCustoms(catalog, '')).toBeNull();
    expect(findDuplicateCustoms(catalog, 'Anything')).toBeNull();
  });

  it('should report a single active match in the `active` slot and leave `archived` empty', () => {
    // Given: one active custom category with the matching name
    const catalog: Category[] = [
      fakeCategory({ id: 'a', name: 'Groceries' }),
      fakeCategory({ id: 'b', name: 'Travel' }),
    ];

    // When
    const result = findDuplicateCustoms(catalog, 'groceries');

    // Then
    expect(result).not.toBeNull();
    expect(result!.active?.id).toBe('a');
    expect(result!.archived).toHaveLength(0);
  });

  it('should match case- and whitespace-insensitively', () => {
    // Given
    const catalog: Category[] = [fakeCategory({ id: 'a', name: 'Groceries' })];

    // When/Then
    expect(findDuplicateCustoms(catalog, '  GROCERIES  ')?.active?.id).toBe('a');
    expect(findDuplicateCustoms(catalog, 'groceries')?.active?.id).toBe('a');
  });

  it('should place every soft-deleted match in `archived` and leave `active` null', () => {
    // Given: two archived rows for the same name
    const catalog: Category[] = [
      fakeCategory({ id: 'old1', name: 'Groceries', deleted: true, updatedAt: 100 }),
      fakeCategory({ id: 'old2', name: 'Groceries', deleted: true, updatedAt: 200 }),
    ];

    // When
    const result = findDuplicateCustoms(catalog, 'Groceries');

    // Then: active null, archived contains both
    expect(result!.active).toBeNull();
    expect(result!.archived.map((c) => c.id)).toEqual(['old2', 'old1']);
  });

  it('should sort archived matches by updatedAt descending (newest first)', () => {
    // Given: three archived rows in non-monotonic insertion order
    const catalog: Category[] = [
      fakeCategory({ id: 'mid', name: 'Groceries', deleted: true, updatedAt: 200 }),
      fakeCategory({ id: 'old', name: 'Groceries', deleted: true, updatedAt: 100 }),
      fakeCategory({ id: 'new', name: 'Groceries', deleted: true, updatedAt: 300 }),
    ];

    // When
    const result = findDuplicateCustoms(catalog, 'Groceries');

    // Then
    expect(result!.archived.map((c) => c.id)).toEqual(['new', 'mid', 'old']);
  });

  it('should keep an active row separate from archived ones with the same name', () => {
    // Given: one active + one archived custom with the same name
    const catalog: Category[] = [
      fakeCategory({ id: 'a', name: 'Groceries' }),
      fakeCategory({ id: 'old', name: 'Groceries', deleted: true, updatedAt: 100 }),
    ];

    // When
    const result = findDuplicateCustoms(catalog, 'Groceries');

    // Then: both surfaces are populated
    expect(result!.active?.id).toBe('a');
    expect(result!.archived.map((c) => c.id)).toEqual(['old']);
  });
});
