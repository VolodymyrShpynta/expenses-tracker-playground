# GDPR Posture — Engineering Notes

> ⚠️ **This document is engineering documentation, not legal advice.**
> It describes what the code in this repository does (and does not do) with respect
> to GDPR-relevant data handling. It is intended for developers and reviewers of the
> codebase, not for end-users, data subjects, or regulators. Anyone operating a real
> deployment of this software is solely responsible for verifying compliance with
> qualified legal counsel before relying on any statement made here.
>
> The project is a **personal / playground codebase**. Several requirements that a
> production multi-tenant SaaS would have to satisfy are deliberately deferred — they
> are listed honestly below as ❌ rather than glossed over.

---

## 📑 Table of Contents

- [GDPR Posture — Engineering Notes](#gdpr-posture--engineering-notes)
  - [📑 Table of Contents](#-table-of-contents)
  - [Scope of This Document](#scope-of-this-document)
  - [Roles and Data Flows per Module](#roles-and-data-flows-per-module)
    - [Backend (`expenses-tracker-api`)](#backend-expenses-tracker-api)
    - [Web app (`expenses-tracker-frontend`)](#web-app-expenses-tracker-frontend)
    - [Mobile app (`expenses-tracker-mobile`)](#mobile-app-expenses-tracker-mobile)
  - [Data Inventory — Personal Data Touched by the Code](#data-inventory--personal-data-touched-by-the-code)
  - [Data-Subject Rights × Module Matrix](#data-subject-rights--module-matrix)
  - [Processing Principles (Art. 5) × Module Matrix](#processing-principles-art-5--module-matrix)
  - [Security of Processing (Art. 32)](#security-of-processing-art-32)
  - [Article 17 — Implementation Guide for the Erasure Gap](#article-17--implementation-guide-for-the-erasure-gap)
    - [Option A — Hard delete by `user_id` (simplest)](#option-a--hard-delete-by-user_id-simplest)
    - [Option B — Tombstone-by-replay (redact, don't delete)](#option-b--tombstone-by-replay-redact-dont-delete)
    - [Option C — Crypto-shredding](#option-c--crypto-shredding)
    - [What none of these address (don't forget)](#what-none-of-these-address-dont-forget)
    - [Article 17 — Endpoint Shape](#article-17--endpoint-shape)
  - [Retention Triggers — Inactive Accounts](#retention-triggers--inactive-accounts)
  - [What Lives Outside This Repo (Organisational)](#what-lives-outside-this-repo-organisational)
  - [Related Documentation](#related-documentation)

---

## Scope of This Document

**In scope** — anything that touches personal data and is expressed in code or
configuration in this repository:

- Storage shape (tables, columns, files), endpoints, client-side persistence.
- Data-subject rights that can be satisfied or blocked by code: Articles 15, 16, 17,
  18, 20, 21, 22.
- Processing principles from Art. 5 that the code visibly affects: lawfulness, purpose
  limitation, data minimisation, accuracy, storage limitation, integrity &
  confidentiality, accountability.
- Security-of-processing items from Art. 32 that are codebase concerns (encryption in
  transit / at rest, authentication, audit trails).

**Out of scope** — these matter for any real deployment but are organisational, not
codebase, concerns. They are mentioned once at the bottom and otherwise not tracked
here:

- Lawful basis selection and consent capture mechanics (Art. 6 / 7).
- Records of processing (Art. 30) and DPIAs (Art. 35).
- Data Processing Agreements with hosting / Keycloak / cloud-drive providers
  (Art. 28).
- Breach notification process (Art. 33 / 34).
- DPO appointment (Art. 37).
- Cross-border transfer mechanisms (Chapter V).

---

## Roles and Data Flows per Module

The three modules sit in **different positions in the GDPR role taxonomy**. This is
not cosmetic — it changes who the controller / processor is and where Article 17
obligations land.

### Backend (`expenses-tracker-api`)

- **Hosts**: PostgreSQL tables `expense_events`, `expense_projections`, `categories`.
  See [V1__Initial_schema.sql](expenses-tracker-api/src/main/resources/db/migration/V1__Initial_schema.sql).
- **Role of the operator** (whoever runs the deployment): **data controller** in a
  single-user self-host, or **data controller for their tenants** (and processor on
  their behalf) in any multi-tenant arrangement.
- **Subject identification**: every user-scoped row carries `user_id`, which is the
  Keycloak `sub` claim — a stable opaque identifier, not an email or name. Indexes on
  `user_id` exist on all three user-scoped tables, so per-subject queries and
  per-subject deletes are O(log n).

### Web app (`expenses-tracker-frontend`)

- **Persists almost nothing personal client-side.** Only two values, both keyed by
  user id and both UI preferences:
  - `expenses-tracker-main-currency:<userId>` — preferred display currency
    ([useCurrency.ts](expenses-tracker-frontend/src/hooks/useCurrency.ts)).
  - `expenses-tracker-period-preset:<userId>` — preferred dashboard period
    ([useDateRange.ts](expenses-tracker-frontend/src/hooks/useDateRange.ts)).
- **JWT in memory only.** `keycloak-js` keeps the access token and refresh token in
  JavaScript memory and runs silent refresh in an iframe. The web app does **not**
  put JWTs in `localStorage` / `sessionStorage` / cookies. Closing the tab discards
  them.
- **Logout** is delegated to Keycloak (`keycloak.logout({...})` in
  [AuthContext.tsx](expenses-tracker-frontend/src/context/AuthContext.tsx#L79)), which
  also ends the SSO session at the identity provider.
- **Role of the operator**: same as the backend — the web app is a thin client of the
  backend.

### Mobile app (`expenses-tracker-mobile`)

This is the role-taxonomy interesting one and deserves a careful read.

- **Local store**: `expo-sqlite` database on the device. The **user** is in physical
  possession of this data; the app operator does not have access to it. The app
  operator is a **processor** on the user's device, but the user controls the device.
- **Cloud-drive sync**: when enabled, the app reads/writes a single sync file in
  **the user's own Google Drive or OneDrive**, using the app-restricted folder space
  (`appDataFolder` on Google Drive,
  [googleDriveAdapter.ts](expenses-tracker-mobile/src/sync/googleDriveAdapter.ts#L113);
  `approot` on OneDrive,
  [oneDriveAdapter.ts](expenses-tracker-mobile/src/sync/oneDriveAdapter.ts#L49)).
- **Crucial role distinction**: the **user** is the data controller for the data in
  their cloud drive. **Google / Microsoft is the user's sub-processor**, not the app
  operator's. The app operator never sees the sync file, never holds its credentials,
  and cannot enumerate or delete it. The OAuth tokens that authorise drive access
  live on the device in **`expo-secure-store`** (Expo's hardware-backed keystore),
  not in `AsyncStorage` — see
  [oauthClient.ts](expenses-tracker-mobile/src/sync/oauthClient.ts#L100).
- **No backend involvement in sync.** The mobile app does not talk to
  `expenses-tracker-api` at all; backend deletes and mobile deletes are not coupled.
- **Preferences in `AsyncStorage`** (currency, theme, font scale, sync-provider
  choice, last-synced timestamp) — none of which is personal data in the GDPR sense
  on their own.

---

## Data Inventory — Personal Data Touched by the Code

| Field                                       | Module(s)             | Where it lives                                                                                            | Why it's personal data                                                       |
|---------------------------------------------|-----------------------|-----------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------|
| `user_id` (Keycloak `sub`, opaque UUID)     | Backend, Web, Mobile  | `expense_events.user_id`, `expense_projections.user_id`, `categories.user_id`; key suffix in browser/AsyncStorage | Stable identifier linking all rows to one natural person.                    |
| Expense `description`                       | Backend, Mobile       | `expense_events.payload` (JSON), `expense_projections.description`, local sqlite                          | Free-text — may name people, places, merchants, life events.                 |
| Expense `amount` + `currency` + `date`      | Backend, Mobile       | `expense_projections.amount` / `currency` / `date`, `expense_events.payload`, local sqlite                | Financial profile when correlated over time.                                 |
| Expense `category_id` (+ user category name) | Backend, Mobile       | `expense_projections.category_id`, `categories.name`, local sqlite                                        | Categorisation of spending — sensitive when combined (e.g. medical).         |
| Display name / email / Keycloak attributes  | None (in this repo)   | Keycloak only — **never** persisted in this codebase                                                      | Out of scope here; lives with the identity provider.                         |
| OAuth refresh / access tokens (Google / MS) | Mobile only           | `expo-secure-store` (hardware-backed)                                                                     | Capability tokens — not directly personal data but enable access to it.      |
| UI preferences (currency, period, theme)    | Web, Mobile           | `localStorage` (web), `AsyncStorage` (mobile)                                                             | Not personal data on their own; only flagged here for completeness.          |

**What is *not* in the inventory** (and shouldn't be without a design discussion):
IP addresses, request logs with PII, device identifiers, location, profiling output,
analytics events.

---

## Data-Subject Rights × Module Matrix

Legend: ✅ implemented and verifiable in code · ⚠️ partial / caveated · ❌ not
implemented · n/a not applicable to this codebase.

| Right (GDPR article)                                | Backend                                                                                                 | Web app                                                                                                 | Mobile app                                                                                              |
|-----------------------------------------------------|---------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| **Art. 15 — Right of access**                       | ✅ `GET /api/data/export` returns the full JSON snapshot (events + projections) for the authenticated user. See [DataExchangeController.kt](expenses-tracker-api/src/main/kotlin/com/vshpynta/expenses/api/controller/DataExchangeController.kt). | ✅ Exposes the export action in the UI; data is fetched from the backend endpoint above.                | ✅ Local sqlite is on-device and the user can already see all their data; sync file in the user's own drive is plain JSON the user can read.                                       |
| **Art. 16 — Right to rectification**                | ✅ `PUT /api/expenses/{id}` and `PUT /api/categories/{id}` write new events that supersede earlier ones via LWW. | ✅ Edit dialogs in the UI cover every editable field.                                                   | ✅ Same on-device — edits become local events; sync propagates them via LWW.                            |
| **Art. 17 — Right to erasure**                      | ❌ **Not implemented.** No user-callable `DELETE /api/users/me` endpoint and no admin-side equivalent. See [implementation options](#article-17--implementation-guide-for-the-erasure-gap) and the [endpoint shape](#article-17--endpoint-shape) below. *(Per-expense soft-delete keeps the original `CREATED` / `UPDATED` event payloads as the user's own audit trail — that is a deliberate event-sourcing design choice and separate from user-account erasure.)* | ❌ No "delete my account" button. (Closing the Keycloak account doesn't cascade.)                       | ⚠️ User can wipe local sqlite by uninstalling the app; user can delete the sync file in their drive themselves. No app-driven flow.            |
| **Art. 18 — Right to restriction of processing**    | ❌ No mechanism. Would require an `active`/`restricted` flag on `user_id` and a guard in query / command services. | n/a — UI only.                                                                                          | n/a — local app.                                                                                        |
| **Art. 20 — Right to data portability**             | ✅ JSON export is lossless and machine-readable; CSV-in-ZIP is also available for spreadsheet interop. Same endpoint as Art. 15. | ✅ Triggers the backend export.                                                                         | ✅ The sync file *is* the portable artefact — JSON in a drive folder the user owns.                     |
| **Art. 21 — Right to object**                       | n/a — no marketing, no profiling, no automated processing for legitimate-interest purposes.             | n/a                                                                                                     | n/a                                                                                                     |
| **Art. 22 — Automated individual decision-making**  | n/a — no automated decisions, no profiling, no scoring.                                                 | n/a                                                                                                     | n/a                                                                                                     |
| **Art. 7(3) — Withdraw consent**                    | Tied to Art. 17 above — withdrawing in Keycloak does not currently cascade.                             | n/a                                                                                                     | The user revokes the OAuth grant in their Google / Microsoft account settings; the app stops being able to access the drive.    |

---

## Processing Principles (Art. 5) × Module Matrix

| Principle                                              | Backend                                                                                                       | Web app                                                                | Mobile app                                                                                              |
|--------------------------------------------------------|---------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| **(a) Lawfulness, fairness, transparency**             | n/a — organisational (lawful basis must be declared by the deployment operator).                              | n/a                                                                    | n/a                                                                                                     |
| **(b) Purpose limitation**                             | ✅ Data is only ever read back to the user that wrote it (every query is scoped by `user_id`).                | ✅ Only displays the authenticated user's own data.                    | ✅ Local + the user's own drive — no cross-user processing exists.                                      |
| **(c) Data minimisation**                              | ✅ Only the columns enumerated above; no IP / UA / analytics events persisted.                                | ✅ No persisted PII beyond UI preferences.                             | ✅ Same fields as backend; no telemetry.                                                                |
| **(d) Accuracy**                                       | ✅ The user owns their data and can edit it directly (Art. 16 row above).                                     | ✅ Edit affordances cover every field.                                 | ✅ Same.                                                                                                |
| **(e) Storage limitation**                             | ⚠️ Retention is **purpose-bound, not time-bound**. While the user keeps using the service, the declared purpose ("let the user see their own spending history") still applies — retaining the full event log forever is consistent with Art. 5(e). The only retention triggers needed are: (1) **erasure on request** — see Art. 17 row; (2) **account inactivity policy** — ❌ not implemented (see [Retention Triggers — Inactive Accounts](#retention-triggers--inactive-accounts) for the planned design); (3) **backup ageing** — operational, see [What Lives Outside This Repo](#what-lives-outside-this-repo-organisational). Keeping the original `CREATED` / `UPDATED` payloads of an expense after the user soft-deletes it is a **deliberate event-sourcing design choice** — it preserves the user's own audit trail of their corrections and is not a retention problem. | n/a — nothing persisted that has a meaningful retention window.        | ⚠️ The sync file grows unbounded in the user's drive; periodic snapshot compaction exists on mobile but is correctness-driven, not retention-driven. |
| **(f) Integrity & confidentiality**                    | ⚠️ JWT-protected in transit; **no application-level encryption at rest** — relies on disk-level encryption of the PostgreSQL volume. See [Security of Processing](#security-of-processing-art-32). | ✅ HTTPS in transit; JWT in memory only.                               | ⚠️ Local sqlite is **not** encrypted at rest — relies on the OS sandbox + device lock. OAuth tokens **are** in `expo-secure-store`. Sync file in cloud drive is plain JSON. |
| **(g) Accountability**                                 | ⚠️ The event log gives a per-user audit trail of data changes. There is **no admin-action audit log** (e.g. who logged into the DB and ran what). | n/a                                                                    | n/a — single-user device.                                                                               |

---

## Security of Processing (Art. 32)

| Control                                            | Status | Notes                                                                                                                                       |
|----------------------------------------------------|--------|---------------------------------------------------------------------------------------------------------------------------------------------|
| Authentication of API consumers                    | ✅     | Spring Security OAuth2 Resource Server validates Keycloak-issued JWTs via JWK Set URI on every request.                                     |
| Transport encryption (HTTPS / TLS)                 | ⚠️    | Application code is HTTP-only — TLS must be terminated by the reverse proxy / load balancer in front of the API. Verify in your deployment. |
| Application-level encryption at rest (backend)     | ❌     | `expense_events.payload` and projection columns are plaintext in PostgreSQL. Disk-level / volume-level encryption is the operator's job.   |
| Application-level encryption at rest (mobile)      | ❌     | `expo-sqlite` is not encrypted in this codebase. Protected by the OS app sandbox + device lock screen only.                                 |
| OAuth token storage (mobile)                       | ✅     | Stored in `expo-secure-store` (Android Keystore / iOS Keychain) by [oauthClient.ts](expenses-tracker-mobile/src/sync/oauthClient.ts#L100). |
| JWT storage (web)                                  | ✅     | In-memory only, managed by `keycloak-js`. Not in `localStorage` / `sessionStorage` / cookies.                                               |
| CORS allow-list                                    | ✅     | Driven by `CORS_ALLOWED_ORIGINS`; not `*`.                                                                                                  |
| Per-user authorisation enforcement (row-level)     | ✅     | Every backend query is scoped by `user_id` derived from the JWT `sub` claim (`UserContextService` + repository methods).                    |
| Admin-action audit log                             | ❌     | No structured audit of DB admin access, deploy events, or impersonation. Operational concern.                                               |
| Backup & restore procedure                         | n/a    | Operational — not in this repo.                                                                                                             |

---

## Article 17 — Implementation Guide for the Erasure Gap

When (or if) erasure becomes a real requirement, here are the three viable approaches
on this backend, in increasing order of effort and decreasing order of historical
detail preserved. **Pick one and document the choice — do not mix.**

### Option A — Hard delete by `user_id` (simplest)

```sql
-- All three tables are already indexed on user_id.
DELETE FROM expense_events     WHERE user_id = :userId;
DELETE FROM expense_projections WHERE user_id = :userId;
DELETE FROM categories          WHERE user_id = :userId;
```

- **Cost**: ~50 LOC for two thin endpoints sharing one `GdprErasureService` (see
  [Article 17 — Endpoint Shape](#article-17--endpoint-shape) below) + a tombstone
  row in a new `gdpr_erasure_log` table (so you can prove erasure happened without
  keeping the erased data — store a hash of the erased `user_id`, not the id
  itself).
- **Trade-off**: this is a **scoped exception to** the "events are eternal"
  convention, applied only at the user-erasure boundary. Event sourcing requires
  events to be append-only *during normal operation*, not literally indestructible.
  Inside an Art. 17 erasure, hard-deleting that user's rows is correct; **outside**
  it, the per-event history (including the original payloads of soft-deleted
  expenses) stays — that is the user's own audit trail of their corrections, and
  keeping it is a deliberate part of the design, not a retention oversight (see the
  Art. 5(e) row above).
- **What you lose**: nothing analytically useful, because aggregate analytics are
  not implemented today.
- **Recommendation**: this is the right starting point for this codebase.

### Option B — Tombstone-by-replay (redact, don't delete)

For each event belonging to the erased user, replace `payload` with a redacted
sentinel JSON (`{"redacted": true}`) and null out `description` /
`category_id` / `amount` on the projection. Keep `user_id` and timestamps so that
event counts and causal ordering remain accurate for analytics.

- **Cost**: one admin endpoint + a careful migration; need to ensure the redaction
  is irreversible (no backup of the payload column).
- **Trade-off**: preserves the event log shape for analytics / debugging but adds
  complexity.
- **Use when**: aggregate analytics on event counts genuinely matter and Option A
  would distort them.

### Option C — Crypto-shredding

Encrypt event payloads with a per-user data key kept in a KMS. Erase by destroying
the key. Decrypted reads happen transparently in the service layer.

- **Cost**: significant. New KMS dependency, payload encryption on every write,
  decryption on every projection rebuild, key-rotation story, key-backup story.
- **Use when**: erasure requests are frequent enough that physical DELETE becomes
  operationally painful (think: thousands per week) **and** you need O(1) erasure
  across multiple data stores at once.
- **Not recommended** for this codebase until it stops being a playground.

### What none of these address (don't forget)

- **The Keycloak account itself.** Erasure must cascade to deleting the user in
  Keycloak (and any sessions). That is a Keycloak Admin API call, not a backend
  change.
- **The mobile sync file**, if the user is also using the mobile app. The backend
  cannot reach it — the user has to delete it themselves from their drive. The
  Art. 17 flow must instruct them to do so.
- **The web app's `localStorage` preferences**, which are keyed by `user_id` and
  will linger until the browser clears them. Negligible but worth noting.
- **Backups.** If you run scheduled DB backups, erasure must either age out via
  retention or be applied to the backups too. This is the most commonly forgotten
  piece of any Art. 17 implementation.

### Article 17 — Endpoint Shape

GDPR puts the right of erasure with the **data subject**, so the primary endpoint is
user-callable with the **same JWT auth as every other endpoint** — no special admin
role is needed for the normal path. An admin-side equivalent exists only as a
secondary path for genuine edge cases.

| Endpoint                                       | Caller                                | Authorisation                                                              | Purpose                                                                                                                                                                                                                                  |
|------------------------------------------------|----------------------------------------|----------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `DELETE /api/users/me`                         | The data subject (normal user)        | Standard JWT — **same as `POST /api/expenses`**, no special role.        | Primary path. Must require **fresh re-authentication** (reject if JWT `auth_time` is more than ~5 min old) so an accidentally-shared session can't trigger deletion. UI must show an explicit confirmation step.                         |
| `POST /api/admin/users/{userId}/erase`         | Operator handling out-of-band tickets | `gdpr-admin` realm role                                                    | Secondary path. Only for cases the user can't self-serve: account locked out, identity verified via other means, court order, etc. Writes the same audit row plus the admin's identity as `actor`.                                       |

Both endpoints go through the same `GdprErasureService.eraseUser(userId)` method so
the deletion logic and audit row live in one place. The user endpoint additionally
triggers the Keycloak Admin API call to delete the Keycloak account itself —
without that cascade the user is "deleted" in the app but can log back in and find
an empty account, which is both confusing and a partial Art. 17 failure.

---

## Retention Triggers — Inactive Accounts

This is the one retention lever that does meaningfully apply to a personal expense
tracker. While a user keeps using the service, the declared purpose still applies and
retaining their data forever is consistent with Art. 5(e). When a user stops using
the service, the purpose no longer applies and the data should be erased.

**Planned policy** (numbers are policy choices, not law — documented here so the
implementation has a definite target):

- **Inactive** = no successful login for **3 years**.
- At the 3-year threshold: send a **warning email** — "your account will be erased
  in 90 days unless you log in."
- At 3 years + 90 days with no further login: reuse the same
  `GdprErasureService.eraseUser(userId)` pipeline as the user-initiated path.
- Document the timeline in the privacy notice (organisational, see
  [What Lives Outside This Repo](#what-lives-outside-this-repo-organisational)).

**Status:** ❌ not implemented.

**TODO — implementation outline:**

- [ ] Scheduled job (e.g. `@Scheduled` in the backend or an external cron) that
      queries Keycloak for users whose `lastLogin` is older than the threshold.
- [ ] Send a warning email via a transactional-mail provider — **requires the
      Keycloak account to carry a verified email address** (currently optional;
      revisit during implementation).
- [ ] Persist the warning timestamp so the 90-day grace window is enforceable and
      repeated warnings aren't sent.
- [ ] At threshold + 90 days, call `GdprErasureService.eraseUser(userId)` — same
      pipeline as the user-initiated path.
- [ ] Update this section's status from ❌ to ✅ and link to the implementation.

---

## What Lives Outside This Repo (Organisational)

These are GDPR-relevant obligations that **cannot be discharged by code in this
repository** and must be handled by whoever operates a deployment. They are listed
once here, deliberately without status markers, because their status depends entirely
on the deployment context.

- Selection and documentation of **lawful basis** (Art. 6) — almost certainly
  "performance of a contract" or "consent", documented in a privacy notice.
- A **privacy notice** delivered to the data subject *before* collection (Art. 13).
- **Records of processing activities** (Art. 30).
- **Data Processing Agreements** with:
  - The hosting provider running PostgreSQL / the API.
  - The Keycloak operator (or your own Keycloak deployment provider).
  - Note: Google / Microsoft cloud-drive providers are sub-processors of the
    **mobile user**, not of the app operator, so a DPA there is not the operator's
    responsibility.
- **Breach notification** process (Art. 33 / 34) with the supervisory authority and
  affected data subjects.
- **DPIA** (Art. 35) if the deployment is high-risk (unlikely for a personal expense
  tracker, but the operator must make the determination).
- **DPO appointment** (Art. 37) — usually not required for this kind of service but
  is a legal determination.
- **Transfer mechanisms** (Chapter V) if data leaves the EEA — e.g. choosing an EU
  region for the PostgreSQL host.

---

## Related Documentation

- [**Root README**](README.md) — Project pitch and high-level architecture.
- [**Backend README**](expenses-tracker-api/README.md) — backend architecture,
  database schema, scaling notes (the storage-related rows of which now cross-link
  back to this document for the GDPR side of the story).
- [**Frontend README**](expenses-tracker-frontend/README.md) — auth + logout flow.
- [**Mobile README**](expenses-tracker-mobile/README.md) — sync engine, cloud-drive
  provider model, OAuth token storage.
- [**AGENTS.md**](AGENTS.md) — agent-targeted quick reference; lists this document
  as the canonical source for data-handling rules.
