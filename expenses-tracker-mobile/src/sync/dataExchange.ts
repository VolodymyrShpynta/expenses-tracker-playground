/**
 * Pure helpers for the user-facing export / import flow.
 *
 * Wire format is the **same JSON snapshot** the web frontend produces
 * (see `expenses-tracker-api/src/main/kotlin/.../controller/dto/DataExchangeDtos.kt`),
 * so a file exported from either platform imports cleanly into the other.
 * This is intentional: export/import is a portable cross-device data
 * transfer surface, NOT a backup of the event log. Cloud-drive sync
 * between mobile devices keeps using the event-log format via
 * `cloudDriveAdapter` — that's a separate channel.
 *
 * Import semantics mirror the backend's `DataImporter`:
 *   - Categories are matched by `templateKey` first, then by
 *     case-insensitive `name`. Unknown rows are inserted via the normal
 *     `CategoryService.createCategory` path so an event is produced.
 *   - Expenses always go through `ExpenseCommandService.createExpense`
 *     so re-importing the same file deliberately creates duplicates
 *     (the file is not a primary key; the user is responsible for not
 *     re-importing).
 *   - Unknown category labels referenced by an expense are auto-created
 *     as fresh custom categories so the expense is never lost.
 *
 * The React hook (`useDataExchange`) is a thin shell over these
 * helpers — file I/O and the OS share / picker dialogs live there;
 * domain orchestration lives here, fully unit-testable against an
 * `InMemoryLocalStore` and the real services.
 */
import type { LocalStore } from '../domain/localStore';
import type { Category } from '../domain/types';
import type { CategoryService } from '../domain/categoryService';
import type { ExpenseCommandService } from '../domain/commands';
import type { TimeProvider } from '../utils/time';

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder('utf-8');

/** Current export-file schema version. */
export const EXPORT_FILE_VERSION = 1;

// Fallback display values used when a referenced category has no usable
// label / icon / color. Mirrors `ExportDefaults` on the backend so files
// round-trip with identical fallbacks.
const DEFAULT_ICON = 'Category';
const DEFAULT_COLOR = '#78909c';
const UNCATEGORIZED_LABEL = 'Uncategorized';

/**
 * Top-level export envelope — byte-for-byte compatible with the
 * backend's `ExportFile` DTO. Field names and order are deliberately
 * kept in sync.
 */
export interface ExportFile {
  readonly version: number;
  readonly exportedAt: string;
  readonly categories: ReadonlyArray<ExportCategory>;
  readonly expenses: ReadonlyArray<ExportExpense>;
}

export interface ExportCategory {
  /** `null` for templated rows (display name lives in i18n on the client). */
  readonly name: string | null;
  readonly icon: string;
  readonly color: string;
  readonly sortOrder: number;
  /** Stable slug (`food`, `car`, …) for default-template rows; `null` for user-created. */
  readonly templateKey: string | null;
}

export interface ExportExpense {
  /** ISO 8601 timestamp string. */
  readonly date: string;
  readonly description: string;
  /** Cents (integer) — preserves precision across all ISO 4217 currencies. */
  readonly amountMinor: number;
  readonly currency: string;
  /** Human-readable category label resolved at export time. */
  readonly category: string;
}

export interface ExportPayload {
  /** UTF-8 encoded JSON, ready to write to a file. */
  readonly bytes: Uint8Array;
  /** Parsed snapshot, exposed for tests / future programmatic callers. */
  readonly file: ExportFile;
  readonly categoryCount: number;
  readonly expenseCount: number;
}

export interface ExportDeps {
  readonly store: LocalStore;
  readonly time: TimeProvider;
}

export interface RowError {
  readonly kind: 'category' | 'expense';
  readonly label: string;
  readonly message: string;
}

export interface ImportSummary {
  readonly categoriesCreated: number;
  readonly expensesCreated: number;
  readonly skipped: number;
  readonly errors: ReadonlyArray<RowError>;
  /** Set when the file as a whole could not be processed (malformed / wrong shape). */
  readonly fatal?: string;
}

export interface ImportDeps {
  readonly categoryService: CategoryService;
  readonly expenseCommands: ExpenseCommandService;
}

/**
 * Build a portable snapshot from the local projection tables.
 *
 * Soft-deleted categories are still consulted when resolving expense
 * labels (so a historic expense keeps its original category name even
 * after archiving) but are excluded from the exported `categories`
 * list — matches the web frontend's behavior and what the user sees on
 * screen.
 */
export async function buildExportFile(deps: ExportDeps): Promise<ExportPayload> {
  const { store, time } = deps;
  const [allCategories, activeExpenses] = await Promise.all([
    store.findAllCategories(),
    store.findActiveProjections(),
  ]);

  const labelByCategoryId = new Map<string, string>();
  for (const category of allCategories) {
    labelByCategoryId.set(category.id, exportLabel(category));
  }

  const categories: ExportCategory[] = allCategories
    .filter((c) => !c.deleted)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({
      name: c.name ?? null,
      icon: c.icon,
      color: c.color,
      sortOrder: c.sortOrder,
      templateKey: c.templateKey ?? null,
    }));

  const expenses: ExportExpense[] = activeExpenses.map((e) => ({
    date: e.date ?? '',
    description: e.description ?? '',
    amountMinor: e.amount,
    currency: e.currency,
    category:
      (e.categoryId !== undefined && labelByCategoryId.get(e.categoryId)) ||
      UNCATEGORIZED_LABEL,
  }));

  const file: ExportFile = {
    version: EXPORT_FILE_VERSION,
    exportedAt: new Date(time.nowMs()).toISOString(),
    categories,
    expenses,
  };

  // Pretty-printed (2-space) to match the web export — the user explicitly
  // chose this format for being human-readable and easy to inspect.
  const json = JSON.stringify(file, null, 2);
  return {
    bytes: TEXT_ENCODER.encode(json),
    file,
    categoryCount: categories.length,
    expenseCount: expenses.length,
  };
}

/**
 * Decode a snapshot file and apply it through the normal command path.
 *
 * Returns a structured summary instead of throwing for predictable per-row
 * failure handling: a malformed file populates `fatal`; per-row failures
 * accumulate in `errors`. The UI surfaces both channels separately.
 */
export async function applyImportedBytes(
  bytes: Uint8Array,
  deps: ImportDeps,
): Promise<ImportSummary> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(TEXT_DECODER.decode(bytes));
  } catch (e) {
    return fatal(`Malformed JSON: ${(e as Error).message}`);
  }

  const validation = validateExportFile(parsed);
  if (validation.kind === 'invalid') {
    return fatal(validation.message);
  }
  const file = validation.file;

  const resolver = await buildCategoryResolver(deps.categoryService);
  const catOutcome = await importCategories(file.categories, resolver, deps);
  const expOutcome = await importExpenses(file.expenses, resolver, deps);

  return {
    categoriesCreated: catOutcome.created + resolver.autoCreated,
    expensesCreated: expOutcome.created,
    skipped: catOutcome.skipped + expOutcome.skipped,
    errors: [...catOutcome.errors, ...expOutcome.errors],
  };
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

function fatal(message: string): ImportSummary {
  return {
    categoriesCreated: 0,
    expensesCreated: 0,
    skipped: 0,
    errors: [],
    fatal: message,
  };
}

function exportLabel(category: Category): string {
  const name = category.name?.trim();
  if (name) return name;
  if (category.templateKey) return category.templateKey;
  return UNCATEGORIZED_LABEL;
}

type Validation =
  | { readonly kind: 'ok'; readonly file: ExportFile }
  | { readonly kind: 'invalid'; readonly message: string };

function validateExportFile(value: unknown): Validation {
  if (typeof value !== 'object' || value === null) {
    return { kind: 'invalid', message: 'Export file must be a JSON object' };
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.version !== 'number' || obj.version !== EXPORT_FILE_VERSION) {
    return {
      kind: 'invalid',
      message: `Unsupported export version: ${String(obj.version)}`,
    };
  }
  if (!Array.isArray(obj.categories) || !Array.isArray(obj.expenses)) {
    return { kind: 'invalid', message: 'Export file is missing categories or expenses array' };
  }
  return {
    kind: 'ok',
    file: {
      version: EXPORT_FILE_VERSION,
      exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : '',
      categories: obj.categories as ReadonlyArray<ExportCategory>,
      expenses: obj.expenses as ReadonlyArray<ExportExpense>,
    },
  };
}

interface PhaseOutcome {
  created: number;
  skipped: number;
  errors: RowError[];
}

async function importCategories(
  categories: ReadonlyArray<ExportCategory>,
  resolver: CategoryResolver,
  deps: ImportDeps,
): Promise<PhaseOutcome> {
  const outcome: PhaseOutcome = { created: 0, skipped: 0, errors: [] };
  for (const category of categories) {
    if (resolver.resolveExisting(category) !== undefined) continue;

    const displayName = category.name?.trim() || null;
    if (displayName === null) {
      // Templated row whose template is unknown on this device — same
      // policy as the backend: skip silently so the seeder remains the
      // single source of truth for templated categories.
      outcome.skipped++;
      continue;
    }

    try {
      const created = await deps.categoryService.createCategory({
        name: displayName,
        icon: category.icon || DEFAULT_ICON,
        color: category.color || DEFAULT_COLOR,
        sortOrder: category.sortOrder,
      });
      resolver.register(created);
      outcome.created++;
    } catch (e) {
      outcome.errors.push({
        kind: 'category',
        label: displayName,
        message: (e as Error).message,
      });
      outcome.skipped++;
    }
  }
  return outcome;
}

async function importExpenses(
  expenses: ReadonlyArray<ExportExpense>,
  resolver: CategoryResolver,
  deps: ImportDeps,
): Promise<PhaseOutcome> {
  const outcome: PhaseOutcome = { created: 0, skipped: 0, errors: [] };
  for (const expense of expenses) {
    try {
      const categoryId = await resolver.resolveOrCreateByLabel(expense.category);
      await deps.expenseCommands.createExpense({
        description: expense.description,
        amount: expense.amountMinor,
        currency: expense.currency,
        categoryId,
        date: expense.date,
      });
      outcome.created++;
    } catch (e) {
      outcome.errors.push({
        kind: 'expense',
        label: expense.description || expense.category,
        message: (e as Error).message,
      });
      outcome.skipped++;
    }
  }
  return outcome;
}

/**
 * Index existing categories by `templateKey` and lower-cased `name` so
 * imported rows can be matched against them without re-querying. Also
 * auto-creates fresh custom rows when an expense references an unknown
 * label.
 */
async function buildCategoryResolver(
  categoryService: CategoryService,
): Promise<CategoryResolver> {
  const existing = await categoryService.findAllCategories();
  const resolver = new CategoryResolver(categoryService);
  for (const category of existing) {
    if (!category.deleted) resolver.register(category);
  }
  return resolver;
}

class CategoryResolver {
  private readonly byTemplateKey = new Map<string, string>();
  private readonly byNameLower = new Map<string, string>();
  private readonly categoryService: CategoryService;
  autoCreated = 0;

  constructor(categoryService: CategoryService) {
    this.categoryService = categoryService;
  }

  register(category: Category): void {
    if (category.templateKey) this.byTemplateKey.set(category.templateKey, category.id);
    if (category.name) this.byNameLower.set(category.name.toLowerCase(), category.id);
  }

  resolveExisting(category: ExportCategory): string | undefined {
    if (category.templateKey) {
      const match = this.byTemplateKey.get(category.templateKey);
      if (match) return match;
    }
    if (category.name) {
      const match = this.byNameLower.get(category.name.toLowerCase());
      if (match) return match;
    }
    return undefined;
  }

  async resolveOrCreateByLabel(label: string): Promise<string> {
    const trimmed = label.trim() || UNCATEGORIZED_LABEL;
    const byTemplate = this.byTemplateKey.get(trimmed);
    if (byTemplate) return byTemplate;
    const byName = this.byNameLower.get(trimmed.toLowerCase());
    if (byName) return byName;

    const created = await this.categoryService.createCategory({
      name: trimmed,
      icon: DEFAULT_ICON,
      color: DEFAULT_COLOR,
      sortOrder: 0,
    });
    this.register(created);
    this.autoCreated++;
    return created.id;
  }
}
