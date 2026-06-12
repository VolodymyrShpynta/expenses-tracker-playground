# Expenses Tracker — Mobile App (Expo / React Native) <!-- omit in toc -->

A **fully offline-first** native iOS + Android app built with **Expo SDK 55 + React Native 0.83 +
React Native Paper v5**. It **never talks to [`expenses-tracker-api`](../expenses-tracker-api/README.md)**
— all state lives in a local SQLite database, and multi-device convergence happens through the user's
own Google Drive `appDataFolder` or OneDrive `approot`.

> **Where this module fits.** The mobile app is independent of the web frontend and backend. It uses
> the same **event-sourcing + CQRS** model that the backend uses for its REST API (last-write-wins by
> strict-greater-than timestamp, immutable event log, materialized projections), but it implements that
> model end-to-end in TypeScript on `expo-sqlite` so it can run fully offline. The **backend has no
> sync subsystem**: web clients converge through PostgreSQL directly, and backup / migration use the
> JSON / CSV import-export endpoints on the API. **This README is the canonical reference for the
> cross-device sync engine** — file format, snapshot model, throttling, idempotency, and OAuth wiring
> all live here, not in the root README.
>
> The mobile module is a Gradle subproject (`./gradlew :expenses-tracker-mobile:check` runs lint +
> Vitest + type-check) so it participates in the same monorepo build as the backend and web frontend.

---

## 📑 Table of Contents <!-- omit in toc -->

- [🎯 Overview](#-overview)
- [🛠 Tech Stack](#-tech-stack)
- [🔄 Sync Engine Architecture](#-sync-engine-architecture)
  - [Design Principles](#design-principles)
  - [Database Schema (on-device, `expo-sqlite`)](#database-schema-on-device-expo-sqlite)
  - [Conflict Resolution — Strict `>` Last-Write-Wins](#conflict-resolution--strict--last-write-wins)
  - [Sync Workflow (cloud-drive cycle)](#sync-workflow-cloud-drive-cycle)
  - [Sync File Format](#sync-file-format)
  - [Automatic Sync Triggers, Throttling, and Bandwidth](#automatic-sync-triggers-throttling-and-bandwidth)
  - [Apply-Time Optimizations \& Cold-Install Fast Path](#apply-time-optimizations--cold-install-fast-path)
  - [Design Alternatives Considered — Why Not Full LSM Compaction?](#design-alternatives-considered--why-not-full-lsm-compaction)
  - [Idempotency Guarantees](#idempotency-guarantees)
  - [Component Diagram (mobile-internal)](#component-diagram-mobile-internal)
  - [Mobile Module Layout](#mobile-module-layout)
- [🚀 Running the Mobile App](#-running-the-mobile-app)
  - [Quick start](#quick-start)
  - [Setting up a simulator / emulator](#setting-up-a-simulator--emulator)
    - [Option 1 — Physical device with Expo Go (easiest, any OS)](#option-1--physical-device-with-expo-go-easiest-any-os)
    - [Option 2 — Android emulator (Windows / macOS / Linux)](#option-2--android-emulator-windows--macos--linux)
      - [Recommended AVD configuration (stability)](#recommended-avd-configuration-stability)
        - [Host-level tips (Windows)](#host-level-tips-windows)
        - [If the AOSP emulator still misbehaves](#if-the-aosp-emulator-still-misbehaves)
    - [Option 3 — iOS Simulator (macOS only)](#option-3--ios-simulator-macos-only)
  - [Verifying the setup](#verifying-the-setup)
- [🔧 Building a Local Dev Client (`npx expo run:android`)](#-building-a-local-dev-client-npx-expo-runandroid)
- [📦 Building \& Sideloading a Production APK](#-building--sideloading-a-production-apk)
  - [Which EAS profile to use](#which-eas-profile-to-use)
  - [One-time setup](#one-time-setup)
  - [Option A — Cloud build via EAS (recommended, works from Windows with zero extra tooling)](#option-a--cloud-build-via-eas-recommended-works-from-windows-with-zero-extra-tooling)
  - [Option B — Local cloud-free build (`--local` flag)](#option-b--local-cloud-free-build---local-flag)
  - [Option C — Pure Gradle (skip EAS entirely)](#option-c--pure-gradle-skip-eas-entirely)
  - [Installing the APK on your phone](#installing-the-apk-on-your-phone)
  - [Practical notes](#practical-notes)
- [🔐 Cloud-Drive Sync — Getting OAuth Client IDs](#-cloud-drive-sync--getting-oauth-client-ids)
  - [Microsoft (OneDrive)](#microsoft-onedrive)
  - [Google (Google Drive)](#google-google-drive)
    - ["I synced but I don't see the file in Google Drive"](#i-synced-but-i-dont-see-the-file-in-google-drive)
  - [Will other users be able to use my app registration?](#will-other-users-be-able-to-use-my-app-registration)
    - [Who can sign in — the "Supported account types" setting](#who-can-sign-in--the-supported-account-types-setting)
    - ["Unverified publisher" warning](#unverified-publisher-warning)
  - [How the `spendium://redirect` URI actually works](#how-the-spendiumredirect-uri-actually-works)
    - [1. The app *claims* the scheme at install time](#1-the-app-claims-the-scheme-at-install-time)
    - [2. Microsoft *records* the redirect URI as a plain string](#2-microsoft-records-the-redirect-uri-as-a-plain-string)
    - [The handoff](#the-handoff)
    - [Why this is secure](#why-this-is-secure)
    - [Common failure modes (and what they confirm about the model)](#common-failure-modes-and-what-they-confirm-about-the-model)
  - [Are these Client IDs sensitive?](#are-these-client-ids-sensitive)
- [📦 Mobile Note (`expo-sqlite`)](#-mobile-note-expo-sqlite)
- [💱 Historical-Rate Currency Conversion](#-historical-rate-currency-conversion)
  - [Components](#components)
  - [Runtime flow](#runtime-flow)
  - [Non-obvious decisions](#non-obvious-decisions)
- [⚡ Rendering \& Performance Notes](#-rendering--performance-notes)
  - [Transactions list (the hot spot)](#transactions-list-the-hot-spot)
  - [Cross-cutting providers](#cross-cutting-providers)
  - [Categories screen](#categories-screen)
  - [Sync engine](#sync-engine)
  - [Other micro-wins](#other-micro-wins)
  - [Things deliberately *not* done](#things-deliberately-not-done)
- [📄 Key Files](#-key-files)
- [📚 Related Documentation](#-related-documentation)

---

## 🎯 Overview

The mobile app:

- Runs entirely on-device — **no backend dependency**. The entire data layer (event store, projection
  table, idempotency registry) lives in `expo-sqlite`.
- Implements the same **event-sourced, CQRS** model that the backend uses for its REST API: append-only
  `expense_events`, materialized `expense_projections`, plus a mobile-only `processed_events` table for
  remote-event idempotency. The TypeScript projector mirrors the Kotlin projection algorithm exactly at
  the conflict-resolution layer (strict `>` last-write-wins).
- Syncs across the user's devices via a **shared sync file** in their own cloud drive:
  Google Drive `appDataFolder` or OneDrive `approot`. The sync file is gzip-compressed JSON; the wire
  format and snapshot model are documented in this README. **The backend itself has no equivalent
  file-sync subsystem** — web clients converge through PostgreSQL directly and backup / migration use
  the JSON / CSV `/api/data/export` and `/api/data/import` endpoints instead.
- Uses **OAuth 2.0 + PKCE** with no client secret for cloud-drive authentication
  ([Cloud-Drive Sync — Getting OAuth Client IDs](#-cloud-drive-sync--getting-oauth-client-ids)).
- Has a single `AutoSyncCoordinator` that funnels every sync trigger (cold start, foreground, after-write
  debounce, app-background flush, network reconnect, manual button) and enforces a 30 s minimum gap
  between auto-syncs — see the
  [Automatic Sync Triggers, Throttling, and Bandwidth](#automatic-sync-triggers-throttling-and-bandwidth)
  section below.
- Converts foreign-currency expenses using the **historical monthly rate for the expense's month**
  (cached locally, sourced from the free, key-less [Frankfurter](https://api.frankfurter.dev) API)
  rather than today's rate, so long-range totals don't drift as FX moves. When an exact-month rate
  isn't available, the UI prefixes the affected total with `~` to flag the approximation — see
  [Historical-Rate Currency Conversion](#-historical-rate-currency-conversion).

The path-scoped Copilot rules for this module live in
[`.github/instructions/expenses-tracker-mobile.instructions.md`](../.github/instructions/expenses-tracker-mobile.instructions.md).

---

## 🛠 Tech Stack

- **Expo SDK 55** + **React Native 0.83** + **React 19.2**
- **TypeScript** (strict + `verbatimModuleSyntax` + `exactOptionalPropertyTypes`)
- **React Native Paper v5** — Material 3 component library
- **Expo Router** — file-based routing with typed routes
- **expo-sqlite** — local event store + projection + idempotency registry (mobile-only schema,
  see [Database Schema (on-device, `expo-sqlite`)](#database-schema-on-device-expo-sqlite))
- **TanStack Query** — wraps the local store, mirroring the web frontend's data-fetching layer
- **expo-auth-session** — OAuth 2.0 + PKCE for Google Drive / OneDrive (no client secret)
- **expo-secure-store** — Keychain (iOS) / Keystore (Android) for tokens
- **`@react-native-community/netinfo`** — connectivity-change listener that powers the
  *network reconnect* auto-sync trigger; covers the gap where the app stays foregrounded
  through a connectivity outage (train tunnel, elevator, weak Wi-Fi) and regains the network
  without any user action
- **pako** — gzip encode/decode of `sync.json.gz` (the mobile-only sync wire format)
- **[Frankfurter](https://api.frankfurter.dev)** (`api.frankfurter.dev/v2`) — free, key-less,
  ECB-backed historical + latest FX rates; powers the
  [historical-rate currency conversion](#-historical-rate-currency-conversion)
- **i18next** + **react-i18next** — locale JSON owned by the mobile module (independent
  from the web frontend; to add a new language, copy `src/i18n/locales/en.json`
  to `<lang>.json` and translate in place)
- **Vitest** — pure-TypeScript unit tests for `src/domain/`, `src/sync/`, `src/api/`, and `src/utils/`
  (330+ tests across 25 files). React Native components are NOT tested here — that requires
  `jest-expo`, which is out of scope for the current setup.

---

## 🔄 Sync Engine Architecture

The mobile app implements an **offline-first, peer-to-peer sync engine** over the user's own cloud
drive. There is no central service — every device runs the same algorithm against a single shared
file (`sync.json.gz`) in Google Drive `appDataFolder` or OneDrive `approot`. The backend has no
equivalent file-sync subsystem; this section describes the entire protocol that runs on mobile.

> **Data-protection note.** Because the sync file lives in **the user's own** Google Drive /
> OneDrive, the user is the data controller for that file and the cloud-drive provider is the
> user's sub-processor — *not* the app operator's. The app cannot enumerate or delete files in
> other users' drives, and the OAuth refresh tokens that authorise drive access are kept in
> `expo-secure-store` (hardware-backed), not in `AsyncStorage`. The full role-taxonomy breakdown
> and data-subject-rights matrix for all three modules lives in [`GDPR.md`](../GDPR.md) at the
> repo root.

### Design Principles

1. **Offline-first.** Every write commits to local SQLite synchronously. The user is never blocked
   by network availability.
2. **Eventual consistency by last-write-wins.** Conflicts resolve by event `updatedAt` timestamp
   with strict `>` — equal timestamps don't override. No vector clocks, no CRDTs.
3. **Idempotent at every layer.** The same event applied N times yields the same projection.
   Network retries, duplicate downloads, and replays during recovery are all safe.
4. **One sync in flight at a time.** A single `AutoSyncCoordinator` funnels every trigger and
   enforces a 30 s minimum gap between auto-syncs.
5. **No coordinator, no leader.** Every device runs the same algorithm against a single shared
   file in the user's own cloud drive. Nothing to deploy or operate.
6. **Bandwidth-frugal.** Conditional download (`If-None-Match` → 304), embedded snapshots for
   cold-install, and body truncation after every upload keep round-trips and bytes small even
   on cellular.

### Database Schema (on-device, `expo-sqlite`)

The mobile app mirrors the CQRS shape used by the backend's REST API on three tables, plus a
fourth idempotency registry:

| Table                 | Purpose                                                                                                          |
|-----------------------|------------------------------------------------------------------------------------------------------------------|
| `expense_events`      | Append-only event store. Source of truth for all expense changes on this device.                                 |
| `expense_projections` | Materialized read model. UPSERT with strict `>` last-write-wins on `updated_at`.                                 |
| `category_events`     | Append-only event store for categories.                                                                          |
| `categories`          | Materialized read model for categories. UPSERT with the same LWW guard.                                          |
| `processed_events`    | Idempotency registry. Stores `(event_id, timestamp)` pairs for every remote event already applied to this device. |

`processed_events` carries the **original emission timestamp** (not the local "observed at") so
the retention window in `snapshotBuilder` can prune entries deterministically across devices.
WAL + `synchronous = NORMAL` PRAGMAs are set on every connection in
[`src/db/databaseProvider.tsx`](src/db/databaseProvider.tsx) so writes don't fsync on every commit
— a measurable win during the cold-install snapshot bootstrap.

### Conflict Resolution — Strict `>` Last-Write-Wins

The projection UPSERT only fires when the incoming `updatedAt` is **strictly greater than** the
stored row's `updatedAt`:

```sql
INSERT INTO expense_projections (...) VALUES (...)
ON CONFLICT(id) DO UPDATE SET
    description = excluded.description,
    amount      = excluded.amount,
    ...
    updated_at  = excluded.updated_at
WHERE excluded.updated_at > expense_projections.updated_at;
```

This rule applies uniformly to `CREATED`, `UPDATED`, and `DELETED` events. Two consequences:

- **Soft deletes are not terminal.** A `DELETED` event with `updatedAt = T` can be superseded by
  a later `UPDATED` event with `updatedAt > T` (resurrection).
- **Equal timestamps are rejected** (strict `>`, not `>=`) — necessary to make the rule symmetric
  across devices and avoid a "last receiver wins" tiebreak.

### Sync Workflow (cloud-drive cycle)

```
SyncEngine.performFullSync(adapter)
  1. adapter.download({ ifNoneMatch: cachedEtag })
        kind = 'not-modified' → cache hit, skip remote-event processing
        kind = 'absent'       → first sync, no remote file yet
        kind = 'modified'     → SyncFileCodec.decode → snapshot? + events[]
             if snapshot present and version matches:
                applySnapshot   (bulk LWW UPSERTs + INSERT OR IGNORE into processed_events)
             for each event past the snapshot:
                RemoteEventApplier.apply   (processed_events idempotency + projection)
  2. LocalStore.findUncommittedEvents
        → dropCoveredEvents against snapshot.coveredEvents
        → SyncFileCodec.encode
        → adapter.upload({ ifMatch: etag })
  3. cache new etag (persist to AsyncStorage for cold-start fast path)
  4. on 412 Precondition Failed → ConcurrencyError → retry (max 3) — concurrent writer detected
```

> **One round-trip on a no-op cycle.** The engine never calls a separate `getMetadata()` probe
> before `download()`. The adapter folds the eTag check into the same request — Google Drive sends
> HTTP `If-None-Match`; OneDrive folds it into the metadata round-trip it already needs for the
> item id, so a cache hit never touches `/content`.

**Concurrency.** Both Drive REST and Microsoft Graph return an eTag on the file resource; the
engine forwards it as `If-Match` on upload. A `412 Precondition Failed` becomes a
`ConcurrencyError`, the engine reloads the file, re-applies remote events on top, and retries up
to `MAX_RETRIES = 3` times.

**Sort order.** `(timestamp ASC, eventId ASC)` so every device replays events in the same
deterministic order.

### Sync File Format

**Path on the cloud drive:** `sync.json.gz` at the root of the per-user OAuth scope — Google Drive
`appDataFolder` (hidden, app-only) or OneDrive `approot` (hidden under *Apps / Expenses Tracker*).
The file is gzip-compressed JSON.

```jsonc
{
  "snapshot": {
    "version": 2,
    "createdAt": 1737475200000,
    "expenses":   [ /* every ExpenseProjection, including soft-deleted tombstones */ ],
    "categories": [ /* every Category, including soft-deleted */ ],
    "coveredEvents": [
      // Sorted by eventId. Each entry pairs the event id with the
      // event's original emission timestamp (epoch ms).
      { "eventId": "…", "timestamp": 1737475100000 }
    ]
  },
  "events":         [ /* events past the snapshot, deterministically sorted */ ],
  "categoryEvents": [ /* …same for categories */ ]
}
```

**Event entry shape** (same shape for `events` and `categoryEvents`):

```jsonc
{
  "eventId":   "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": 1737475200000,
  "eventType": "CREATED",                                // or UPDATED / DELETED
  "expenseId": "c4f3d7e9-8b2a-4e6c-9d1f-5a8b3c7e2f0d",
  "userId":    "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "payload": {
    "id":          "c4f3d7e9-8b2a-4e6c-9d1f-5a8b3c7e2f0d",
    "description": "Coffee",
    "amount":      450,                                  // cents
    "currency":    "USD",
    "categoryId":  "7f1c2a3b-4d5e-6f70-8192-a3b4c5d6e7f8",
    "date":        "2026-01-20T10:00:00Z",
    "updatedAt":   1737475200000,
    "deleted":     false
  }
}
```

**Backward compatibility.** Files **without** a `snapshot` field remain readable (the body is
treated as the full event log). Files **with** a `snapshot` must be read by a build that
understands `SNAPSHOT_VERSION`; a mismatch raises `IncompatibleSnapshotError` (the cloud file is
left untouched and the UI surfaces "please update").

### Automatic Sync Triggers, Throttling, and Bandwidth

The mobile module fires sync automatically — components and hooks **never call
`engine.performFullSync()` directly**. Every trigger goes through `AutoSyncCoordinator`
([`src/sync/autoSyncCoordinator.ts`](src/sync/autoSyncCoordinator.ts)), which enforces:

- an in-flight guard (one sync at a time),
- `MIN_AUTO_INTERVAL_MS = 30_000` between two consecutive **auto**-syncs (the manual button passes
  `{ force: true }` to bypass),
- after-write debounce: `QUIET_DEBOUNCE_MS = 15_000` collapses a burst of edits into one upload,
  capped by `CEILING_MS = 60_000` so a continuous edit stream still uploads at least once a minute.

| Trigger           | Fires when                                                  | Coordinator call                          |
|-------------------|-------------------------------------------------------------|-------------------------------------------|
| Cold start        | `signedIn && autoSyncEnabled` becomes `true` on mount       | `requestSync('cold-start')`               |
| Foreground        | `AppState` transitions `background\|inactive → active`      | `requestSync('app-active')`               |
| After local write | Mutation hooks call `notifyLocalWrite()` on success         | `notifyLocalWrite()` (debounced)          |
| App backgrounded  | `AppState` transitions `active → background\|inactive`      | `flush('background-flush')`               |
| Net reconnect     | NetInfo reports offline → online                            | `requestSync('net-reconnect')`            |
| Manual button     | "Sync now" in `SyncCloudDialog`                             | `requestSync('manual', { force: true })`  |

The user controls auto-sync via a toggle in `SyncCloudDialog` (persisted under
`expenses-tracker-sync-auto-enabled`, default on). When it's off, every row above except the
manual button is silenced and any pending after-write debounce is cancelled. NetInfo is
**soft-imported**: if `@react-native-community/netinfo` is not installed, the net-reconnect
trigger silently no-ops.

**Conditional download (`If-None-Match` → 304).** Auto-sync triggers fire frequently — cold start,
foreground, and net reconnect can all hit within seconds of app launch.
`CloudDriveAdapter.download(opts?)` returns a discriminated union:

```ts
type DownloadOutcome =
  | { kind: 'modified';     bytes: Uint8Array; etag: string }
  | { kind: 'not-modified'; etag: string }   // bandwidth saver — no body
  | { kind: 'absent' };                       // first sync, file missing
```

When nothing local is pending and a cached eTag exists, the engine calls
`download({ ifNoneMatch: cachedEtag })`. When local writes are pending the engine downloads
unconditionally — the bytes are needed for the merge step anyway. In-memory test adapters expose a
`notModifiedCount` counter so engine tests can assert the short-circuit fires.

**Persisted eTag across cold starts.** The cached eTag survives process restart. `SyncProvider`
hydrates the per-provider key `expenses-tracker-sync-etag:<provider>` from `AsyncStorage` and seeds
the engine via `SyncEngineDeps.initialEtag`. The engine reports updates back through
`onEtagChange`, which writes fire-and-forget to `AsyncStorage` — it deliberately **does not**
update React state, since a state update on every sync would rebuild the engine `useMemo` and
reset the coordinator's 30 s throttle. On sign-out the persisted entry is cleared, so a subsequent
sign-in to a different account on the same provider never reuses the previous account's
validator. The engine also reports `undefined` whenever it invalidates the cache (concurrency
conflict, remote file disappeared), so the persisted copy is dropped at the same moment.

The first sync after install still does one unconditional download — there is nothing to
revalidate against. Every subsequent cold start should short-circuit at 304.

### Apply-Time Optimizations & Cold-Install Fast Path

The mobile apply pipeline has three layered optimizations on top of the per-event idempotent
applier. All three run on every sync; together they keep a fresh install bootstrap-able in about a
minute even when the sync file already carries thousands of historical events.

**1. Batched-transaction apply** ([`src/sync/batchApply.ts`](src/sync/batchApply.ts)). Remote
events are applied in chunks of `CHUNK_SIZE = 200` inside a single `expo-sqlite` transaction so the
per-event bridge cost amortizes. A failing chunk falls back to a per-event retry loop so one
corrupt payload can never abort the rest. Between chunks the helper does a `setTimeout(0)` to let
the UI thread render — important on a list screen that's open during a large initial sync.

**2. Embedded snapshot in the sync file**
([`src/sync/snapshotBuilder.ts`](src/sync/snapshotBuilder.ts),
[`src/sync/snapshotApply.ts`](src/sync/snapshotApply.ts),
[`src/sync/snapshotPolicy.ts`](src/sync/snapshotPolicy.ts)). The sync file optionally carries a
materialized view of the read model. Cold-install devices apply the snapshot once — bulk LWW
UPSERTs for `expense_projections` and `categories`, plus bulk `INSERT OR IGNORE` into
`processed_events` (`event_id`, `timestamp`) for every `coveredEvents` entry — then iterate the
small post-cutoff event tail. Warm devices see the snapshot as a no-op because their LWW
comparison loses for every row (strict `>` by `updatedAt`).

The snapshot is **purely an optimization** for current readers — semantic correctness is
unchanged once the version matches. But the body is **not** a complete event log:
`dropCoveredEvents` removes every event already captured by the snapshot before upload, so reading
just the body without understanding the snapshot would produce partial state.

**Snapshot schema version.** `SNAPSHOT_VERSION` is the integer carried in every snapshot. It acts
as an emergency fuse for incompatible shape changes that can't be handled by additive evolution.
A mismatch causes `applySnapshot` to throw `IncompatibleSnapshotError`, which propagates out of
`performFullSync` (the retry loop only catches `ConcurrencyError`) and surfaces in the UI as
"this sync file was written by a newer version of the app — please update". The cloud file is
left untouched. Falling back to the body alone would be unsafe because of the truncation above,
so the strict abort is intentional: bump the version only for unrenameable/untyped changes you
don't want older peers to apply blindly.

The on-device `processed_events` table stores `(event_id, timestamp)` pairs so snapshot builds can
carry the original emission timestamp through to peers. Pairing the timestamp with the id means
receiving devices preserve enough information to apply the retention window on their own subsequent
rebuilds. Without it, each cross-device hop would re-stamp the ids with a new "observed at" time
and pruning would never converge.

**Refresh policy** ([`snapshotPolicy.ts`](src/sync/snapshotPolicy.ts)). Rewriting the snapshot
every cycle wastes bandwidth; never rewriting it lets cold-install cost grow without bound. The
chosen heuristic refreshes the snapshot when **more than `SNAPSHOT_REFRESH_THRESHOLD = 500`
events** have accumulated past the existing snapshot's `createdAt` (counted across both event
streams). Idle periods produce zero rewrites; busy periods produce exactly enough refreshes to
bound cold-install cost.

**Retention window** (`PRUNE_WINDOW_MS = 30 days` in
[`snapshotBuilder.ts`](src/sync/snapshotBuilder.ts)). When the snapshot is rebuilt, entries in
`coveredEvents` whose `timestamp <= createdAt - PRUNE_WINDOW_MS` are dropped. This bounds the size
of `coveredEvents` even after years of writes — the projections continue to reflect those events,
but their ids are no longer enumerated. The trade-off is precise: an event whose id has been
pruned is no longer detectable as covered by `dropCoveredEvents`, so if a stale copy of that event
somehow still rides along in a peer's body it will be re-applied on the next sync. Re-apply is a
no-op by LWW (the projection already reflects the same `updatedAt`), so the correctness cost is
zero — only a one-time CPU cost on the rare "old straggler" event. The window value is the
smallest that comfortably exceeds expected sync latency for offline-then-reconnect scenarios
(cellular dead zones, lost phones turned back on weeks later).

**3. Body truncation against `coveredEvents`.** Every upload — not just refresh cycles — runs
`dropCoveredEvents(events, snapshot.coveredEvents)` before encoding. The body then carries only
events past the embedded snapshot, bounding steady-state file growth to one refresh window.
Always-on truncation is also self-healing: if an upload was ever interrupted and left a stale
event in the body, the next cycle drops it because a covered event can never re-enter the body
(until the retention window drops its id, at which point LWW absorbs the re-apply as described
above).

**4. Local event-log retention (`pruneCommittedEvents`).** The wire format already evicts old
events via `dropCoveredEvents`; the local DB needs the same treatment or the on-device
`expense_events` / `category_events` / `processed_events` tables grow without bound. After every
successful sync cycle the engine calls `store.pruneCommittedEvents(Date.now() - PRUNE_WINDOW_MS)`,
which runs three DELETEs in one transaction:

| Table              | Predicate                                  | Why this is safe                                                                                                                                                                          |
|--------------------|--------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `expense_events`   | `committed = 1 AND timestamp < cutoff`     | The UI only reads projections; the event row's only consumer is the snapshot builder, which also drops anything outside the same window. `committed = 1` guarantees the cloud has it.     |
| `category_events`  | `committed = 1 AND timestamp < cutoff`     | Same reasoning as above.                                                                                                                                                                  |
| `processed_events` | `timestamp < cutoff`                       | Pure idempotency state; the only consumer is `snapshotBuilder.collectCoveredEvents`, which itself filters by the same cutoff before emitting `coveredEvents`. No `committed` flag exists. |

The two windows are shared on purpose — `syncEngine.ts` imports `PRUNE_WINDOW_MS` from
`snapshotBuilder.ts` so the same `30 days` controls both. If they drifted apart, the engine could
delete an event whose id still rides in a freshly-uploaded snapshot's `coveredEvents`, and the
next download would silently re-apply it (a no-op under LWW, but extra CPU and bridge traffic).

Pruning is **best-effort housekeeping**: a transient `database is locked` from concurrent writers
is swallowed and the cycle still reports success to the caller — the user's data already shipped,
the next sync retries the prune. The DELETEs are also fully idempotent: re-running with the same
or older cutoff is a no-op.

Trade-off mirrors `coveredEvents` exactly: an uncommitted event with an ancient timestamp (e.g.
the user opened the app after months offline) is **always preserved** — the `committed = 1` guard
is the only signal that the cloud already has it.

### Design Alternatives Considered — Why Not Full LSM Compaction?

The current design is, conceptually, a **degenerate two-level LSM tree** collapsed into a single
sync file. The mapping is direct:

| LSM concept                  | Mobile equivalent                                              |
|------------------------------|----------------------------------------------------------------|
| Memtable                     | `expense_events` / `category_events` rows with `committed = 0` |
| L0 (immutable recent log)    | `EventSyncFile.events` / `categoryEvents` (the body)           |
| Compacted level (read model) | `EventSyncFile.snapshot` (projections + `coveredEvents`)       |
| Compaction trigger           | `shouldRefreshSnapshot` (500-event threshold)                  |
| Tombstone GC (wire format)   | 30-day `PRUNE_WINDOW_MS` on `coveredEvents`                    |
| Tombstone GC (on-device)     | `pruneCommittedEvents` over `expense_events` / `category_events` / `processed_events`, same 30-day cutoff |

A natural extension would be a "proper" LSM with **multiple files per cloud-drive folder** — for
example a long-lived `snapshot.json.gz` plus per-device `tail-<deviceId>.json.gz` write-only delta
files, periodically compacted into a new snapshot. This was considered and **deliberately
rejected** in favor of the single-file model:

1. **Cloud-drive storage gives us per-file eTags only — no cross-file atomicity.** A multi-file
   design would require a separate manifest with its own concurrency story (write new snapshot →
   bump manifest → delete tails). Any crash between those steps leaves orphaned objects we'd
   have to reconcile on every read. The single-file model is *one* atomic unit and one eTag check.
2. **iCloud Drive's directory listing is lazily consistent.** Newly added files can be invisible
   to peers for seconds to minutes after upload. That breaks the "read snapshot + every peer's
   tail" step in subtle ways that are very hard to test on emulators. Reading a single well-known
   file at a fixed path sidesteps this entirely.
3. **No leader for compaction.** Server-backed LSMs have one writer choosing when to compact. In
   a peer-to-peer cloud-drive topology, every device would race to rewrite the snapshot, causing
   wasted work and constant eTag retries. A "designated compactor" requires consensus, which the
   mobile sync architecture explicitly avoids.
4. **Tail-file GC requires a high-water mark we can't compute.** "When can device A delete
   `tail-A.json.gz`?" → only when *every* peer has observed a snapshot that already absorbed it.
   We don't have a peer registry. The pragmatic answer ("delete after N days") just recreates the
   same retention-window trade-off `PRUNE_WINDOW_MS` already solves.
5. **File-count would grow per device, including orphans.** Reinstalls and new phones generate
   fresh device ids, leaving stale `tail-<oldDeviceId>.json.gz` objects in the user's drive
   folder forever. Now we need orphan reaping logic, which is its own correctness problem.
6. **The savings are modest for the actual workload.** Target users have 1–3 devices and write
   ~10–100 events/day. With `PRUNE_WINDOW_MS = 30 days` the snapshot stays small (low single-digit
   MB gzipped even for power users), so the "wasted re-upload" optimized away by an LSM split is
   on the order of a few KB per sync — well below the noise floor of cellular round-trip variance.
7. **Cheaper wins capture most of the same benefit on one file.** The current design already
   does: short-circuit upload when nothing local changed *and* remote eTag is unchanged; skip the
   snapshot rebuild on most cycles (`shouldRefreshSnapshot`); and reuse the prior snapshot bytes
   verbatim when only the body changes. These give us LSM-style amortization (less I/O, less CPU,
   less bandwidth) with **zero new failure modes**.

The two-level conceptual model is the right one for this domain. The cost of physically
materializing the levels into separate cloud objects is not justified by the savings.

### Idempotency Guarantees

The sync engine is idempotent at three layers — duplicate downloads, network retries, and
replays after partial-crash recovery are all safe.

**Layer 1: application-level (the `processed_events` table).** Before applying a remote event,
`RemoteEventApplier` checks the `processed_events` registry:

```ts
if (await store.isEventProcessed(event.eventId)) {
  return false;        // already applied, skip
}
await projector.apply(event);
await store.markEventProcessed(event.eventId, event.timestamp);
```

The check and the apply run inside the same SQLite transaction, so a crash between them can't
leave the projection updated without a registry entry.

**Layer 2: database-level (the strict-`>` UPSERT).** Even without the registry, applying the same
event twice is a no-op because the projection UPSERT only fires when
`excluded.updated_at > expense_projections.updated_at`. The second apply has an equal timestamp
and is filtered out by the `WHERE` clause.

**Layer 3: network-retry (the eTag dance).** A `412 Precondition Failed` on upload throws
`ConcurrencyError`, the engine reloads the file, re-applies remote events on top, and retries.
Because layers 1 and 2 are idempotent, "re-apply" is safe — events that already made it through
become no-ops.

### Component Diagram (mobile-internal)

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Mobile App (one device)                       │
│                                                                        │
│  ┌─────────────────────┐                                               │
│  │ UI / Hooks          │── notifyLocalWrite() ───┐                     │
│  │ (TanStack Query)    │                         ▼                     │
│  └──────────┬──────────┘                  ┌──────────────────────┐     │
│             │                             │ AutoSyncCoordinator  │     │
│             ▼                             │  (in-flight guard,   │     │
│   ┌────────────────────┐                  │   30s throttle,      │     │
│   │ Commands / Queries │                  │   debounce/ceiling)  │     │
│   │   (CQRS split)     │                  └──────────┬───────────┘     │
│   └─────────┬──────────┘                             │                 │
│             │                                        ▼                 │
│             ▼                          ┌────────────────────────┐      │
│   ┌─────────────────────┐              │      SyncEngine        │      │
│   │  LocalStore         │◄────────────►│  performFullSync()     │      │
│   │ (expo-sqlite, WAL)  │              └──────────┬─────────────┘      │
│   └─────────────────────┘                         │                    │
│             ▲                          ┌──────────┴──────────┐         │
│             │                          ▼                     ▼         │
│             │            ┌──────────────────────┐  ┌──────────────────┐│
│             │            │ RemoteEventApplier   │  │  SyncFileCodec   ││
│             │            │ (processed_events    │  │ (gzip + JSON +   ││
│             │            │  idempotency check)  │  │  snapshot/body)  ││
│             │            └──────────┬───────────┘  └────────┬─────────┘│
│             │                       │                       │          │
│             └───────────── apply ───┘                       ▼          │
│                                                  ┌───────────────────┐ │
│                                                  │ CloudDriveAdapter │ │
│                                                  │  (eTag, 304, 412) │ │
│                                                  └────────┬──────────┘ │
│                                                           │            │
│                                  ┌────────────────────────┼─────────┐  │
│                                  ▼                        ▼         ▼  │
│                          GoogleDriveAdapter        OneDriveAdapter     │
│                          (appDataFolder)           (approot)           │
└────────────────────────────────────────────────────────────────────────┘
                                       ▲
                                       │  sync.json.gz
                                       ▼
                          ┌─────────────────────────┐
                          │  User's own cloud drive │
                          │   (no backend involved) │
                          └─────────────────────────┘
                                       ▲
                                       │
                          ┌─────────────────────────┐
                          │   Another device of     │
                          │     the same user       │
                          │  (same architecture)    │
                          └─────────────────────────┘
```

### Mobile Module Layout

| Module                                                                       | Responsibility                                                                |
|------------------------------------------------------------------------------|-------------------------------------------------------------------------------|
| [`src/domain/projector.ts`](src/domain/projector.ts)                         | Last-write-wins UPSERT helper used by both local writes and remote applies.   |
| [`src/domain/commands.ts`](src/domain/commands.ts) / [`queries.ts`](src/domain/queries.ts) | CQRS write/read split. Each command runs in one SQLite transaction.           |
| [`src/sync/syncEngine.ts`](src/sync/syncEngine.ts)                           | Sync orchestration (`performFullSync`, retry loop, eTag bookkeeping).         |
| [`src/sync/autoSyncCoordinator.ts`](src/sync/autoSyncCoordinator.ts)         | In-flight guard, 30 s throttle, after-write debounce / ceiling.               |
| [`src/sync/autoSyncSignal.ts`](src/sync/autoSyncSignal.ts)                   | Module-level `notifyLocalWrite()` exposed to mutation hooks.                  |
| [`src/sync/codec.ts`](src/sync/codec.ts)                                     | Gzip + JSON encode / decode of the `sync.json.gz` wire format.                |
| [`src/sync/snapshotBuilder.ts`](src/sync/snapshotBuilder.ts)                 | Build the embedded snapshot (with retention-window pruning).                  |
| [`src/sync/snapshotApply.ts`](src/sync/snapshotApply.ts)                     | Apply a remote snapshot (bulk LWW + bulk `INSERT OR IGNORE`).                 |
| [`src/sync/snapshotPolicy.ts`](src/sync/snapshotPolicy.ts)                   | `shouldRefreshSnapshot` heuristic (500-event threshold).                      |
| [`src/sync/batchApply.ts`](src/sync/batchApply.ts)                           | 200-event-per-transaction batched apply with per-event fallback on failure.   |
| [`src/sync/remoteEventApplier.ts`](src/sync/remoteEventApplier.ts)           | Per-event idempotency check (`processed_events` registry).                    |
| [`src/sync/remoteCategoryEventApplier.ts`](src/sync/remoteCategoryEventApplier.ts) | Same, for category events.                                                    |
| [`src/sync/cloudDriveAdapter.ts`](src/sync/cloudDriveAdapter.ts)             | Adapter interface (DIP boundary for cloud-drive I/O).                         |
| [`src/sync/googleDriveAdapter.ts`](src/sync/googleDriveAdapter.ts)           | Google Drive `appDataFolder` adapter (REST v3, `If-None-Match`).              |
| [`src/sync/oneDriveAdapter.ts`](src/sync/oneDriveAdapter.ts)                 | OneDrive `approot` adapter (Microsoft Graph).                                 |
| [`src/db/databaseProvider.tsx`](src/db/databaseProvider.tsx)                 | SQLite connection provider (WAL, `synchronous = NORMAL`).                     |
| [`src/db/sqliteLocalStore.ts`](src/db/sqliteLocalStore.ts)                   | `LocalStore` implementation against `expo-sqlite`.                            |

> See [`.github/instructions/expenses-tracker-mobile.instructions.md`](../.github/instructions/expenses-tracker-mobile.instructions.md)
> for the path-scoped Copilot rules that codify these conventions, the full wiring
> (`syncProvider.tsx` / `useAutoSync.ts` / `autoSyncSignal.ts`), and the rationale behind each
> design choice.

---

## 🚀 Running the Mobile App

> **Three runtime modes — pick one based on what you want to do.**
>
> **Expo Go** is a free app from the App Store / Google Play that can load *any* Expo project's JS
> bundle without compiling native code. You don't ship Expo Go to end users — it's a developer
> sandbox. The catch is that Expo Go only ships a fixed set of native modules; a project can only
> run inside Expo Go if its native dependencies are a subset of what Expo Go bundles.
>
> This app uses `expo-sqlite` (bundled with Expo Go ✅) plus `expo-auth-session` and
> `expo-secure-store` for cloud-drive OAuth (also bundled ✅) **but** OAuth requires a custom URI
> scheme (`spendium://redirect`) that Expo Go cannot register. The practical effect is:
>
> | Mode            | How to launch                                                                                   | Works for                                  | Doesn't work for          |
> |-----------------|-------------------------------------------------------------------------------------------------|--------------------------------------------|---------------------------|
> | **Expo Go**     | `npm start`, scan QR in Expo Go                                                                 | UI, local SQLite, all offline behaviour    | Cloud-drive OAuth sign-in |
> | **Dev client**  | [`npx expo run:android`](#-building-a-local-dev-client-npx-expo-runandroid) (full native build) | Everything, with hot reload                | —                         |
> | **Release APK** | [`eas build --profile preview`](#-building--sideloading-a-production-apk) or Option C (Gradle)  | Everything, optimised; install on a phone  | Hot reload                |
>
> Iterate in Expo Go for JS-only work. Switch to a dev client whenever you need to test cloud-drive
> sign-in or any other custom-scheme feature. Build a release APK only when you want a sideloadable
> install for a phone.

### Quick start

```bash
cd expenses-tracker-mobile

# First-time install (no special flags needed)
npm install

# Run the standard checks (lint + Vitest + tsc)
npm run lint
npm run typecheck
npm test

# Start the Expo dev server (requires a simulator or a physical device)
npm start
```

When `npm start` is running, press:

- `a` — open on Android emulator (or connected device)
- `i` — open on iOS Simulator (macOS only)
- `w` — open in a web browser (limited; not the supported target)
- scan the QR code with the **Expo Go** app on a physical device

### Setting up a simulator / emulator

You have three options for running the app during development. Pick whichever fits your OS.

#### Option 1 — Physical device with Expo Go (easiest, any OS)

1. Install **Expo Go** from the [App Store](https://apps.apple.com/app/expo-go/id982107779) (iOS) or
   [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent) (Android).
2. Connect the phone to the **same Wi-Fi network** as your dev machine.
3. Run `npm start` and scan the QR code printed in the terminal (iOS: Camera app; Android: Expo Go's
   built-in scanner).

> Expo Go is fine for the JS-only parts of this app, but **OAuth via `expo-auth-session` and
> `expo-secure-store` need a custom dev client**. For full cloud-drive sync testing on a physical
> device, build a dev client with `eas build --profile development --platform <android|ios>`
> and install the resulting `.apk` / `.ipa`.

#### Option 2 — Android emulator (Windows / macOS / Linux)

1. Install **[Android Studio](https://developer.android.com/studio)**. During the setup wizard,
   make sure **Android SDK**, **Android SDK Platform-Tools**, and **Android Virtual Device** are
   selected.
2. Open Android Studio → **More Actions → Virtual Device Manager → Create Device**. Pick a phone
   profile (e.g. Pixel 7) and a recent system image (API 34 / Android 14 recommended). Download
   the image if prompted, then **Finish**.
3. Set the `ANDROID_HOME` environment variable and add platform-tools to `PATH`:
    - **Windows (PowerShell, persistent — writes the User registry directly, idempotent):**
      ```powershell
      $sdk = "$env:LOCALAPPDATA\Android\Sdk"
      Set-ItemProperty -Path 'HKCU:\Environment' -Name 'ANDROID_HOME' -Value $sdk

      $userPath = (Get-ItemProperty -Path 'HKCU:\Environment' -Name 'Path' -ErrorAction SilentlyContinue).Path
      $entries  = if ($userPath) { $userPath -split ';' | Where-Object { $_ -ne '' } } else { @() }
      foreach ($p in @("$sdk\platform-tools", "$sdk\emulator")) {
          if ($entries -notcontains $p) { $entries += $p }
      }
      Set-ItemProperty -Path 'HKCU:\Environment' -Name 'Path' -Value ($entries -join ';') -Type ExpandString
      ```
      Open a **new terminal** afterwards so it picks up the updated `Path`.

      > Why the registry directly? `[Environment]::SetEnvironmentVariable(..., 'User')`
      > broadcasts a `WM_SETTINGCHANGE` message to every top-level window and can hang for
      > minutes if any of them is unresponsive. Writing `HKCU:\Environment` is instant and
      > equivalent for new processes.
    - **macOS / Linux (`~/.zshrc` or `~/.bashrc`):**
      ```bash
      export ANDROID_HOME="$HOME/Library/Android/sdk"   # macOS
      # export ANDROID_HOME="$HOME/Android/Sdk"         # Linux
      export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
      ```
4. Verify the toolchain:
   ```bash
   adb --version
   emulator -list-avds
   ```
5. Start the emulator (from Android Studio's Device Manager, or `emulator -avd <name>`), run
   `npm start` from `expenses-tracker-mobile/`, and press `a`.

> Hardware acceleration matters: on Windows enable **Hyper-V** or **WHPX** (Android Studio
> installs WHPX automatically); on Intel Macs use **HAXM**; on Apple Silicon use the bundled
> ARM64 system image; on Linux make sure your user is in the `kvm` group.

##### Recommended AVD configuration (stability)

The default AVD wizard picks values tuned for "smallest possible footprint", not "stable for
daily dev work". The Android Studio emulator is notoriously fragile on Windows; the settings
below eliminate the most common crash / freeze causes. Pick these explicitly when creating
the device (or **Edit Device** an existing one — then **Wipe Data** so the new values take
effect instead of being shadowed by the old userdata image).

| Setting                   | Default      | Recommended                                             | Why                                                                                                                                                                                                      |
|---------------------------|--------------|---------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Device profile**        | Pixel 9 / 10 | **Pixel 7**                                             | Most battle-tested profile; what most Expo / RN guides assume.                                                                                                                                           |
| **API level**             | Latest       | **34** (Android 14)                                     | Expo SDK 55 / RN 0.83 cap `targetSdk` at 35. Preview API images (37+) are explicitly unstable.                                                                                                           |
| **Services**              | Google Play  | **Google APIs**                                         | The Play image runs Play Services + Play Store auto-updaters in the background — #1 cause of random freezes. You don't need Play Store for `npx expo run:android`.                                       |
| **ABI**                   | x86_64       | **x86_64** (Intel/AMD) or **arm64-v8a** (Apple Silicon) | Match the host architecture exactly.                                                                                                                                                                     |
| **Preferred ABI**         | Optimal      | **x86_64** (or arm64-v8a)                               | "Optimal" lets the emulator translate cross-arch binaries via `libndk_translation`. Translation is slow *and* a known crash source. Force the host arch to disable it.                                   |
| **Default boot**          | Quick        | **Cold**                                                | Quick boot uses a snapshot; snapshot restore is the #1 source of "started, then froze" and "Metro can't connect" reports. Cold boots take 20–40 s but are far more reliable.                             |
| **Graphics acceleration** | Automatic    | **Hardware — GLES 2.0**                                 | "Automatic" sometimes picks ANGLE-on-D3D on Windows and crashes on driver updates. Explicit is deterministic. (Fall back to **SwiftShader / software** if you get GPU crashes — slower but bulletproof.) |
| **RAM**                   | 1.5–2 GB     | **4 GB**                                                | 2 GB is heavily swap-bound on API 34; apps get killed under memory pressure and the emulator surfaces it as "process terminated".                                                                        |
| **VM heap size**          | 228 MB       | **512 MB**                                              | API-24 era default. Hermes + debugger needs 384+ MB; OOM kills look like emulator crashes.                                                                                                               |
| **CPU cores**             | 2            | **4**                                                   | Don't exceed half your host's physical cores.                                                                                                                                                            |
| **Internal storage**      | 2 GB         | **6 GB**                                                | RN dev clients + Metro cache + a couple of APK rebuilds fill 2 GB fast.                                                                                                                                  |

After clicking **Finish**: right-click the AVD → **Wipe Data**. Without this the existing
userdata image keeps the old RAM / heap settings.

###### Host-level tips (Windows)

These matter at least as much as the AVD settings themselves:

- **Exclude the AVD + SDK directories from Windows Defender real-time scanning** —
  `%USERPROFILE%\.android\avd\` and `%LOCALAPPDATA%\Android\Sdk\`. Defender locking the qcow2
  disk image mid-write produces a silent *"emulator process terminated"* with no useful log.
- **Don't run Docker Desktop and the emulator at the same time** unless Docker is fully on
  the WSL2 backend — both want the Hyper-V hypervisor, and the loser crashes.
- **Keep emulator + platform-tools current** — `sdkmanager --update`. Pre-33.x emulator
  binaries crash on Windows 11 24H2.

###### If the AOSP emulator still misbehaves

Three escalation paths in order of effort:

1. **Physical Android device over USB** (gold standard). Enable Developer Options →
   USB Debugging, connect, then `adb reverse tcp:8081 tcp:8081` so Metro speaks to the
   device over USB regardless of Wi-Fi. Restarting the phone is far cheaper than restarting
   an emulator.
2. **Genymotion Personal** (free for non-commercial use). Runs on VirtualBox instead of
   WHPX / Hyper-V and is dramatically more stable on Windows. Pairs cleanly with Android
   Studio's `adb`.
3. **EAS preview build + same physical device** — `eas build --profile preview
   --platform android`, install the APK. Useful for reproducing release-mode bugs.

#### Option 3 — iOS Simulator (macOS only)

1. Install **[Xcode](https://apps.apple.com/app/xcode/id497799835)** from the Mac App Store
   (large download, ~10 GB).
2. Open Xcode once and accept the license, then install the command-line tools:
   ```bash
   sudo xcode-select --install
   sudo xcodebuild -license accept
   ```
3. Install a simulator runtime: **Xcode → Settings → Platforms → iOS → Get** (or **+** to pick a
   specific version). iOS 17+ is recommended.
4. (Optional but recommended) install Watchman for faster Metro file watching:
   ```bash
   brew install watchman
   ```
5. Verify:
   ```bash
   xcrun simctl list devices
   ```
6. Run `npm start` from `expenses-tracker-mobile/` and press `i`. Expo will boot the default
   simulator and install the app.

> iOS Simulator is **not available on Windows or Linux** — there is no legal way to run it
> outside macOS. From a Windows machine, use the Android emulator locally and rely on
> `eas build --platform ios` (cloud build) when you need an iOS artifact.

### Verifying the setup

After starting `npm start`, the Metro bundler should print something like:

```
› Metro waiting on exp://192.168.1.42:8081
› Press a │ open Android
› Press i │ open iOS simulator
```

If `a` reports "No Android connected device found", run `adb devices` — the emulator should
appear as `emulator-5554   device`. If it shows `unauthorized`, accept the USB-debugging prompt
on the device; if it shows `offline`, cold-boot the emulator from Android Studio's Device
Manager.

To produce installable builds via EAS (Expo Application Services):

```bash
# Android (works from Windows / macOS / Linux — cloud build by default)
eas build --platform android --profile preview

# iOS (requires an Apple developer account and either macOS or EAS cloud)
eas build --platform ios --profile preview
```

---

## 🔧 Building a Local Dev Client (`npx expo run:android`)

`npm start` + Expo Go covers most JS-only work, but features that need native modules
(cloud-drive OAuth, `expo-secure-store`, background sync) require a **dev client** built
locally. From `expenses-tracker-mobile/`:

```bash
npx expo run:android   # generates android/, runs Gradle, installs APK on device/emulator
```

This invokes the full Android NDK + CMake + Kotlin/Gradle pipeline and has three host-level
prerequisites beyond the SDK / emulator setup above.

**1. JDK 17–21 (NOT JDK 22+)** — AGP 8.12 (bundled with Expo SDK 55 / RN 0.83) only supports
JDK 17–21. On JDK 22+ the CMake configure tasks fail with
`WARNING: A restricted method in java.lang.System has been called`. Microsoft Build of OpenJDK
21 LTS, Eclipse Temurin 21, Azul Zulu 21, Android Studio's bundled JBR 21 all work. Set
`JAVA_HOME` to the JDK 21 install root and reopen your terminal. The backend uses Gradle
toolchains (`gradle/libs.versions.toml: java = "21"`) and is unaffected by the global JDK.

**2. Windows: enable Win32 long path support** — RN's autolinked CMake codegen embeds
absolute source paths inside the build directory, producing object-file paths of ~380 chars.
The default Windows MAX_PATH of 260 will fail the build with
`ninja: error: Stat(...): Filename longer than 260 characters`. Two steps are needed:

- Set the registry flag once (admin / UAC required):
  ```powershell
  Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-Command',
    "Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' LongPathsEnabled 1 -Type DWord"
  ```
- Enable long-path support in git as well (no admin):
  ```powershell
  git config --global core.longpaths true
  ```

**3. Windows: replace Android SDK's bundled `ninja.exe`** — the registry flag is necessary
but **not sufficient**: each process must also declare `longPathAware` in its application
manifest. The `ninja.exe` shipped with Android SDK `cmake/3.22.1/` is version 1.10.2 (2020)
and lacks that manifest entry, so Windows continues to enforce MAX_PATH on it regardless of
the registry. Replace it with ninja 1.11+ (kitware-built binaries from
[ninja-build releases](https://github.com/ninja-build/ninja/releases)):

```powershell
$bin = "$env:LOCALAPPDATA\Android\Sdk\cmake\3.22.1\bin"
Copy-Item "$bin\ninja.exe" "$bin\ninja.exe.bak"
Invoke-WebRequest 'https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-win.zip' `
  -OutFile "$env:TEMP\ninja-win.zip"
Expand-Archive "$env:TEMP\ninja-win.zip" -DestinationPath "$env:TEMP\ninja" -Force
Copy-Item "$env:TEMP\ninja\ninja.exe" "$bin\ninja.exe" -Force
```

Verify with:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\cmake\3.22.1\bin\ninja.exe" --version   # should print 1.12.1+
```

After changing any of the above, clean stale CMake artifacts before the next build:

```powershell
cd expenses-tracker-mobile\android
Remove-Item -Recurse -Force app\.cxx, app\build -ErrorAction SilentlyContinue
.\gradlew.bat --stop
```

> macOS / Linux are unaffected by points 2 and 3 — their filesystems have no 260-char limit.
> The JDK version requirement (point 1) applies to every host OS.

---

## 📦 Building & Sideloading a Production APK

This section covers building a release-mode `.apk` and installing it directly on an Android phone
(no Play Store involved).

> **Publishing to the Play Store?** See
> [GOOGLE-PLAY-DEPLOYMENT.md](./GOOGLE-PLAY-DEPLOYMENT.md) for the end-to-end Play Console
> workflow (account setup, AAB build, `eas submit`, Data safety form, staged rollout). The
> sub-sections below are still relevant — Play deployment reuses the same EAS keystore and
> [one-time setup](#one-time-setup) — but the artifact format and submission flow differ.

### Which EAS profile to use

[`eas.json`](./eas.json) ships three build profiles, but **only `preview` produces a directly-installable
APK**:

| Profile       | Output             | Distribution                                 | Use for                                                                                |
|---------------|--------------------|----------------------------------------------|----------------------------------------------------------------------------------------|
| `development` | `.apk` (dev client)| `internal`                                   | Local dev with `expo-dev-client` + Metro                                               |
| `preview`     | `.apk`             | `internal`                                   | **Sideloading a release build onto your phone**                                        |
| `production`  | `.aab`             | `store` (Google Play default)                | [Submitting to the Play Store](./GOOGLE-PLAY-DEPLOYMENT.md)                            |

The `production` profile defaults to Android App Bundle (AAB) which Google Play repackages per device —
you can't install an AAB by tapping it. So the standard "give me a production-quality APK I can
sideload" answer is `preview`. It applies the same release-mode optimizations (R8/ProGuard, Hermes
bytecode, no debug overlay) as `production`; the only differences are the output format and the
auto-increment of `versionCode`.

### One-time setup

> **Applicability:** Steps 1 and 2 are required for **Option A** and **Option B** — both use the EAS
> CLI (the `--local` flag only changes *where* the build runs, not *who* orchestrates it). Only
> **Option C** (pure Gradle) bypasses EAS entirely and lets you skip them. Step 3 applies to **all
> three options** because it's about runtime OAuth, not about how the APK is built.

**1. Free Expo account + CLI login** *(Options A & B):*

```powershell
cd expenses-tracker-mobile
npm install -g eas-cli   # one-time global install of the EAS CLI
eas login                # opens a browser; sign up at https://expo.dev if you don't have an account
eas whoami               # verify
```

> **Heads up — `npx eas …` does NOT work.** The npm package is named `eas-cli`, but the
> executable it installs is named `eas`. `npx` looks up *package* names, not bin names, so
> `npx eas login` fails with `npm error could not determine executable to run`. Either install
> `eas-cli` globally as above (then run `eas …` directly), or use the explicit package name:
> `npx eas-cli login`. All `eas …` commands below assume the global install.

**2. Link the project to an EAS project ID** *(Options A & B)* — on first build EAS writes
`extra.eas.projectId` into [`app.json`](./app.json); accept the prompt and commit the change:

```powershell
eas project:init
```

**3. Configure OAuth client IDs** *(all options)* so cloud-drive sync works in the release build —
see the next section
[Cloud-Drive Sync — Getting OAuth Client IDs](#-cloud-drive-sync--getting-oauth-client-ids). Skipping
this step still produces a working app, but Google Drive / OneDrive sign-in will fail until real
client IDs are wired in.

> **Already set during development?** If you wired in `GOOGLE_OAUTH_CLIENT_ID_ANDROID` /
> `GOOGLE_OAUTH_CLIENT_ID_IOS` / `MICROSOFT_OAUTH_CLIENT_ID` earlier (for example while testing
> [`npx expo run:android`](#-building-a-local-dev-client-npx-expo-runandroid)), there is nothing
> extra to do here — the values are already committed to the source tree and the bundler will inline
> them into the release APK automatically. Skip this step.

### Option A — Cloud build via EAS (recommended, works from Windows with zero extra tooling)

```powershell
cd expenses-tracker-mobile
eas build --platform android --profile preview
```

This uploads the source tarball to Expo's build servers (10–15 min). EAS prints a build URL and a QR
code; both lead to the finished `.apk`.

> **First-ever build for this `package` (`com.vshpynta.spendium`):** EAS prompts to generate a
> release keystore and stores it in your Expo account. **Don't lose that account** — every future
> upgrade of the same app must be signed with the same keystore, or Android will refuse to install
> over the existing one. Run `eas credentials` to back the keystore up locally if you care about
> long-term recoverability.

### Option B — Local cloud-free build (`--local` flag)

```bash
cd expenses-tracker-mobile
eas build --platform android --profile preview --local
```

This runs the same pipeline as Option A on **your** machine — no Expo cloud round-trip. Requires
everything the [`expo run:android`](#-building-a-local-dev-client-npx-expo-runandroid) section
already documents:

- **JDK 17–21** (not 22+) with `JAVA_HOME` pointed at it.
- Android SDK (platform 34+), NDK 27.x, and CMake 3.22+ — all installable through Android Studio's
  SDK Manager.

> **Windows is NOT supported by `eas build --local`.** Running it from PowerShell fails immediately
> with `Unsupported platform, macOS or Linux is required to build apps for Android` — the EAS local
> pipeline shells out to bash and assumes a POSIX environment. On Windows you have three options:
>
> 1. **Stay on Option A** (cloud build) — same artifact, zero extra setup.
> 2. **Use WSL2 + Ubuntu.** Full one-time setup (install WSL2, JDK 17, Android cmdline-tools, etc.)
>    is documented in [GOOGLE-PLAY-DEPLOYMENT.md → Option B → Windows: one-time WSL2 setup](GOOGLE-PLAY-DEPLOYMENT.md#windows-one-time-wsl2-setup).
>    The same setup works for `preview` builds — just swap the profile.
> 3. **Use Option C** (pure Gradle) below — it's Windows-native and bypasses EAS entirely. The
>    trade-off is that you manage your own keystore and `versionCode`.

Output is a single `build-<timestamp>.apk` written to `expenses-tracker-mobile/` itself.

### Option C — Pure Gradle (skip EAS entirely)

This path uses only Node, Expo's `prebuild` codegen, and the Android Gradle toolchain — no EAS
account, no `eas-cli`. Use it when you want a fully offline, EAS-free build pipeline.

**Prerequisites** — same host setup as the dev-client section
[Building a Local Dev Client (`npx expo run:android`)](#-building-a-local-dev-client-npx-expo-runandroid).
You need **all three** host-level requirements documented there:

1. **JDK 17–21** with `JAVA_HOME` pointed at it (not JDK 22+).
2. **Android SDK** (platform 34+), **NDK 27.x**, and **CMake 3.22+** — install via Android Studio's
   SDK Manager. Make sure `ANDROID_HOME` is set and `%ANDROID_HOME%\platform-tools` is on `PATH`.
3. **Windows only:** Win32 long-path support enabled (registry + `git config core.longpaths true`)
   and the bundled `ninja.exe` replaced with 1.12+ — full instructions in the dev-client section.

**Build steps:**

**1. Install npm dependencies:**

```powershell
cd expenses-tracker-mobile
npm install
```

**2. Generate the native `android/` project** (Expo writes `android/` from `app.json` + the installed
Expo modules; `--clean` discards any previous prebuild so the output is reproducible):

```powershell
npx expo prebuild --platform android --clean
```

**3. Build the release APK with Gradle:**

```powershell
cd android
.\gradlew.bat assembleRelease
```

(On macOS / Linux use `./gradlew assembleRelease`.)

**4. APK output:**

```
expenses-tracker-mobile/android/app/build/outputs/apk/release/app-release.apk
```

Install it on your phone using the steps in
[Installing the APK on your phone](#installing-the-apk-on-your-phone).

> **Cloud-drive sync is configured separately**, not as part of the build. If you skip the OAuth
> client IDs (step 3 of [One-time setup](#one-time-setup)), the APK still builds and the app runs
> normally — only Google Drive / OneDrive sign-in fails at runtime. The full walkthrough is in
> [Cloud-Drive Sync — Getting OAuth Client IDs](#-cloud-drive-sync--getting-oauth-client-ids).

> **The default APK is ~100 MB — this is normal**, and easy to shrink. `assembleRelease` produces a
> single **universal APK** that bundles native `.so` libraries for all four Android ABIs
> (`armeabi-v7a`, `arm64-v8a`, `x86`, `x86_64`) listed in
> [`android/gradle.properties`](./android/gradle.properties) (`reactNativeArchitectures=...`). Each
> ABI carries its own copy of Hermes, the React Native core, and every native module
> (`expo-sqlite`, `expo-secure-store`, `expo-auth-session`, `react-native-svg`, …), so the native
> code is duplicated 4×.
>
> For sideloading onto a real phone, build for `arm64-v8a` only (every Android device from the last
> ~7 years) — APK drops to **~30–40 MB**:
>
> ```powershell
> .\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a
> ```
>
> Use `x86_64` instead for an Android emulator on an x86 PC. The Google Play Store solves this
> automatically via AAB splits; sideloading does not, which is why the unrestricted APK is large.

> **Default signing is the debug keystore** — fine for personal sideloading on a phone you own, but
> not suitable for anyone else's device or for upgrading an EAS-built APK. For a real release keystore,
> generate one with `keytool` and wire it in via `android/gradle.properties`
> (`MYAPP_UPLOAD_STORE_FILE`, `MYAPP_UPLOAD_KEY_ALIAS`, `MYAPP_UPLOAD_STORE_PASSWORD`,
> `MYAPP_UPLOAD_KEY_PASSWORD`). Expo's docs cover this end-to-end:
> [`Manually configuring Android signing`](https://docs.expo.dev/app-signing/local-credentials/#android-credentials).

### Installing the APK on your phone

**Over USB (fastest if `adb` is already on your `PATH`)**

```powershell
adb install -r path\to\app-release.apk    # -r = reinstall, preserve app data
```

`adb` lives in `%ANDROID_HOME%\platform-tools` (added to `PATH` by the simulator-setup section above).
Enable **Developer Options → USB Debugging** on the phone before plugging it in and accept the
fingerprint prompt. `-r` only works for upgrades signed with the **same** keystore as the previous
install — if signatures differ, `adb uninstall com.vshpynta.spendium` first.

**Wireless (no cable needed)**

- **Cloud storage (OneDrive / Google Drive / Dropbox).** Drop `app-release.apk` into any folder
  synced to your cloud drive, open that drive's app on the phone, tap the APK to download it, then
  tap the downloaded file to launch Android's package installer. The first time you do this Android
  asks **"Allow OneDrive (or Drive / Dropbox / your browser) to install unknown apps"** — enable it
  for that app and proceed. Android then shows a Play-Protect warning ("an unknown developer…"); tap
  **More details → Install anyway**. This is the easiest path when you don't have `adb` set up.
- **EAS build URL** (Options A & B only). Open the build URL from `eas build` on the phone, tap
  the `.apk` link, follow the same "Install unknown apps" → "Install anyway" prompts.
- **Self-hosted HTTP server.** From the APK's directory on your PC, run
  `python -m http.server 8000`, then open `http://<your-PC-LAN-ip>:8000/app-release.apk` on the phone
  over the same Wi-Fi. Same install prompts apply.

### Practical notes

- **First launch is slow** — 10–20 s while Android AOT-compiles the JS bundle. Normal for a release
  build; subsequent launches are sub-second.
- **Version bumps.** The `preview` profile inherits `version` and `android.versionCode` from
  [`app.json`](./app.json). Bump `versionCode` before each new APK so Android treats it as an upgrade
  rather than refusing to install (or add `"autoIncrement": true` to the `preview` profile in
  `eas.json` to let EAS bump it for you).
- **iOS sideloading** is a different story: it requires an Apple Developer account ($99/year),
  device-specific provisioning, and either macOS with Xcode or `eas build --platform ios` followed
  by TestFlight distribution. Out of scope for "tap and install".

---

## 🔐 Cloud-Drive Sync — Getting OAuth Client IDs

The mobile app uses **OAuth 2.0 with PKCE** to talk to Google Drive and OneDrive. There is **no client
secret** — PKCE replaces it with a per-flow code challenge — so the only thing you need to provide is the
**Client ID** for each provider. The client IDs are referenced as constants in source:

| Provider              | Constant                       | File                                                                 |
|-----------------------|--------------------------------|----------------------------------------------------------------------|
| Google Drive (Android)| `GOOGLE_OAUTH_CLIENT_ID_ANDROID` | [`src/sync/googleDriveAdapter.ts`](./src/sync/googleDriveAdapter.ts) |
| Google Drive (iOS)    | `GOOGLE_OAUTH_CLIENT_ID_IOS`     | [`src/sync/googleDriveAdapter.ts`](./src/sync/googleDriveAdapter.ts) |
| OneDrive              | `MICROSOFT_OAUTH_CLIENT_ID`      | [`src/sync/oneDriveAdapter.ts`](./src/sync/oneDriveAdapter.ts)       |

Google requires a **separate Client ID per platform** (the bundle id + signing fingerprint that Google
verifies on each token request differ between iOS and Android), so `googleDriveAdapter.ts` resolves the
active id via `Platform.select({ android: …, ios: … })` at module load. OneDrive uses a single
cross-platform client id.

All three constants ship with a `TODO_REPLACE_WITH_*` sentinel value. Replace the ones you need (you can
leave the iOS constant untouched if you never build for iOS — Google Drive sync simply stays disabled
on that platform) before running the OAuth flow on a device.

The redirect URI used by both adapters is **`spendium://redirect`** — derived from the `scheme`
field in [`app.json`](./app.json). The bundle / package identifier is **`com.vshpynta.spendium`**
for both iOS and Android.

> ⚠️ **You cannot test the OAuth flow in Expo Go.** Expo Go ignores the app's custom `scheme` and
> generates a sandbox redirect URI like `exp://192.168.x.x:8081/--/redirect`, which neither Microsoft
> nor Google will accept. You must run the app in a **development build** (or production build) so
> that the native binary owns the `spendium` scheme:
>
> ```powershell
> cd expenses-tracker-mobile
> # one-time — already added to package.json:
> # npx expo install expo-dev-client
>
> # Android (requires Android SDK / emulator / USB-connected device):
> npx expo run:android
>
> # iOS (requires macOS + Xcode):
> npx expo run:ios
>
> # Or build a dev client in the cloud and install the resulting .apk / .ipa:
> eas build --profile development --platform android
> ```
>
> Inside a dev build, `AuthSession.makeRedirectUri({ scheme: 'spendium', path: 'redirect' })`
> correctly returns `spendium://redirect`. The sign-in dialog in **Settings → Cloud sync** logs
> the live value as `[oauth] redirectUri = …` to Metro so you can verify before talking to the
> provider's redirect-URI registration.

### Microsoft (OneDrive)

1. Sign in to <https://entra.microsoft.com> and open **App registrations → New registration**.
2. Choose **Personal Microsoft accounts only** (this matches the `consumers` tenant used by the adapter).
   If you also need work / school accounts, pick **Accounts in any organizational directory and personal
   Microsoft accounts** and change the tenant in `oneDriveAdapter.ts` from `consumers` to `common`.
3. Under **Redirect URI**, select **Mobile and desktop applications** and add
   `spendium://redirect` exactly.
4. Open **API permissions → Add a permission → Microsoft Graph → Delegated permissions** and add:
    - `Files.ReadWrite.AppFolder`
    - `offline_access` (so the app can refresh tokens silently)
5. Open **Authentication (Preview) → Settings** tab and toggle **Allow public client flows** to
   **Enabled**, then click **Save** (PKCE is a public-client flow). In the classic Authentication
   experience the same toggle lives at the bottom of the page under **Advanced settings → Allow public
   client flows: Yes**.
6. Copy the **Application (client) ID** from the **Overview** blade and paste it into
   `MICROSOFT_OAUTH_CLIENT_ID`.

### Google (Google Drive)

> The Google Cloud Console reorganized this flow in 2024–2025. What used to be **APIs & Services →
> OAuth consent screen** is now **Google Auth Platform**, and the legacy multi-page form is replaced
> by a short "Get started" wizard. The steps below reflect the current UI.

1. Sign in to <https://console.cloud.google.com>, create a project (or pick an existing one), and open
   **APIs & Services → Library → Google Drive API → Enable**.
2. Open **APIs & Services → OAuth consent screen** (this now lands on the **Google Auth Platform**
   overview page). If you see *"Google Auth Platform not configured yet"*, click **Get started** and
   walk through the wizard:
    - **App Information** — App name: `vs-expenses-tracker`. User support email: your Google account.
    - **Audience** — User type: **External**.
    - **Contact Information** — Developer contact email: your Google account.
    - **Finish** — accept the *Google API Services User Data Policy* and click **Create**.
3. **Move the app out of Testing into Production.** This is critical — Google issues refresh tokens
   that **expire after 7 days** for any OAuth client whose consent screen is still in **Testing**
   status, which silently signs users out roughly once a week
   (<https://developers.google.com/identity/protocols/oauth2#expiration>). OneDrive does not have an
   equivalent restriction. From the left sidebar open **Audience** and:
    - At the top of the page check the **Publishing status** field. If it shows **Testing**, click
      **Publish app** and confirm in the dialog. After publishing the status switches to **In
      production** and refresh tokens become long-lived (only invalidated by user revocation, ~6
      months of total inactivity, a password change, or the per-account 50-refresh-token limit).
    - Because this app requests only the narrow scope
      `https://www.googleapis.com/auth/drive.appdata` — which Google classifies as **non-sensitive**
      (access is limited to files this client ID created in the app-private folder; the user's normal
      Drive is untouched) — publishing is **instant**. Google does **not** require the brand
      verification / security assessment process that sensitive or restricted scopes trigger.
    - The **Test users** section becomes irrelevant once the app is in production; you can leave any
      previously-added entries or remove them, it makes no difference.
4. *(Optional)* Open **Data Access** (or **Scopes**) and add
   `https://www.googleapis.com/auth/drive.appdata`. This is not required — `expo-auth-session` requests
   the scope dynamically at sign-in time and `drive.appdata` is non-sensitive, so it does not need to
   be pre-registered — but adding it makes the consent screen wording explicit.
5. Open **Clients** in the left sidebar (legacy path: **APIs & Services → Credentials**) and click
   **+ Create client → OAuth client ID**. Create **two** clients — one per platform — using the
   bundle / package identifier `com.vshpynta.spendium`:
    - **iOS** — Application type **iOS**, Bundle ID `com.vshpynta.spendium`.
    - **Android** — Application type **Android**, Package name `com.vshpynta.spendium`, plus
      the **SHA-1 certificate fingerprint** of the keystore that signs the APK Google delivers to
      end-user devices. Pick the SHA-1 based on how that APK is actually signed:

      - **Play-distributed builds (Internal/Closed/Production tracks)** — this is the case for any
        build a tester or end user installs from the Play Store, regardless of whether you uploaded
        the `.aab` via EAS Cloud (`eas submit`), EAS Local, or pure Gradle. **Play App Signing**
        strips the upload key on Google's servers and re-signs the APK with Google's own
        *app signing key* before delivery, so the SHA-1 that matters at OAuth runtime is the
        **app signing key SHA-1**, not the upload key SHA-1. Find it in Play Console:
        **Protected with Play** → expand the **Play Store protection** row → **Protect app signing
        key** sub-item → **Manage Play app signing** button (equivalent direct URL:
        `https://play.google.com/console/u/0/developers/<DEVELOPER_ID>/app/<APP_ID>/keymanagement`).
        Copy the **SHA-1 certificate fingerprint** value from the **App signing key certificate**
        block (the top one — *not* the **Upload key certificate** block underneath) and paste it
        into the OAuth client form.
      - **Local Gradle / `npx expo run:android` builds** — only relevant if you sideload the APK
        instead of installing it from a Play track. The project's `android/app/build.gradle`
        currently signs both debug *and* release with the bundled `android/app/debug.keystore`
        (see `signingConfigs.debug`), so use that keystore's SHA-1. From the
        `expenses-tracker-mobile/android/` directory:
        ```pwsh
        keytool -list -v `
          -keystore "app\debug.keystore" `
          -alias androiddebugkey -storepass android -keypass android
        ```
        Copy the line labeled `SHA1:` (40 hex chars separated by colons).

      > **Single SHA-1 per Android client (Google's current UI).** The Google Cloud Console no
      > longer lets you register multiple SHA-1 fingerprints on one Android OAuth client — both
      > the *Create* and *Edit* views accept exactly one. If you need OAuth to work in **both**
      > the Play-signed track-installed build **and** locally-sideloaded debug builds, pick **one**
      > of the two workarounds below — do not try to add a second fingerprint, the field doesn't
      > exist:
      > 1. **Swap the SHA-1 manually** when you switch which build you're testing OAuth in. Fast,
      >    no code change. Acceptable when OAuth testing in local dev is rare. The OAuth client ID
      >    stays the same either way, so the source-code constant
      >    (`GOOGLE_OAUTH_CLIENT_ID_ANDROID`) doesn't move.
      > 2. **Create a second OAuth client** (same package name `com.vshpynta.spendium`, different
      >    SHA-1 — e.g. one for the Play App Signing key, one for the dev keystore). Each client
      >    gets its own Client ID, so you'd have to inject the right ID at build time (e.g. via
      >    `app.json` `extra` + `expo-constants`, switched per EAS build profile). More machinery;
      >    only worth it if you regularly test OAuth in local-sideloaded debug builds.
      >
      > For everyday work, **prefer option 1 with the Play App Signing key SHA-1 registered**, since
      > Play-installed builds are what real users run. The first time you sideload a debug build and
      > Google rejects sign-in with `redirect_uri_mismatch` or `invalid_client`, you'll know to swap.

      After saving the Android client, open it again and scroll to **Advanced settings** at the
      bottom of the edit page. Toggle **Custom URI scheme → Enabled** and click **Save**. Since
      May 2024 Google requires this opt-in for any Android OAuth client that uses a custom
      `<package-name>:/oauth2redirect` redirect (which `expo-auth-session` does). New clients have
      the toggle **off** by default; without it, sign-in fails with
      *"Custom URI scheme is not enabled for your Android client."* iOS clients do not have this
      setting — custom schemes are always allowed there.
6. Copy each resulting **Client ID** (looks like `1234567890-abcdefg.apps.googleusercontent.com`) and
   paste it into the matching per-platform constant in
   [`src/sync/googleDriveAdapter.ts`](./src/sync/googleDriveAdapter.ts):
    - Android client ID → `GOOGLE_OAUTH_CLIENT_ID_ANDROID`
    - iOS client ID → `GOOGLE_OAUTH_CLIENT_ID_IOS`

   You only need to fill in the platform(s) you actually build for —
   `isGoogleDriveConfigured()` checks the constant for the **current** platform, so leaving the iOS
   placeholder in place cleanly disables Google Drive on iOS without breaking Android.

#### "I synced but I don't see the file in Google Drive"

This is expected — and is the entire point of using `appDataFolder` (the OneDrive equivalent is
`approot`). Files in that space are **app-private**:

- They do **not** appear under **My Drive** in the web UI or the Drive mobile app.
- They do **not** count against the user's visible storage quota in the way regular files do
  (`drive.google.com` shows them only on the *Storage* page under *Hidden app data*).
- No other app or website can read or list them — the OAuth scope
  `https://www.googleapis.com/auth/drive.appdata` grants access **only** to files this exact
  client ID created. This is the narrowest scope Google offers for Drive and is why the app does
  not have to go through Google's sensitive-scope verification process.

To verify the sync file actually exists after a successful sync:

1. **Two-device test (recommended).** Install the app on a second device (or wipe & reinstall on
   this one), sign in with the same Google account, tap **Sync now**. All expenses, categories and
   exchange-rate caches should reappear without re-entering anything.
2. **Drive web UI.** Open <https://drive.google.com/drive/settings> → **Manage apps**, find
   *vs-expenses-tracker* in the list. The entry shows the storage used by the app's hidden data
   (typically a couple of KB) and offers a one-click **Delete hidden app data** action — useful for
   forcing a fresh sync from scratch during testing. The entry only appears after the first
   successful upload.
3. **OAuth Playground.** Sign into <https://developers.google.com/oauthplayground>, authorize
   `https://www.googleapis.com/auth/drive.appdata`, then call
   `GET https://www.googleapis.com/drive/v3/files?spaces=appDataFolder`. The response lists
   `sync.json.gz` with its `id`, `modifiedTime`, and `version` (Drive v3's monotonic concurrency
   token — see `googleDriveAdapter.ts` for why we use this instead of HTTP `ETag`).

OneDrive's `approot` is slightly more visible: on OneDrive Web it appears as a regular folder under
**My files → Apps → vs-expenses-tracker**. The app-private guarantee is the same — other apps still
need the `Files.ReadWrite.AppFolder` permission scoped to your client ID — but the user can browse
to the file if they want to inspect it.

### Will other users be able to use my app registration?

**Yes — that's the whole point.** An app registration in Entra ID (or in Google Cloud) is just a
**public identity** for your app. It is *not* tied to your personal OneDrive / Drive — it's a record
that says "an app named `vs-expenses-tracker` exists, here's its client ID, here's where it's allowed
to redirect after login, and here are the permissions it can ask for."

When another user installs your mobile app:

1. The app opens the system browser to Microsoft's (or Google's) login page, passing **your client
   ID** + the redirect URI `spendium://redirect` + the requested scopes.
2. The user signs in with **their own** Microsoft / Google account.
3. The provider shows a consent screen: *"vs-expenses-tracker wants to access files it creates in your
   OneDrive."*
4. After they consent, the provider redirects back to the app with an auth code.
5. The app exchanges the code (plus the PKCE verifier) for an access token + refresh token. The tokens
   belong to **that user**, scoped to **their** drive's app folder (`approot` / `appDataFolder`).
   Users cannot see each other's data, and you as the app owner have no access to anyone else's data
   either.

The **only thing shared** between users is the client ID — that's why it is safe to commit.

#### Who can sign in — the "Supported account types" setting

For Microsoft / Entra registrations specifically, **who** is allowed to sign in depends on the
**Supported account types** option you picked at registration time:

| Setting in Entra                                                  | Who can log in                                                                   | Tenant in `oneDriveAdapter.ts` |
|-------------------------------------------------------------------|----------------------------------------------------------------------------------|--------------------------------|
| **Personal Microsoft accounts only**                              | Only `@outlook.com`, `@hotmail.com`, `@live.com`, Xbox, etc. (NOT work / school) | `consumers`                    |
| **Accounts in any org directory and personal Microsoft accounts** | Anyone — personal + any company / school Microsoft 365 tenant                    | `common`                       |
| **Accounts in any organizational directory only**                 | Any work / school tenant, no personal accounts                                   | `organizations`                |
| **Accounts in this organizational directory only**                | Only users in *your* tenant — single-tenant app                                  | `<your-tenant-id>`             |

The default in the registration steps above is **Personal Microsoft accounts only** (matches
`consumers`). If you want users with only a work / school Microsoft account to sign in too, pick
**"Any org directory + personal"** and change the tenant constant in
[`src/sync/oneDriveAdapter.ts`](./src/sync/oneDriveAdapter.ts) from `consumers` to `common`.

#### "Unverified publisher" warning

Until you complete [Publisher
Verification](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview),
users other than you will see a yellow *"unverified app"* warning on the Microsoft consent screen.
It is not blocking — for personal use or small-scale testing it is harmless — but for a wider release
you would want to verify your publisher domain.

### How the `spendium://redirect` URI actually works

This is the part of OAuth that feels like magic until you see what is happening under the hood. The
short version: **Microsoft does not redirect to anything on the internet. It tells the device's OS to
open a URL with a custom scheme, and the OS routes that URL to your app.**

```
┌──────────────┐                                  ┌──────────────────┐
│  Mobile App  │ ── 1. open browser ────────────► │   System         │
│  (Expo)      │                                  │   Browser        │
└──────────────┘                                  └──────────────────┘
       ▲                                                   │
       │                                                   │ 2. user signs in
       │                                                   │    + consents
       │                                                   ▼
       │                                          ┌──────────────────┐
       │                                          │ login.microsoft  │
       │                                          │ online.com       │
       │                                          └──────────────────┘
       │                                                   │
       │                                                   │ 3. HTTP 302 Redirect:
       │                                                   │    Location: spendium://redirect?code=...
       │                                                   ▼
       │                                          ┌──────────────────┐
       │                                          │  Browser tries   │
       │                                          │  to open URL     │
       │                                          └──────────────────┘
       │                                                   │
       │                                                   │ 4. OS sees scheme
       │                                                   │    "spendium://"
       │                                                   │    and looks up
       │                                                   │    which app owns it
       │                                                   ▼
       │                                          ┌──────────────────┐
       └─── 5. OS hands URL to app ◄───────────── │   Android / iOS  │
                                                  │   scheme handler │
                                                  └──────────────────┘
```

Two pieces make this work:

#### 1. The app *claims* the scheme at install time

In [`app.json`](./app.json):

```json
{
  "expo": {
    "scheme": "spendium"
  }
}
```

When Expo / EAS builds the native binaries, this scheme is compiled into the platform manifests:

- **Android** — into `AndroidManifest.xml` as an `<intent-filter>`:
  ```xml
  <intent-filter>
    <action android:name="android.intent.action.VIEW"/>
    <category android:name="android.intent.category.DEFAULT"/>
    <category android:name="android.intent.category.BROWSABLE"/>
    <data android:scheme="spendium"/>
  </intent-filter>
  ```
- **iOS** — into `Info.plist` as a `CFBundleURLTypes` entry:
  ```xml
  <key>CFBundleURLSchemes</key>
  <array><string>spendium</string></array>
  ```

When the app is installed, the OS registers this claim in a system-wide *scheme → app* table.

#### 2. Microsoft *records* the redirect URI as a plain string

When you registered the app in Entra, you added `spendium://redirect` to the redirect URIs
list. Microsoft's auth server stores this string verbatim. During step 3 of the flow it just emits
an HTTP 302:

```
HTTP/1.1 302 Found
Location: spendium://redirect?code=ABC123&state=xyz
```

Microsoft has no idea what `spendium://` is. It does not "look up where your app lives" — it
just trusts that whoever registered the app knows what they are doing and emits the URL as-is.

#### The handoff

The browser receives the 302 and tries to navigate to `spendium://redirect?code=...`. Since
the scheme is not `http` / `https`, the browser asks the OS:

- **Android** fires `Intent.ACTION_VIEW`; the OS consults its scheme table and launches the app
  registered for `spendium`, passing the full URL as intent data.
- **iOS** invokes `application:openURL:options:` on the app registered for that scheme.

In React Native / Expo this surfaces as a `Linking` event. The
[`expo-auth-session`](https://docs.expo.dev/versions/latest/sdk/auth-session/) library (configured
via [`src/sync/oauthClient.ts`](./src/sync/oauthClient.ts)) subscribes to that event, parses the URL,
extracts `code` + `state`, and resolves the awaiting promise. The app then exchanges the code (plus
its PKCE verifier) for tokens and finishes the flow.

#### Why this is secure

You might wonder: *"What if a malicious app also claims `spendium://`?"* That is exactly why
**PKCE** is required for public clients.

- At the **start** of the flow, the app generates a random `code_verifier` and sends only its
  SHA-256 hash (`code_challenge`) to Microsoft.
- The `code_verifier` **never leaves the originating app's memory**.
- At the **end** of the flow, the app must present the original `code_verifier` to exchange the
  auth code for tokens.

A hostile app that intercepts the redirect URL gets the auth code but cannot compute the verifier
(SHA-256 is one-way), so the code is useless to it.

For even stronger guarantees you can switch to **Android App Links** / **iOS Universal Links** —
real `https://yourdomain.com/redirect` URLs that the OS verifies against `assetlinks.json` /
`apple-app-site-association` files hosted on your domain. That eliminates scheme hijacking entirely
but requires you to own a domain. Custom-scheme + PKCE is the standard pattern that both Microsoft
and Google explicitly recommend for native apps without their own backend.

#### Common failure modes (and what they confirm about the model)

| Symptom                                              | Likely cause                                                                           |
|------------------------------------------------------|----------------------------------------------------------------------------------------|
| Browser shows *"Can't open page — unknown protocol"* | App not installed, or `scheme` in `app.json` doesn't match what's registered           |
| Microsoft shows error `AADSTS50011`                  | The redirect URI string doesn't match the registration **exactly** (e.g. trailing `/`) |
| App opens but the auth promise never resolves        | `expo-auth-session` listener not wired up, or the app was killed during the flow       |
| Two apps both claim `spendium://`                    | OS shows an app picker (Android) or uses install order (iOS) — pick a unique scheme    |

### Are these Client IDs sensitive?

**No — Client IDs are public identifiers under the PKCE flow** and are safe to commit to a public Git
repository. They identify your app to the OAuth provider but cannot be used to obtain tokens on their
own (the per-flow code-verifier secret stays on the device). For comparison, the web frontend's Keycloak
public client ID (`expenses-frontend`) is committed to this repo for the same reason.

**Never commit any of these:**

- OAuth **client secrets** (PKCE removes the need for one — your registration must NOT have one)
- **Refresh tokens** or **access tokens** (the app stores them in `expo-secure-store`, i.e. iOS Keychain
  / Android Keystore — _never_ in `AsyncStorage` or in source)
- **Service-account JSON keys** (not used by this app at all)

If you accidentally leak a token, revoke it from the provider's console and rotate. If you leak a Client
ID, you do not need to rotate it — but you should still review the registration's permitted redirect
URIs.

---

## 📦 Mobile Note (`expo-sqlite`)

The mobile module uses **expo-sqlite** with `withTransactionAsync` blocks instead of Room. Batching the
projector's UPSERTs in a single transaction is already enough on mobile, because:

- the SQLite database is local (no network round trip per statement),
- a typical sync batch is small (≤ 100 events for a personal expense tracker),
- the `RemoteEventApplier` already runs the whole batch inside one `db.withTransactionAsync` call.

If profiling ever shows the per-statement loop is a bottleneck on a constrained device, the same
multi-row VALUES technique described in
[`expenses-tracker-api/README.md → Performance Optimization`](../expenses-tracker-api/README.md#-performance-optimization-batch-processing-recommended)
translates directly to expo-sqlite — but it has not been needed in practice.

---

## 💱 Historical-Rate Currency Conversion

Expenses are stored in their **original** currency (amount in cents + 3-letter code). At display
time they're converted to the user's `mainCurrency` so totals across periods, categories, and the
spending header all line up on one scale.

**The problem with a single live rate.** A naïve implementation converts every expense at *today's*
rate. Over a single month that's fine, but on a year- or multi-year overview the foreign-exchange
drift between, say, USD and EUR can silently distort totals by 5–15 %. A €500 grocery run in
January 2020 is not the same number of USD as it would be today.

**The fix.** Each expense is converted using the **monthly historical rate that applied during the
expense's month**. Rates are sourced from [Frankfurter](https://api.frankfurter.dev) (free,
key-less, ECB-backed) via its `group=month` time-series endpoint, then cached locally in SQLite so
the conversion works offline and never re-fetches the same month twice.

**The fallback.** When no historical rate is available — first run before sync, a currency
Frankfurter doesn't cover, or an expense with no date — conversion falls back to today's live rate
and the result is marked **`approx`**. The UI prefixes affected totals with `~` so the user can see
at a glance which numbers used an approximation:

- per-expense row, per-day / per-month section total, transactions grand total
- per-category row, categories grand total, donut-chart center label

The `approx` flag bubbles up by **OR**: any approximate contributor marks its aggregate approximate.

### Components

| File | Role |
|------|------|
| [`src/db/schema.ts`](./src/db/schema.ts) (migration v2) | Adds `exchange_rates(base, quote, period_start, rate, fetched_at)` SQLite table with `(base, quote, period_start)` primary key. `period_start` is `'YYYY-MM-01'` for a historical monthly rate or the sentinel `'LATEST'` for the live fallback. |
| [`src/db/exchangeRateStore.ts`](./src/db/exchangeRateStore.ts) | Functional store factory — `upsertRates`, `findHistoricalRates`, `findLatestRates`, `findCoveredMonths`, `findLatestFetchedAt`. Mirrors the [`sqliteLocalStore`](./src/db/sqliteLocalStore.ts) pattern. |
| [`src/api/exchangeRates.ts`](./src/api/exchangeRates.ts) | Pure-TS Frankfurter v2 client — `fetchLatestRates(base)` and `fetchMonthlySeries(base, from, quotes)`. No keys, no quota, no SDK. |
| [`src/domain/exchangeRates.ts`](./src/domain/exchangeRates.ts) | Pure-TS conversion logic — `monthKey(iso)` (UTC-stable bucketing), `convertAmount(...)` returning a `ConvertedAmount` (`{ amount, approx }`), plus the `ZERO_AMOUNT` / `addAmounts` / `sumAmounts` algebra that lets callers sum converted amounts as a single value object (the `approx` flag bubbles via OR). Vitest-covered. |
| [`src/hooks/useExchangeRatesSync.ts`](./src/hooks/useExchangeRatesSync.ts) | Background hook mounted once near the root of `app/_layout.tsx`. Computes missing `(currency, month)` tuples from the user's expenses and fetches them in **one** batched HTTP request. |
| [`src/hooks/useExchangeRates.ts`](./src/hooks/useExchangeRates.ts) | Read-side hook — `convert(amount, fromCurrency, date?) => { amount, approx }` and `useConvertedExpenses(expenses)` which threads the `approx` flag through each row. |

### Runtime flow

1. **Sync hook fires** when expenses load, `mainCurrency` changes, or new expenses arrive.
2. **Diff against cache.** For each non-main quote currency, compute which months are missing.
3. **One batched fetch** per cycle from `api.frankfurter.dev/v2/rates?base=…&from=…&quotes=…&group=month`.
   The earliest missing month becomes the `from` parameter; over-fetching a few months keeps the
   HTTP call count at exactly one.
4. **UPSERT** the response into `exchange_rates` inside a single SQLite transaction.
5. **Live fallback refresh** (gated to **once per 24 h**) updates the `'LATEST'` sentinel rows so
   conversion still works offline for currencies/months not in the historical set.
6. **Invalidate** the `['exchange-rates', mainCurrency]` TanStack Query key — only when rows were
   actually written, to avoid feedback loops.

### Non-obvious decisions

- **Rate storage is per-device.** Rates are *not* event-sourced, *not* synced through the cloud
  drive file, and *not* part of the backend's data model. Historical ECB rates are deterministic and
  freely available, so every device independently converges to the same cache. Keeping rates out of
  the event log keeps events lean and the sync surface untouched.
- **UTC month bucketing.** `monthKey()` uses UTC components (`getUTCMonth`, etc.) so an expense
  saved at 23:59 local on the last of the month doesn't jump to the next bucket on a phone whose
  timezone changed.
- **Strict `>` last-write-wins applies only to projection rows.** The exchange-rate cache uses a
  plain UPSERT — Frankfurter occasionally republishes corrected ECB rates and we want the newest
  server value to win without a timestamp comparison.
- **Why Frankfurter and not the other "free" APIs.** `exchangerate.host` moved to a paid tier;
  `openexchangerates.org` requires an API key and only allows USD as base on the free plan;
  `open.er-api.com` (used by the web frontend) has no historical endpoint. Frankfurter is the only
  free, key-less option with monthly historical rates back to 1999 via the ECB.

---

## ⚡ Rendering & Performance Notes

The module targets **mid-range Android** as its slowest realistic device and assumes a working dataset
in the low thousands of expenses (a couple of years of personal spending). Two surfaces dominate
perceived responsiveness: the **transactions list** (which can render hundreds of native views at
once) and the **cross-cutting providers** that fan out re-renders across every screen. The notes below
explain what the module does today on each of those surfaces and the constraint each piece addresses.

### Transactions list (the hot spot)

The list in [`app/(tabs)/transactions.tsx`](./app/%28tabs%29/transactions.tsx) groups expenses by
day / month / year depending on the active period preset. On a year preset with ~2k expenses, that
is typically twelve month-sections of ~150 rows each. The bottleneck on tap-to-expand / tap-to-collapse
is **native view mount and layout on the JS thread**, not JS work in the row render function. The
screen layers several techniques that all target that bottleneck:

- **`SectionList` with tight virtualisation windowing.** `windowSize={4}` keeps roughly one viewport
  of buffer above and below the visible area mounted (~40 native rows), instead of React Native's
  default of 10 (~100 rows). The cost of a collapse toggle scales roughly with the mounted-row count,
  so halving the window roughly halves the work. `maxToRenderPerBatch={4}` keeps incremental paint
  batches small enough to avoid stutter on subsequent frames, and `initialNumToRender={20}` keeps the
  cold-open paint generous so the first screenful arrives in a single pass.
- **`removeClippedSubviews` is intentionally not set.** On Android its default is already `true`, and
  forcing it explicitly is a known source of bugs interacting with the nested `TouchableRipple`
  handlers in section headers and rows. Leaving the prop unset uses the platform default and avoids
  the trap.
- **`React.memo` on hoisted `ExpenseRow` and `SectionHeaderView`.** Both components live at module
  scope (not inside the screen function) so their identities are stable across renders. The parent
  rebuilds its `sections` array on every collapse toggle, but the memoised children compare props
  via `Object.is` and bail out unless something they actually display changed.
- **Section-header props are primitives, not section objects.** Because the parent allocates a fresh
  section object on every render, passing `section.date` or `section.total` (a `ConvertedAmount`
  value object — see below) would force a new reference into the header every time and defeat
  memoisation. The header instead takes `dateMs: number`, `total: number`, `approx: boolean`,
  `collapsed: boolean`, language / theme primitives, etc., so the shallow compare succeeds for
  every section except the one the user actually tapped. (This is the **one** boundary in the screen
  where the `ConvertedAmount` value object is unboxed; everywhere else it flows as a unit.)
- **`useCallback` on `renderItem` / `renderSectionHeader` / press handlers.** Inline arrow functions
  would allocate a new closure every render, force `SectionList` to re-evaluate its row factories,
  and (worst of all) blow up the memo bailouts on individual rows. Stable callbacks paired with
  memoised children mean a parent re-render touches only the section that actually changed, not the
  whole visible list.
- **Section totals pre-computed in the `sections` `useMemo`.** Each header shows the section's total
  converted to the main currency. Doing the reduce here costs at most twelve reductions per filter
  change; doing it inside the header render would re-run it on every scroll-induced re-render.
- **`useTransition` around the collapse `setState`.** The toggle is marked as a **non-urgent** update,
  so React keeps the JS thread free for the `TouchableRipple` press-feedback animation while the
  heavy reconciliation — mounting or unmounting the section's rows — runs in the background. If the
  user taps another header before the previous transition commits, React discards the in-flight work,
  so rapid tapping cannot queue up multiple expensive reconciliations.

### Cross-cutting providers

Performance work on a single screen is wasted if a global context fans out re-renders to every
consumer on every state change.

- **[`PreferencesProvider`](./src/context/preferencesProvider.tsx) exposes a `useMemo`-wrapped value
  object.** Currency, date range, theme, and font-scale state all live in one provider. The context
  value is memoised on the full list of its fields so consumers that compare by reference (TanStack
  Query keys, downstream `useMemo`s, child providers) don't see a fresh `value` object on unrelated
  state changes. Without the memo, any setter from one of the sub-hooks would re-render every screen
  that consumes the context — including the transactions list mid-collapse.

### Categories screen

- **`active` and `slices` are memoised** in [`app/(tabs)/index.tsx`](./app/%28tabs%29/index.tsx).
  The donut chart's internal arc-geometry memo keys off slice identity. Rebuilding `slices` every
  render would invalidate that memo and force the underlying SVG to re-lay-out, which is by far the
  most expensive piece of the screen.

### Sync engine

- **Local-uncommitted reads run in parallel.**
  [`SyncEngine.runOneCycle()`](./src/sync/syncEngine.ts) issues `findUncommittedEvents()` and
  `findUncommittedCategoryEvents()` through `Promise.all`. Both are independent SQLite queries;
  serialising them costs one extra round-trip per sync cycle for no benefit. Sync cycles are off the
  render path, but they run on app foreground / network reconnect / after-write debounce, so a
  faster cycle is a faster perceived *"data is up to date"*.

### Other micro-wins

- **[`CurrencyPickerDialog`](./src/components/CurrencyPickerDialog.tsx) sorts the currency catalogue
  once at module scope** (`SORTED_CURRENCIES`). The dialog's typeahead filter scans this constant on
  every keystroke; re-sorting the ~180-element array per keystroke is invisible on desktop but
  visibly stutters the dialog on mid-range Android.
- **[`useCategorySummary`](./src/hooks/useCategorySummary.ts) populates its result map in a single
  pass** over the already-filtered expenses. Pre-seeding every catalogue category with `total: 0`
  would emit zero-value rows for categories the user didn't touch this period, forcing the UI to
  render and then filter them.

### Things deliberately *not* done

A few "obvious" optimisations were tested and rejected because measurement (or hard experience)
showed them to be worse than the baseline. They are documented here so they don't get re-introduced
by accident:

- **`@shopify/flash-list` for the transactions list.** True view recycling sounds appealing, but the
  recycler relies on fixed item heights to avoid layout reflow. Our rows vary by ±8 px because the
  converted-amount second line is conditional on `expense.currency !== mainCurrency`. The result was
  visible empty gaps as recycled cells rebind between heights. The SectionList path with the
  windowing + memo combination above stays smoother on the same dataset.
- **`getItemLayout` on `SectionList`.** Would let `SectionList` skip on-the-fly measurement of each
  row, but it requires exact, deterministic heights per flat index — including header heights that
  vary by `groupBy`. The variable-height rows would force an artificial uniform height (wasteful
  padding on most rows), and a single height mismatch corrupts the layout. Not worth it for the
  marginal scroll-only improvement.
- **Default-collapsing all sections except the most recent.** Trades a cold-start win for a per-tap
  penalty: each older section's first expand pays the full native-mount cost from empty, instead of
  the cheap re-toggle of an already-windowed section. That is the opposite of what users notice.
- **Pre-formatting every row's display strings upfront in a `useMemo` map.** Amortising the
  `Intl.NumberFormat` and category-lookup work across a 2k-row map costs ~100–300 ms of upfront work
  on every filter change and delays first paint by more than the per-row savings it returns. The
  memoised rows already keep this work negligible because shallow-compare bail-outs skip the work
  for rows that didn't change.

---

## 📄 Key Files

- **[`.github/instructions/expenses-tracker-mobile.instructions.md`](../.github/instructions/expenses-tracker-mobile.instructions.md)**
  — full coding conventions for this module (RN Paper v5, Expo Router, TanStack Query over local
  store, i18n, time injection, security).
- **[`src/sync/syncEngine.ts`](./src/sync/syncEngine.ts)** — the orchestration loop with
  retry-on-`ConcurrencyError`.
- **[`src/sync/oauthClient.ts`](./src/sync/oauthClient.ts)** — shared PKCE helper used by both Drive
  adapters; persists tokens via `expo-secure-store` and serializes refresh requests behind a single
  in-flight promise.
- **[`src/sync/autoSyncCoordinator.ts`](./src/sync/autoSyncCoordinator.ts)** — single source of truth
  for **all** automatic sync triggers (cold start, foreground, after-write debounce, app-background
  flush, network reconnect, manual button). Enforces in-flight de-duplication and 30 s throttle.
  The *network reconnect* trigger is fed by `@react-native-community/netinfo` (subscribed in
  [`src/context/useAutoSync.ts`](./src/context/useAutoSync.ts)) and fires on every offline → online
  edge — the first event after mount only establishes the baseline.
- **[`src/sync/autoSyncSignal.ts`](./src/sync/autoSyncSignal.ts)** — module-level `notifyLocalWrite()`
  used by mutation hooks to bump the after-write debounce.
- **[`src/components/SyncCloudDialog.tsx`](./src/components/SyncCloudDialog.tsx)** — the
  Settings → Cloud sync dialog (provider picker, "Sync now" button, auto-sync toggle, status footer
  with last-sync timestamp).
- **[`src/hooks/useExchangeRatesSync.ts`](./src/hooks/useExchangeRatesSync.ts)** — background hook
  that keeps the local `exchange_rates` cache covered for the months the user's expenses span.
  Mounted once in `app/_layout.tsx`. One batched HTTP call per cycle; 24 h freshness gate on the
  live fallback rate. See [Historical-Rate Currency Conversion](#-historical-rate-currency-conversion).
- **[`src/domain/exchangeRates.ts`](./src/domain/exchangeRates.ts)** — pure-TS conversion logic
  (`monthKey`, `convertAmount`) that picks the historical monthly rate for an expense's date and
  falls back to the live rate with an `approx=true` flag when no exact-month rate is available.

---

## 📚 Related Documentation

- [**Root README**](../README.md) — Project pitch, **Backend Architecture (Event Sourcing & CQRS)**,
  Configuration, Docker Compose runbook, CI/CD, References. (The cross-device sync engine is
  documented in **this** README — file format, snapshot model, throttling, idempotency, OAuth wiring.)
- [**Backend README**](../expenses-tracker-api/README.md) — REST API, event-sourced backend.
  The mobile app does **not** depend on this and the backend has no sync subsystem — they are two
  independent surfaces.
- [**Frontend README**](../expenses-tracker-frontend/README.md) — Web client (online-only).
- [**`.github/instructions/expenses-tracker-mobile.instructions.md`**](../.github/instructions/expenses-tracker-mobile.instructions.md)
  — Path-scoped Copilot rules for this module.
- [**`AGENTS.md`**](../AGENTS.md) — Agent-targeted quick-reference for all modules.
