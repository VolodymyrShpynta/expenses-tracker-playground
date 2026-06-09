---
applyTo: "expenses-tracker-mobile/**"
---

# Mobile Module — Expo + React Native + TypeScript

These rules apply when working on files under `expenses-tracker-mobile/`.

The mobile app is **fully offline-first** — it has its own SQLite event store
and a local projection of expenses. It **never** talks to
`expenses-tracker-api`. Multi-device convergence happens via a mobile-only
`sync.json[.gz]` wire format (defined in `src/sync/codec.ts`) hosted in the
user's own Google Drive `appDataFolder` or OneDrive `approot`. The backend has
no corresponding file-sync subsystem.

---

## Mobile Stack

- **Runtime**: Expo SDK 55 + React Native 0.83 + React 19.2 + TypeScript
  (strict mode, `verbatimModuleSyntax`, `exactOptionalPropertyTypes`)
- **UI library**: **React Native Paper** v5 (Material 3) — never MUI.
- **Routing**: **Expo Router** v4 (file-based routing under `app/`, tab group under `app/(tabs)/`).
- **Local store**: `expo-sqlite` (event store + projection + idempotency).
- **Server-state cache**: `@tanstack/react-query` (over local DB, not HTTP).
- **Cloud auth**: `expo-auth-session` (Google + Microsoft OAuth via PKCE).
- **Secure storage**: `expo-secure-store` (Keychain / Keystore) for tokens.
- **Background sync**: `expo-background-fetch` + `expo-task-manager`.
- **Charts**: hand-rolled SVG via `react-native-svg` (no chart library — keeps the bundle small
  and lets each chart be styled with the active MD3 theme; see `SparklineChart` /
  `ExpenseTimeSeriesChart` in `src/components/`).
- **Compression**: `pako` (gzip JSON sync file).
- **Testing**: Vitest for pure-TS code (`src/domain/`, `src/sync/`, `src/api/`,
  `src/utils/`). RN component / hook tests are out of scope for the current
  setup — adding them would require `jest-expo`.
- **i18n**: `i18next` + `react-i18next`. Locale JSON files are OWNED by
  the mobile module — translations are independent from the web frontend.
  To add a new language, copy `src/i18n/locales/en.json` to `<lang>.json`
  and translate. Intra-module key parity is enforced by
  `scripts/check-locale-parity.mjs` via `npm run typecheck`.

---

## Architecture & Runtime Flows

### Layered structure (mirrors web frontend)

```
expenses-tracker-mobile/
├── app/                      # Expo Router file-based routes (screens)
│   ├── _layout.tsx           # Paper provider + theme + i18n + sync bootstrap
│   ├── +native-intent.tsx    # Deep-link entry point (OAuth redirects)
│   ├── settings.tsx          # Settings screen (cloud sync, categories, prefs)
│   └── (tabs)/               # Tab group — bottom navigation
│       ├── _layout.tsx       # <Tabs> declaration
│       ├── index.tsx         # Categories screen (donut + per-category totals)
│       ├── overview.tsx      # Time-series charts (sparkline + per-category lines/bars)
│       └── transactions.tsx  # Flat / grouped transactions list
├── src/
│   ├── domain/               # Pure TS — NO React, NO React Native imports
│   │   ├── types.ts          # ExpenseEvent, EventEntry, EventSyncFile, …
│   │   ├── projector.ts      # last-write-wins projection (port of backend)
│   │   ├── mapping.ts        # event ↔ projection (analogue of ExpenseMapper)
│   │   ├── commands.ts       # createExpense / updateExpense / deleteExpense
│   │   ├── queries.ts        # findAllExpenses / findExpenseById
│   │   ├── timeSeries.ts     # group expenses into time-series buckets
│   │   ├── categorySummary.ts
│   │   ├── exchangeRates.ts  # monthKey + convertAmount (historical-rate FX)
│   │   └── expenseSuggestions.ts
│   ├── db/                   # expo-sqlite implementation of LocalStore
│   │   ├── schema.ts
│   │   ├── sqliteLocalStore.ts
│   │   └── exchangeRateStore.ts
│   ├── sync/                 # Pure TS — NO React, NO React Native imports
│   │   ├── syncEngine.ts
│   │   ├── cloudDriveAdapter.ts   # Interface (DIP)
│   │   ├── remoteEventApplier.ts  # Idempotency + projection
│   │   ├── codec.ts               # gzip + JSON
│   │   ├── googleDriveAdapter.ts
│   │   ├── oneDriveAdapter.ts
│   │   ├── autoSyncCoordinator.ts # Single-source-of-truth trigger funnel
│   │   └── autoSyncSignal.ts      # notifyLocalWrite() pub/sub
│   ├── api/                  # External HTTP clients (Frankfurter FX)
│   ├── hooks/                # TanStack Query hooks + screen-level model hooks
│   ├── context/              # PreferencesProvider, SyncProvider, useAutoSync
│   ├── components/           # Shared RN Paper components (charts, dialogs, list rows)
│   ├── theme/                # MD3 light/dark theme (folder, not single file)
│   ├── i18n/                 # i18next bootstrap + locale JSON (mobile-owned)
│   ├── utils/                # time, format, dateRange, calculator, chartTicks, …
│   ├── queryClient.ts        # Singleton TanStack QueryClient
│   └── test/                 # In-memory fakes (LocalStore, CloudDriveAdapter) + fixtures
```

### Layer responsibilities

- **`app/`** — Expo Router screens. Default-exported component per file.
  No business logic; only composition + `useQuery` / `useMutation` calls.
- **`src/components/`** — shared RN Paper components used across screens.
- **`src/hooks/`** — TanStack Query wrappers over `LocalStore`. Components
  must import only from here, never from `domain/` / `db/` / `sync/`
  directly.
- **`src/domain/`** — **pure TypeScript**. No React Native, no Expo, no
  expo-sqlite imports. This is the unit-tested core.
- **`src/db/`** — `expo-sqlite` implementation of the `LocalStore`
  interface defined in `src/domain/`. The interface lives in `domain/`,
  the implementation lives in `db/` (DIP).
- **`src/sync/`** — **pure TypeScript** for `SyncEngine` and
  `RemoteEventApplier`. Provider-specific HTTP code lives under
  `src/sync/adapters/` and is the only place that imports `expo-auth-session`
  / cloud REST clients.

### Write path (local commands)

```
UI → useCreateExpense (TanStack mutation)
   → ExpenseCommandService.createExpense() in src/domain/commands.ts
       ├─ append event to expense_events (LocalStore.appendEvent)
       └─ project to expense_projections (LocalStore.project)
   → invalidate ['expenses'] query key
```

Both writes happen inside a **single SQLite transaction**, exactly mirroring
the backend's `@Transactional` boundary in `ExpenseCommandService`.

### Read path (queries)

```
UI → useExpenses (TanStack query)
   → ExpenseQueryService.findAllExpenses() in src/domain/queries.ts
   → LocalStore.findActiveExpenses() (WHERE deleted = false)
```

### Sync path (cloud-drive)

```
SyncEngine.performFullSync(adapter)
  1. adapter.getMetadata()   — checksum/etag-based skip
  2. adapter.download() → SyncFileCodec.decode → events[]
       └─ for each: RemoteEventApplier.apply (idempotency + project)
  3. LocalStore.findUncommittedEvents → SyncFileCodec.encode → adapter.upload()
  4. cache etag for next cycle
```

This algorithm runs entirely on-device. **The on-disk JSON shape is the
mobile-only sync wire format defined in `src/sync/codec.ts`** — the backend
has no equivalent file-sync subsystem, so the only consumers of this format
are other mobile instances of the same user sharing the same Drive / OneDrive
folder.

### Critical invariant — RemoteEventApplier separation

`RemoteEventApplier` (idempotency check) and the SQLite write (projection
update) are kept in separate modules to preserve SRP and keep the projector
unit-testable in isolation. **Do not merge them.**

### Conflict resolution

- **Last-write-wins by timestamp** — uniformly for CREATED, UPDATED, DELETED.
- Soft deletes (`deleted=true`) can be superseded by a newer non-deleted
  update (resurrection).
- Equal timestamps are **rejected** (strict `>`, not `>=`).

### Automatic sync triggers

`SyncEngine.performFullSync()` is invoked from a single coordinator
(`src/sync/autoSyncCoordinator.ts`) so the in-flight guard and throttle
apply uniformly across every trigger source. **All new sync triggers must
go through the coordinator — never call `engine.performFullSync()` directly.**

The coordinator funnels five trigger sources:

| Trigger          | Fires when                                                  | Coordinator API                      |
|------------------|-------------------------------------------------------------|--------------------------------------|
| Cold start       | `enabled` transitions `false → true` on mount or sign-in    | `requestSync('cold-start')`          |
| Foreground       | `AppState` transitions `inactive\|background → active`      | `requestSync('app-active')`          |
| After local write| Mutation hooks call `notifyLocalWrite()` on success         | `notifyLocalWrite()` (debounced)     |
| App backgrounded | `AppState` transitions `active → inactive\|background`      | `flush('background-flush')`          |
| Net reconnect    | `@react-native-community/netinfo` reports offline → online  | `requestSync('net-reconnect')`       |
| Manual button    | "Sync now" in `SyncCloudDialog`                             | `requestSync('manual', { force })`   |

`enabled` here means `isSignedIn && autoSyncEnabled` (the user-facing
toggle in `SyncCloudDialog`, persisted under
`expenses-tracker-sync-auto-enabled`, default `true`). When the user
turns auto-sync **off**, every row above except the last is silenced and
any pending after-write debounce is cancelled. The manual button keeps
working because it calls `coordinator.requestSync` directly, not via
`useAutoSync`.

Configuration constants (in `autoSyncCoordinator.ts`):

- `QUIET_DEBOUNCE_MS = 15_000` — debounce window after each local write.
  Subsequent writes reset the timer so a burst of edits collapses to one
  upload.
- `CEILING_MS = 60_000` — hard cap on the debounce so a continuous edit
  stream still uploads at least once a minute.
- `MIN_AUTO_INTERVAL_MS = 30_000` — minimum gap between two consecutive
  auto-syncs. The manual button passes `{ force: true }` to bypass this.

Wiring is in `src/context/syncProvider.tsx` (owns the coordinator) and
`src/context/useAutoSync.ts` (binds `AppState` + NetInfo). Mutation hooks
notify writes via `src/sync/autoSyncSignal.ts` — a module-level pub/sub
so the hooks stay decoupled from the `SyncContext` shape.

NetInfo is **soft-imported**: if `@react-native-community/netinfo` is not
installed, the net-reconnect trigger silently no-ops and the other four
still work. Run `npx expo install @react-native-community/netinfo` to
enable it.

### Bandwidth — verify before downloading

The auto-sync triggers above fire frequently (cold start + foreground
return + net reconnect can all hit within seconds of app launch). To
keep the network footprint small, **`SyncEngine` never blindly downloads
the sync file** — it asks the adapter for a *conditional* read.

`CloudDriveAdapter.download(opts?)` returns a discriminated union:

```ts
type DownloadOutcome =
  | { kind: 'modified'; bytes: Uint8Array; etag: string }
  | { kind: 'not-modified'; etag: string }   // bandwidth saver: no body
  | { kind: 'absent' };                       // first sync, file missing
```

The engine flow:

1. Probe the local store for uncommitted events first.
2. **When nothing local is pending and a cached eTag exists**, call
   `download({ ifNoneMatch: cachedEtag })`. The adapter must short-circuit
   without transferring the file body:
   - **Google Drive** sends `If-None-Match` → server returns `304 Not Modified`.
   - **OneDrive** uses the metadata round-trip it already needs for the
     item id; if `meta.eTag === ifNoneMatch` we never hit `/content`.
3. **When local writes are pending**, the engine calls `download()`
   without `ifNoneMatch` (we need the bytes for the merge step anyway).

When you add a new adapter, the `If-None-Match` path is mandatory — drop
it and every idle auto-sync pulls the entire gzipped file from the
cloud. The in-memory test adapter exposes `notModifiedCount` so engine
tests assert the short-circuit fires.

The cached eTag lives in the engine closure for the app session **and is
persisted across cold starts**. `SyncProvider` keys the value per
provider (`expenses-tracker-sync-etag:<provider>` in `AsyncStorage`) so
switching between OneDrive and Google Drive does not invalidate the
other's cache. Wiring:

- `SyncEngineDeps` accepts an optional `initialEtag` (seed) and
  `onEtagChange(etag | undefined)` callback (fire-and-forget persist).
- `SyncProvider` holds the live values in a `useRef` map (not state — a
  state update on every sync would rebuild the engine and discard the
  freshly observed etag). The ref is hydrated from `AsyncStorage`
  **before** `setProviderState` runs, so the engine `useMemo` reads the
  seed synchronously on first build.
- On `signOut`, the provider deletes the etag entry (both from the ref
  and from `AsyncStorage`) before bumping `engineGen` — a subsequent
  sign-in (possibly to a different account on the same provider) must
  not reuse the previous account's validator.
- The engine reports `undefined` to `onEtagChange` whenever it
  invalidates the cache (concurrency conflict, remote file disappeared)
  so the persisted copy is dropped at the same moment.

The first sync after install (no seed) still does one unconditional
download — there is nothing to revalidate against. Every subsequent
cold start should short-circuit at 304.

---

## Engineering Principles

These extend (not replace) the cross-cutting rules in
`.github/copilot-instructions.md`.

### SOLID

- **SRP** — split the sync pipeline into small modules:
    - `SyncEngine` — orchestration only.
    - `SyncFileCodec` — gzip + JSON encode/decode.
    - `RemoteEventApplier` — idempotency check + projection.
    - `LocalEventCollector` — query uncommitted events.
    - `CloudDriveAdapter` (per provider) — auth + HTTP only.
- **OCP / LSP / ISP** — `CloudDriveAdapter` is the **only** sync interface.
  Adding a new provider = new implementation, no edits to `SyncEngine`.
  Keep the interface minimal (`download`, `upload`, `getMetadata`,
  `signIn`, `signOut`, `isSignedIn`).
- **DIP** — `SyncEngine` depends on the `CloudDriveAdapter` and `LocalStore`
  interfaces, never on Drive/Graph SDKs or `expo-sqlite` directly.
  Production wires `expo-sqlite`-backed `LocalStore`; tests inject
  in-memory fakes.

### KISS / YAGNI

- No CRDTs, no operational transforms — last-write-wins matches the
  backend.
- One sync interface (`CloudDriveAdapter`). No generic "remote storage"
  abstraction or plugin registry.
- Forms with ≤ 5 fields stay on `useState` — same threshold as the web
  module. Adopt `react-hook-form` + `zod` only when ≥ 6 fields or
  cross-field validation appears.

### DRY (and where to deliberately not DRY)

- One `domain/mapping.ts` for all event ↔ projection conversion. Components
  must not map by hand.
- **Deliberately NOT DRY**: domain types are duplicated from backend Kotlin
  in TypeScript. The **JSON wire format is the contract**, not the source
  code. Do not extract a shared TS package.
- **Deliberately NOT DRY**: locale JSON is duplicated between mobile and
  web. Each module owns its own translations because the UX, surface area,
  and mobile-only keys diverge. To add a new language in the mobile
  module, copy `src/i18n/locales/en.json` to `<lang>.json` and translate
  in place — do NOT copy from the web frontend.

### Functional DI ("constructor injection in spirit")

- Pass dependencies as arguments to factory functions:
  ```ts
  // ✅ Good
  export function createSyncEngine(deps: {
    localStore: LocalStore;
    adapter: CloudDriveAdapter;
    codec: SyncFileCodec;
    time: TimeProvider;
  }): SyncEngine { … }
  ```
- Never reach for module-level singletons inside business logic.
- Tests construct each module with in-memory fakes; only `app/_layout.tsx`
  composes the real wiring.

### Self-documenting names (vocabulary parity with backend)

- Use **`find`** (not `get` / `retrieve`).
- Use **`project`** (not `apply` / `save`) for event → projection.
- Use **`append`** (not `add` / `insert`) for event-store writes.
- Use **`translate`** (not `t`) at the destructure of `useTranslation()`.

### Comments

- Explain **why**, not what. Specifically document why
  `RemoteEventApplier` is a separate module.
- No JSDoc parameter comments that just restate the type.

---

## React Native Paper v5 (Material 3) — Modern API only

This is the analogue of the web module's "no MUI v6 deprecated props" rule.
Use only Paper v5 (Material 3) APIs. Do **not** generate Paper v4 patterns.

### Cheat-sheet

| Old (Paper v4)              | Modern (Paper v5 / MD3)                                                              |
|-----------------------------|--------------------------------------------------------------------------------------|
| `theme.colors.primary` only | `theme.colors.primary` + `onPrimary` + container/onContainer pairs                   |
| `<DefaultTheme>`            | `MD3LightTheme` / `MD3DarkTheme`                                                     |
| `<Provider>`                | `<PaperProvider>`                                                                    |
| `<Snackbar.Content>` etc.   | Use the v5 single-component API                                                      |
| `mode="contained"` only     | v5 `mode` accepts `text` / `outlined` / `contained` / `elevated` / `contained-tonal` |

### Theme integration with the Expo dark/light system

Read color scheme from `useColorScheme()` (RN) and select between
`MD3LightTheme` and `MD3DarkTheme`. Always wrap the app in
`<PaperProvider theme={…}>` at the root layout (`app/_layout.tsx`).

---

## Expo Router v4 — Modern API only

| Old / wrong                         | Modern (v4)                                  |
|-------------------------------------|----------------------------------------------|
| Manual `react-navigation` v5 wiring | File-based `app/` routes                     |
| `useNavigation()` for typed routes  | `useRouter()` + typed routes (`expo-router`) |
| Stack screens declared in JS object | `app/_layout.tsx` with `<Stack>`             |

Enable **typed routes** (`"experiments": { "typedRoutes": true }` in
`app.json`) so route hrefs are checked at compile time.

---

## Data Fetching — TanStack Query over LocalStore

The two-layer architecture from the web frontend carries over verbatim:

| Layer                       | Location                                                       | Role                                              |
|-----------------------------|----------------------------------------------------------------|---------------------------------------------------|
| **Domain commands/queries** | `src/domain/commands.ts`, `src/domain/queries.ts`              | Pure async functions over `LocalStore`. No React. |
| **Query/Mutation hooks**    | `src/hooks/useExpenses.ts`, `src/hooks/useExpenseMutations.ts` | Wrap with `useQuery` / `useMutation`.             |

Components only import from `src/hooks/` — never from `src/domain/` directly.

### Query-key conventions (verbatim from web)

```ts
export const EXPENSES_QUERY_KEY = ['expenses'] as const;
export const CATEGORIES_QUERY_KEY = ['categories'] as const;
```

Mutations always invalidate the relevant query keys `onSuccess`.

### QueryClient setup

```ts
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            // RN does not have window focus; refetch on app foreground via AppState
            refetchOnWindowFocus: false,
        },
    },
});
```

---

## Localization — `i18next` + `react-i18next`

Identical rules to the web module:

- Rename `t` → `translate` at destructure.
- Type any stored key with `ParseKeys` from `i18next`.
- Never concatenate user-facing strings — always `translate('some.key', { … })`
  with placeholders.
- Locale JSON files in `expenses-tracker-mobile/src/i18n/locales/` are
  **owned by the mobile module** and edited in place. They are NOT mirrored
  from the web frontend — each module maintains its own translations
  because the UX, surface area, and mobile-only keys diverge.
- To add a new language, copy `src/i18n/locales/en.json` to `<lang>.json`
  and translate. After that the file is independent — do not copy across
  modules to "resync" wording.
- Intra-module key parity (every locale matches `en.json`) is enforced by
  `scripts/check-locale-parity.mjs`, wired into `npm run typecheck`.

---

## TypeScript

- **Strict mode** + `exactOptionalPropertyTypes` + `noUncheckedSideEffectImports`.
- Never `// @ts-ignore` or `any`.
- `import type` for type-only imports (`verbatimModuleSyntax`).
- Use `interface` for object shapes, `type` for unions/intersections.

## React 19 Event Types

Same rule as web frontend — never use `FormEvent` / `FormEventHandler`.
On RN, prefer letting TypeScript infer event types from RN handler props
(`onPress`, `onChangeText`, `onSubmitEditing`).

---

## Logging

- Use a thin structured logger (`src/utils/logger.ts`) wrapping `console.*`,
  keyed by level. Never `console.log` directly outside the logger.
- Use named placeholders, never string concatenation:
  ```ts
  // ✅
  logger.info('Sync uploaded events', { count: events.length, userId });

  // ❌
  console.log(`Sync uploaded ${events.length} events for ${userId}`);
  ```
- **Never log PII**: no expense `description`, no `amount` (beyond
  aggregates like counts), no access tokens, no refresh tokens, no
  Drive/OneDrive file IDs that may include user paths.
- In production, route the logger through `@sentry/react-native`
  breadcrumbs (Phase 8).

---

## Time injection (`TimeProvider`)

`src/utils/time.ts` exports a `TimeProvider` interface and a `systemTime`
implementation. All projector / sync code receives a `TimeProvider`
parameter. Tests inject a fixed-time provider — same reason the backend
has a `TimeProvider` class.

```ts
export interface TimeProvider {
    nowMs(): number;
}

export const systemTime: TimeProvider = {nowMs: () => Date.now()};
```

---

## Security

- **OAuth**: PKCE flow only. Never embed a client secret. Use
  `expo-auth-session` for both Google and Microsoft.
- **Token storage**: `expo-secure-store` (Keychain / Keystore) — never
  `AsyncStorage`. Store both access and refresh tokens.
- **Cloud scopes**: app-private folders only — Google
  `https://www.googleapis.com/auth/drive.appdata` and Microsoft
  `Files.ReadWrite.AppFolder` + `offline_access`. **Never** request broad
  Drive / OneDrive scopes.
- **PII**: do not log expense data, file paths, or tokens. Sentry
  breadcrumbs that include data must scrub PII first.
- **TLS**: rely on system trust store. Do not pin certificates unless
  explicitly required (and document why).

---

## Testing parity (analogue of `test-conventions.instructions.md`)

- **Given / When / Then** structure with section comments.
- **Backtick descriptive test names** — `should resurrect a soft-deleted
  expense when newer non-deleted update arrives`.
- **Manual store cleanup** in `beforeEach` — wipe in dependency order:
  `processed_events` → `expense_events` → `expense_projections`.
- **In-memory `LocalStore` fake** for unit tests — never hit
  `expo-sqlite` from a Vitest run.
- **Round-trip fixture test**: encode a synthetic events array through
  `SyncFileCodec`, decode it back, and assert the mobile projector
  produces the expected projections. This guards the mobile sync wire
  format and the projection algorithm against drift.

---

## Build, run, test workflows

```bash
cd expenses-tracker-mobile

npm install            # first run only — Expo's tree is large
npm run typecheck      # `tsc -b`
npm run lint           # ESLint
npm test               # Vitest pure-TS unit tests
npm start              # Expo dev server (requires native simulator or device)

# EAS builds (Mac required for iOS local; OneDrive cloud builds work on Windows):
npx eas build --platform android --profile preview
npx eas build --platform ios --profile preview
```

Through Gradle (CI):

```bash
./gradlew :expenses-tracker-mobile:check        # lint + tests
./gradlew :expenses-tracker-mobile:build        # type-check
```
