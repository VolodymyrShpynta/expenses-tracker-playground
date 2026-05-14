/**
 * Data-exchange tests — covers the user-facing snapshot export / import
 * flow that lives behind the `useExportData` / `useImportData` hooks.
 *
 * Wire format is the cross-platform JSON snapshot (same shape as the
 * web frontend's export). These tests pin the user-visible promises:
 *   - Export reads the projection tables and emits a portable JSON.
 *   - A file exported from the web frontend imports cleanly.
 *   - Importing categories is idempotent (matched by templateKey / name).
 *   - Importing expenses always creates new rows (no de-dupe by design).
 *   - Unknown category labels referenced by an expense are auto-created.
 *   - Malformed / wrong-shape files surface as `fatal` without aborting.
 *   - Per-row failures accumulate in `errors` without aborting the batch.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  applyImportedBytes,
  buildExportFile,
  EXPORT_FILE_VERSION,
  type ExportFile,
} from './dataExchange';
import { InMemoryLocalStore } from '../test/inMemoryLocalStore';
import { fixedTime, sequenceIds, sequenceTime } from '../test/fixtures';
import { createCategoryService } from '../domain/categoryService';
import { createExpenseCommandService, type IdGenerator } from '../domain/commands';
import {
  DEFAULT_CATEGORY_TEMPLATES,
  defaultTemplateId,
} from '../domain/defaultCategories';
import type { TimeProvider } from '../utils/time';

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder('utf-8');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Monotonically-incrementing time provider — saves hand-counting ticks. */
function monotonicTime(start = 1_000_000): TimeProvider {
  let t = start;
  return { nowMs: () => t++ };
}

/** Generates `${prefix}-0`, `${prefix}-1`, ... on demand. */
function sequentialIds(prefix: string): IdGenerator {
  let n = 0;
  return { newUuid: () => `${prefix}-${n++}` };
}

interface TestEnv {
  store: InMemoryLocalStore;
  categories: ReturnType<typeof createCategoryService>;
  expenseCommands: ReturnType<typeof createExpenseCommandService>;
}

/** Build a fresh store wired to the real category + expense services. */
function buildEnv(prefix = 'env'): TestEnv {
  const store = new InMemoryLocalStore();
  const time = monotonicTime();
  const ids = sequentialIds(prefix);
  const categories = createCategoryService({ store, time, ids });
  const expenseCommands = createExpenseCommandService({ store, time, ids });
  return { store, categories, expenseCommands };
}

function decodeFile(bytes: Uint8Array): ExportFile {
  return JSON.parse(TEXT_DECODER.decode(bytes)) as ExportFile;
}

// ---------------------------------------------------------------------------
// buildExportFile
// ---------------------------------------------------------------------------

describe('buildExportFile', () => {
  it('produces an empty snapshot from an empty store', async () => {
    const store = new InMemoryLocalStore();

    const payload = await buildExportFile({ store, time: fixedTime(1_700_000_000_000) });

    expect(payload.categoryCount).toBe(0);
    expect(payload.expenseCount).toBe(0);
    const file = decodeFile(payload.bytes);
    expect(file.version).toBe(EXPORT_FILE_VERSION);
    expect(file.categories).toEqual([]);
    expect(file.expenses).toEqual([]);
    expect(file.exportedAt).toBe('2023-11-14T22:13:20.000Z');
  });

  it('exports categories sorted by sortOrder with the wire-format fields', async () => {
    const env = buildEnv('seed');
    await env.categories.seedDefaultsIfEmpty();

    const payload = await buildExportFile({ store: env.store, time: fixedTime(0) });
    const file = decodeFile(payload.bytes);

    expect(file.categories).toHaveLength(DEFAULT_CATEGORY_TEMPLATES.length);
    // Sort order is preserved on the wire.
    const sortOrders = file.categories.map((c) => c.sortOrder);
    expect(sortOrders).toEqual([...sortOrders].sort((a, b) => a - b));
    // Templated rows carry templateKey and a null `name`.
    expect(file.categories[0]).toMatchObject({
      name: null,
      templateKey: DEFAULT_CATEGORY_TEMPLATES[0]!.templateKey,
    });
  });

  it('excludes soft-deleted categories but still resolves their label on existing expenses', async () => {
    const env = buildEnv('rm');
    const food = await env.categories.createCategory({ name: 'Food', icon: 'i', color: '#000' });
    await env.expenseCommands.createExpense({
      description: 'Bread',
      amount: 250,
      currency: 'EUR',
      categoryId: food.id,
      date: '2026-01-01T00:00:00Z',
    });
    await env.categories.deleteCategory(food.id);

    const payload = await buildExportFile({ store: env.store, time: fixedTime(0) });
    const file = decodeFile(payload.bytes);

    expect(file.categories.find((c) => c.name === 'Food')).toBeUndefined();
    // Expense still resolves to "Food" via the soft-deleted row.
    expect(file.expenses).toHaveLength(1);
    expect(file.expenses[0]?.category).toBe('Food');
  });

  it('omits soft-deleted expenses from the snapshot', async () => {
    const env = buildEnv('exp');
    const cat = await env.categories.createCategory({ name: 'X', icon: 'i', color: '#000' });
    await env.expenseCommands.createExpense({
      description: 'Keep',
      amount: 100,
      currency: 'USD',
      categoryId: cat.id,
      date: '2026-01-01T00:00:00Z',
    });
    const drop = await env.expenseCommands.createExpense({
      description: 'Drop',
      amount: 200,
      currency: 'USD',
      categoryId: cat.id,
      date: '2026-01-01T00:00:00Z',
    });
    await env.expenseCommands.deleteExpense(drop.id);

    const payload = await buildExportFile({ store: env.store, time: fixedTime(0) });
    const file = decodeFile(payload.bytes);

    expect(file.expenses).toHaveLength(1);
    expect(file.expenses[0]?.description).toBe('Keep');
    expect(file.expenses[0]?.amountMinor).toBe(100);
  });

  it('falls back to the template slug, then "Uncategorized" for expense labels', async () => {
    const env = buildEnv('lbl');
    await env.categories.seedDefaultsIfEmpty();
    const foodId = defaultTemplateId('food');
    await env.expenseCommands.createExpense({
      description: 'Bread',
      amount: 100,
      currency: 'USD',
      categoryId: foodId,
      date: '2026-01-01T00:00:00Z',
    });
    // Expense with an unknown / removed category id.
    await env.expenseCommands.createExpense({
      description: 'Orphan',
      amount: 999,
      currency: 'USD',
      categoryId: 'no-such-cat',
      date: '2026-01-01T00:00:00Z',
    });

    const payload = await buildExportFile({ store: env.store, time: fixedTime(0) });
    const file = decodeFile(payload.bytes);

    const bread = file.expenses.find((e) => e.description === 'Bread');
    const orphan = file.expenses.find((e) => e.description === 'Orphan');
    expect(bread?.category).toBe('food'); // template slug, no user name yet
    expect(orphan?.category).toBe('Uncategorized');
  });

  it('produces pretty-printed JSON (matches the web export format)', async () => {
    const store = new InMemoryLocalStore();

    const payload = await buildExportFile({ store, time: fixedTime(0) });
    const text = TEXT_DECODER.decode(payload.bytes);

    expect(text).toContain('\n  "version": 1');
  });
});

// ---------------------------------------------------------------------------
// applyImportedBytes
// ---------------------------------------------------------------------------

describe('applyImportedBytes', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = buildEnv('imp');
  });

  function fileBytes(file: ExportFile): Uint8Array {
    return TEXT_ENCODER.encode(JSON.stringify(file));
  }

  function makeFile(overrides: Partial<ExportFile> = {}): ExportFile {
    return {
      version: EXPORT_FILE_VERSION,
      exportedAt: '2026-01-01T00:00:00Z',
      categories: [],
      expenses: [],
      ...overrides,
    };
  }

  it('imports a fresh snapshot — categories created, expenses created', async () => {
    const bytes = fileBytes(
      makeFile({
        categories: [
          { name: 'Groceries', icon: 'ShoppingCart', color: '#abc', sortOrder: 0, templateKey: null },
        ],
        expenses: [
          {
            date: '2026-02-01T10:00:00Z',
            description: 'Bread',
            amountMinor: 250,
            currency: 'EUR',
            category: 'Groceries',
          },
        ],
      }),
    );

    const summary = await applyImportedBytes(bytes, {
      categoryService: env.categories,
      expenseCommands: env.expenseCommands,
    });

    expect(summary.fatal).toBeUndefined();
    expect(summary.categoriesCreated).toBe(1);
    expect(summary.expensesCreated).toBe(1);
    expect(summary.skipped).toBe(0);
    expect(summary.errors).toEqual([]);
    const all = await env.categories.findAllCategories();
    expect(all.map((c) => c.name)).toContain('Groceries');
    const expenses = await env.store.findActiveProjections();
    expect(expenses).toHaveLength(1);
    expect(expenses[0]?.description).toBe('Bread');
    expect(expenses[0]?.amount).toBe(250);
    expect(expenses[0]?.currency).toBe('EUR');
  });

  it('matches templated categories by templateKey (no duplicate created)', async () => {
    // Mobile has seeded the default templates; the file refers to "food"
    // by templateKey + null name (the web frontend's emitted shape).
    await env.categories.seedDefaultsIfEmpty();
    const beforeCount = (await env.categories.findAllCategories()).length;

    const bytes = fileBytes(
      makeFile({
        categories: [
          { name: null, icon: 'ShoppingCart', color: '#5b8def', sortOrder: 9, templateKey: 'food' },
        ],
        expenses: [
          {
            date: '2026-02-01T00:00:00Z',
            description: 'Bread',
            amountMinor: 100,
            currency: 'USD',
            category: 'food',
          },
        ],
      }),
    );

    const summary = await applyImportedBytes(bytes, {
      categoryService: env.categories,
      expenseCommands: env.expenseCommands,
    });

    expect(summary.categoriesCreated).toBe(0); // matched by templateKey, not created
    expect(summary.expensesCreated).toBe(1);
    const after = await env.categories.findAllCategories();
    expect(after).toHaveLength(beforeCount);
    // Expense was assigned to the existing seed row.
    const expenses = await env.store.findActiveProjections();
    expect(expenses[0]?.categoryId).toBe(defaultTemplateId('food'));
  });

  it('matches custom categories by case-insensitive name (no duplicate created)', async () => {
    await env.categories.createCategory({ name: 'Groceries', icon: 'i', color: '#000' });

    const bytes = fileBytes(
      makeFile({
        categories: [
          { name: 'groceries', icon: 'X', color: '#fff', sortOrder: 0, templateKey: null },
        ],
      }),
    );

    const summary = await applyImportedBytes(bytes, {
      categoryService: env.categories,
      expenseCommands: env.expenseCommands,
    });

    expect(summary.categoriesCreated).toBe(0);
    expect(summary.skipped).toBe(0);
    const all = (await env.categories.findAllCategories()).filter((c) => !c.deleted);
    expect(all.filter((c) => c.name?.toLowerCase() === 'groceries')).toHaveLength(1);
  });

  it('auto-creates a fresh category when an expense references an unknown label', async () => {
    const bytes = fileBytes(
      makeFile({
        expenses: [
          {
            date: '2026-02-01T00:00:00Z',
            description: 'Mystery',
            amountMinor: 100,
            currency: 'USD',
            category: 'NewCat',
          },
        ],
      }),
    );

    const summary = await applyImportedBytes(bytes, {
      categoryService: env.categories,
      expenseCommands: env.expenseCommands,
    });

    expect(summary.fatal).toBeUndefined();
    expect(summary.categoriesCreated).toBe(1); // auto-created via resolver
    expect(summary.expensesCreated).toBe(1);
    const created = (await env.categories.findAllCategories()).find((c) => c.name === 'NewCat');
    expect(created).toBeDefined();
    const expenses = await env.store.findActiveProjections();
    expect(expenses[0]?.categoryId).toBe(created?.id);
  });

  it('re-importing the same snapshot duplicates expenses but not categories', async () => {
    const bytes = fileBytes(
      makeFile({
        categories: [
          { name: 'X', icon: 'i', color: '#000', sortOrder: 0, templateKey: null },
        ],
        expenses: [
          {
            date: '2026-02-01T00:00:00Z',
            description: 'A',
            amountMinor: 100,
            currency: 'USD',
            category: 'X',
          },
        ],
      }),
    );

    await applyImportedBytes(bytes, {
      categoryService: env.categories,
      expenseCommands: env.expenseCommands,
    });
    const second = await applyImportedBytes(bytes, {
      categoryService: env.categories,
      expenseCommands: env.expenseCommands,
    });

    // Category matched by name on the second pass.
    expect(second.categoriesCreated).toBe(0);
    expect(second.expensesCreated).toBe(1);
    const expenses = await env.store.findActiveProjections();
    expect(expenses).toHaveLength(2); // duplicates by design
  });

  it('skips templated categories whose template is unknown locally', async () => {
    // No seed; the file references an unknown template slug.
    const bytes = fileBytes(
      makeFile({
        categories: [
          { name: null, icon: 'i', color: '#000', sortOrder: 0, templateKey: 'unknown-template' },
        ],
      }),
    );

    const summary = await applyImportedBytes(bytes, {
      categoryService: env.categories,
      expenseCommands: env.expenseCommands,
    });

    expect(summary.fatal).toBeUndefined();
    expect(summary.categoriesCreated).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(summary.errors).toEqual([]);
  });

  it('round-trips: export from one device, import into another', async () => {
    // Source device — seeded + one custom category + two expenses.
    const source = buildEnv('src');
    await source.categories.seedDefaultsIfEmpty();
    const custom = await source.categories.createCategory({
      name: 'Квартира',
      icon: 'Home',
      color: '#abc',
    });
    await source.expenseCommands.createExpense({
      description: 'Хліб',
      amount: 5000,
      currency: 'UAH',
      categoryId: defaultTemplateId('food'),
      date: '2026-03-01T00:00:00Z',
    });
    await source.expenseCommands.createExpense({
      description: 'Електрика',
      amount: 120000,
      currency: 'UAH',
      categoryId: custom.id,
      date: '2026-03-02T00:00:00Z',
    });

    const exported = await buildExportFile({ store: source.store, time: fixedTime(0) });

    // Target device — also seeded (so templates align).
    await env.categories.seedDefaultsIfEmpty();
    const summary = await applyImportedBytes(exported.bytes, {
      categoryService: env.categories,
      expenseCommands: env.expenseCommands,
    });

    expect(summary.fatal).toBeUndefined();
    expect(summary.errors).toEqual([]);
    expect(summary.categoriesCreated).toBe(1); // only the custom one
    expect(summary.expensesCreated).toBe(2);
    const expenses = await env.store.findActiveProjections();
    expect(expenses.map((e) => e.description).sort()).toEqual(['Електрика', 'Хліб']);
    const foodExpense = expenses.find((e) => e.description === 'Хліб');
    expect(foodExpense?.categoryId).toBe(defaultTemplateId('food'));
  });

  it('imports a web-frontend snapshot byte-for-byte', async () => {
    // Subset of a real `expenses-tracker-export-*.json` from the web app.
    const webExport: ExportFile = {
      version: 1,
      exportedAt: '2026-05-14T22:51:48.428Z',
      categories: [
        { name: null, icon: 'ShoppingCart', color: '#5b8def', sortOrder: 9, templateKey: 'food' },
        { name: null, icon: 'DirectionsCar', color: '#616161', sortOrder: 1, templateKey: 'car' },
        { name: 'Квартира НА', icon: 'Home', color: '#c8e6c9', sortOrder: 23, templateKey: null },
      ],
      expenses: [
        {
          date: '2025-02-06T16:39:20.000Z',
          description: 'Кауфланд і пенні',
          amountMinor: 175000,
          currency: 'CZK',
          category: 'food',
        },
        {
          date: '2025-02-08T15:39:35.000Z',
          description: 'Газ і 40л бензину',
          amountMinor: 230200,
          currency: 'CZK',
          category: 'car',
        },
      ],
    };
    await env.categories.seedDefaultsIfEmpty();

    const summary = await applyImportedBytes(fileBytes(webExport), {
      categoryService: env.categories,
      expenseCommands: env.expenseCommands,
    });

    expect(summary.fatal).toBeUndefined();
    expect(summary.errors).toEqual([]);
    expect(summary.expensesCreated).toBe(2);
    // Templated rows from the web didn't duplicate; the custom row was created.
    expect(summary.categoriesCreated).toBe(1);
    const expenses = await env.store.findActiveProjections();
    expect(expenses.map((e) => e.description).sort()).toEqual([
      'Газ і 40л бензину',
      'Кауфланд і пенні',
    ]);
    // Templated expenses resolved to the seeded default rows.
    expect(expenses.find((e) => e.description === 'Кауфланд і пенні')?.categoryId).toBe(
      defaultTemplateId('food'),
    );
  });

  it('reports malformed JSON as a fatal error', async () => {
    const summary = await applyImportedBytes(TEXT_ENCODER.encode('not json'), {
      categoryService: env.categories,
      expenseCommands: env.expenseCommands,
    });

    expect(summary.fatal).toMatch(/Malformed JSON/);
    expect(summary.categoriesCreated).toBe(0);
    expect(summary.expensesCreated).toBe(0);
  });

  it('reports an unsupported version as a fatal error', async () => {
    const bytes = TEXT_ENCODER.encode(
      JSON.stringify({ version: 99, exportedAt: '', categories: [], expenses: [] }),
    );

    const summary = await applyImportedBytes(bytes, {
      categoryService: env.categories,
      expenseCommands: env.expenseCommands,
    });

    expect(summary.fatal).toMatch(/Unsupported export version/);
  });

  it('reports a missing categories / expenses array as a fatal error', async () => {
    const bytes = TEXT_ENCODER.encode(
      JSON.stringify({ version: 1, exportedAt: '', categories: [] }), // expenses missing
    );

    const summary = await applyImportedBytes(bytes, {
      categoryService: env.categories,
      expenseCommands: env.expenseCommands,
    });

    expect(summary.fatal).toMatch(/missing categories or expenses/);
  });

  it('does not abort the import when a single row fails', async () => {
    // Stub createExpense so the second call throws.
    let calls = 0;
    const original = env.expenseCommands.createExpense.bind(env.expenseCommands);
    env.expenseCommands.createExpense = async (cmd) => {
      calls++;
      if (calls === 2) throw new Error('boom');
      return original(cmd);
    };
    const bytes = fileBytes(
      makeFile({
        categories: [
          { name: 'X', icon: 'i', color: '#000', sortOrder: 0, templateKey: null },
        ],
        expenses: [
          {
            date: '2026-01-01T00:00:00Z',
            description: 'ok-1',
            amountMinor: 100,
            currency: 'USD',
            category: 'X',
          },
          {
            date: '2026-01-01T00:00:00Z',
            description: 'bad',
            amountMinor: 200,
            currency: 'USD',
            category: 'X',
          },
          {
            date: '2026-01-01T00:00:00Z',
            description: 'ok-2',
            amountMinor: 300,
            currency: 'USD',
            category: 'X',
          },
        ],
      }),
    );

    const summary = await applyImportedBytes(bytes, {
      categoryService: env.categories,
      expenseCommands: env.expenseCommands,
    });

    expect(summary.expensesCreated).toBe(2);
    expect(summary.skipped).toBe(1);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]).toMatchObject({ kind: 'expense', label: 'bad', message: 'boom' });
    const expenses = await env.store.findActiveProjections();
    expect(expenses.map((e) => e.description).sort()).toEqual(['ok-1', 'ok-2']);
  });

  // Pin the deterministic test fixtures stay reachable through their
  // imports even after refactors — the rest of the test files in this
  // repo rely on them and any rename should fail loudly here too.
  it('reuses the deterministic test fixtures', () => {
    expect(sequenceTime).toBeTypeOf('function');
    expect(sequenceIds).toBeTypeOf('function');
  });
});
