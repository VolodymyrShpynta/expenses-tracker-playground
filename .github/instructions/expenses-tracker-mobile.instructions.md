---
applyTo: "expenses-tracker-mobile/**"
---

# Mobile Module — Expo + React Native + TypeScript

These rules apply when working on files under `expenses-tracker-mobile/`.

The mobile app is **fully offline-first** — it has its own SQLite event store
and a local projection of expenses. It **never** talks to
`expenses-tracker-api`. Multi-device convergence happens via the same
`sync.json[.gz]` file format that `SyncFileManager` produces in the backend,
hosted in the user's own Google Drive `appDataFolder` or OneDrive `approot`.

---

## Mobile Stack

- **Runtime**: Expo SDK 53+ + React Native 0.79 + React 19 + TypeScript
  (strict mode, `verbatimModuleSyntax`, `exactOptionalPropertyTypes`)
- **UI library**: **React Native Paper** v5 (Material 3) — never MUI.
- **Routing**: **Expo Router** v4 (file-based routing under `app/`).
- **Local store**: `expo-sqlite` (event store + projection + idempotency).
- **Server-state cache**: `@tanstack/react-query` (over local DB, not HTTP).
- **Cloud auth**: `expo-auth-session` (Google + Microsoft OAuth via PKCE).
- **Secure storage**: `expo-secure-store` (Keychain / Keystore) for tokens.
- **Background sync**: `expo-background-fetch` + `expo-task-manager`.
- **Charts**: `victory-native`.
- **Compression**: `pako` (gzip JSON sync file).
- **Testing**: Vitest for pure-TS code (domain, sync). RN component tests
  (added later) will use `jest-expo`.
- **i18n**: `i18next` + `react-i18next` (locale JSON files mirrored from
  `expenses-tracker-frontend/src/i18n/locales/`).

---

## Architecture & Runtime Flows

### Layered structure (mirrors web frontend)

```
expenses-tracker-mobile/
├── app/                      # Expo Router file-based routes (screens)
│   ├── _layout.tsx           # Paper provider + theme + i18n bootstrap
│   ├── index.tsx             # Categories / overview entry screen
│   ├── transactions.tsx
│   ├── add.tsx               # Add / edit expense (bottom sheet pattern)
│   └── settings/
│       ├── index.tsx
│       ├── categories.tsx
│       └── sync.tsx          # Cloud-drive picker, sync status
├── src/
│   ├── domain/               # Pure TS — NO React, NO React Native imports
│   │   ├── types.ts          # ExpenseEvent, EventEntry, EventSyncFile, …
│   │   ├── projector.ts      # last-write-wins projection (port of backend)
│   │   ├── mapping.ts        # event ↔ projection (analogue of ExpenseMapper)
│   │   ├── commands.ts       # createExpense / updateExpense / deleteExpense
│   │   └── queries.ts        # findAllExpenses / findExpenseById
│   ├── db/                   # expo-sqlite implementation of LocalStore
│   │   ├── schema.ts
│   │   ├── migrations.ts
│   │   └── localStore.ts     # implements LocalStore interface
│   ├── sync/                 # Pure TS — NO React, NO React Native imports
│   │   ├── SyncEngine.ts
│   │   ├── CloudDriveAdapter.ts   # Interface (DIP)
│   │   ├── RemoteEventApplier.ts  # Idempotency + projection
│   │   ├── SyncFileCodec.ts       # gzip + JSON
│   │   └── adapters/
│   │       ├── GoogleDriveAdapter.ts
│   │       └── OneDriveAdapter.ts
│   ├── auth/                 # OAuth via expo-auth-session (RN allowed)
│   ├── hooks/                # TanStack Query hooks over LocalStore
│   ├── components/           # Shared RN Paper components
│   ├── theme.ts              # MD3 light/dark theme
│   ├── i18n/                 # i18next bootstrap + locale JSON
│   ├── utils/
│   │   └── time.ts           # TimeProvider (deterministic in tests)
│   └── types/                # Shared TS interfaces
└── src/test/                 # Test fixtures and helpers
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

This algorithm is a 1:1 port of `ExpenseEventSyncService.performFullSync`.
**The on-disk JSON shape MUST stay byte-identical to what the backend's
`SyncFileManager` writes today** — so a self-hosted backend instance and a
mobile device sharing the same Drive folder converge transparently.

### Critical invariant — RemoteEventApplier separation

`RemoteEventApplier` (idempotency check) and the SQLite write (projection
update) are kept in separate modules. This mirrors the backend's
`ExpenseSyncProjector` / `ExpenseSyncRecorder` split (documented in
`AGENTS.md`). The split has no Spring-self-invocation rationale on mobile,
but it preserves SRP and makes the projector unit-testable in isolation.
**Do not merge them.**

### Conflict resolution

- **Last-write-wins by timestamp** — uniformly for CREATED, UPDATED, DELETED.
- Soft deletes (`deleted=true`) can be superseded by a newer non-deleted
  update (resurrection).
- Equal timestamps are **rejected** (strict `>`, not `>=`).

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
- Locale JSON copied from `expenses-tracker-frontend/src/i18n/locales/`
  via a build-time copy step (Phase 4) — single source of truth for keys.
- **Deliberately NOT DRY**: domain types are duplicated from backend Kotlin
  in TypeScript. The **JSON wire format is the contract**, not the source
  code. Do not extract a shared TS package.

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
- Locale JSON files are **copied at build time** from
  `expenses-tracker-frontend/src/i18n/locales/` so keys stay in sync.
- Mobile-only keys live in a separate `expenses-tracker-mobile/src/i18n/locales/<lang>.mobile.json`
  bundle merged at runtime — do not modify the web frontend's locale JSON
  for mobile-only strings.

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
- **Cross-implementation fixture test**: load a `sync.json.gz` produced
  by the backend's `SyncFileManager` and assert the mobile projector
  yields a projection equal to what the backend would produce. This is
  the contract test that prevents drift.

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
