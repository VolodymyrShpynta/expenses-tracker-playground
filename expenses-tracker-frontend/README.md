# Expenses Tracker — Web Frontend

A **React 19 + TypeScript + MUI v7** single-page application that consumes the backend REST API and
authenticates against Keycloak with the OAuth 2.0 PKCE flow.

> **Where this module fits.** The web frontend is a thin online client against
> [`expenses-tracker-api`](../expenses-tracker-api/README.md). Cloud-drive sync (Google Drive
> `appDataFolder` / OneDrive `approot`) is a mobile-only feature — see
> [`expenses-tracker-mobile/README.md`](../expenses-tracker-mobile/README.md). The web frontend
> intentionally does **not** expose a "sync now" trigger. For the cross-cutting sync architecture and
> event-sourcing model that the backend implements, see the [root README](../README.md).

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Running the Frontend](#-running-the-frontend)
    - [Dev Server](#dev-server)
    - [Production Build](#production-build)
- [API Proxy](#-api-proxy)
- [Authentication Flow](#-authentication-flow)
- [Troubleshooting](#-troubleshooting)
- [Related Documentation](#-related-documentation)

---

## 🎯 Overview

The frontend is a **single-page application** that:

- Renders all UI in the browser (`React 19` + `MUI v7` Material Design components).
- Authenticates users against **Keycloak** using PKCE (no client secret).
- Fetches data from the backend REST API at `/api/*` with a JWT Bearer token attached automatically.
- Refreshes tokens transparently and signs the user out when refresh fails.
- Caches server state via TanStack Query (`@tanstack/react-query`) — no hand-rolled `useState`/`useEffect`
  fetching.
- Persists per-user preferences (currency, date range, theme) in `localStorage` namespaced by `userId`.

In Docker, the SPA is served by **nginx** which also reverse-proxies `/api/*` to the backend and `/auth/*`
to Keycloak. In dev mode, **Vite** serves the SPA on `http://localhost:3000` and proxies the same paths
itself (see [API Proxy](#-api-proxy)).

---

## ✨ Features

- **Keycloak login** — PKCE authentication flow, auto token refresh, logout
- **Dark / Light theme** — persisted in `localStorage`, toggle via the sun/moon icon in the app bar
- **Responsive layout** — bottom navigation + hamburger menu on mobile; permanent sidebar on desktop
- **Categories screen** — category grid with colored icons, amounts, and a donut chart of total expenses
- **Transactions screen** — chronological list of all expenses with category chips
- **Add/Edit Expense** — dialogs with category selector, calculator-style money input, and date picker
- **Category management** — user-configurable categories with custom icons and colors
- **Multi-currency** — per-user currency preference with exchange rate conversion
- **Per-user preferences** — currency and date range stored in `localStorage` namespaced by userId

---

## 🛠 Tech Stack

- **React 19** — UI library
- **TypeScript** — Type-safe JavaScript (strict mode)
- **MUI (Material UI) v7** — Component library (modern `slots` / `slotProps` API only)
- **Vite 8** — Build tool and dev server
- **React Router DOM v7** — Client-side routing
- **TanStack Query** (`@tanstack/react-query`) — Server state management
- **keycloak-js** — Keycloak JavaScript adapter (PKCE flow)
- **@mui/x-charts** — Charting (donut/pie charts for category breakdown)
- **i18next** + **react-i18next** — Localization (English, Czech, Ukrainian)
- **ESLint** — Linting (strict config including `react-hooks/refs`)
- **Vitest** — Unit and integration tests

---

## 🏗 Architecture

```
expenses-tracker-frontend/src/
├── main.tsx            # Entry (AuthProvider, QueryClientProvider, BrowserRouter)
├── App.tsx             # Routes + ThemeProvider + ColorMode context
├── theme.ts            # MUI dark/light theme (ColorModeToggleContext)
├── config/             # Keycloak config + AuthContext (provider, userId, logout)
├── api/                # Typed fetch wrappers (all REST endpoints, authenticated)
├── components/         # Shared UI: Layout, MoneyField, DonutChart, …
├── hooks/              # useExpenses, useCategories, useCurrency, useDateRange, …
├── pages/              # CategoriesPage, TransactionsPage, OverviewPage
├── types/              # Expense & Category interfaces (mirrors backend DTOs)
└── utils/              # formatCurrency, categoryConfig, dateRange
```

Data flow follows the same two-layer pattern as the mobile app:

| Layer                      | Location                                     | Role                                              |
|----------------------------|----------------------------------------------|---------------------------------------------------|
| **Typed `fetch` wrappers** | `src/api/expenses.ts`, `src/api/categories.ts` | Async functions that hit `/api/*` with auth.    |
| **Query/Mutation hooks**   | `src/hooks/useExpenses.ts`, `src/hooks/useExpenseMutations.ts` | Wrap with `useQuery` / `useMutation`. |

Components only import from `src/hooks/` — never from `src/api/` directly. Mutations always invalidate the
relevant query keys (`['expenses']`, `['categories']`) `onSuccess`.

Path-scoped Copilot rules for this module live in
[`.github/instructions/expenses-tracker-frontend.instructions.md`](../.github/instructions/expenses-tracker-frontend.instructions.md).

---

## 🚀 Running the Frontend

### Dev Server

In a separate terminal (the backend must be running on `localhost:8080` — see
[`expenses-tracker-api/README.md`](../expenses-tracker-api/README.md)):

```bash
cd expenses-tracker-frontend
npm install      # First run only
npm run dev      # Vite dev server on port 3000 (proxies /api → localhost:8080)
```

The frontend dev server starts on **http://localhost:3000** and proxies API requests to the backend at
`localhost:8080`. Open **http://localhost:3000** in your browser.

### Other Commands

```bash
cd expenses-tracker-frontend

npm run build    # TypeScript + Vite production build → dist/
npm run lint     # ESLint
npm run preview  # Preview production build locally
npm test         # Run Vitest unit tests
```

### Production Build

```bash
# Via Gradle (recommended — same as CI)
./gradlew :expenses-tracker-frontend:build

# Or via npm directly
cd expenses-tracker-frontend
npm run build    # TypeScript check + Vite production build
npm run preview  # Preview the production build locally
```

The production bundle is output to `expenses-tracker-frontend/dist/`.

To run the production build inside Docker alongside the backend and Keycloak, see the
[Docker Compose runbook in the root README](../README.md#-getting-started).

---

## 🔀 API Proxy

During development, Vite proxies `/api/*` requests to `http://localhost:8080` (backend) and `/auth/*` requests
to `http://localhost:8180` (Keycloak) — both configured in `vite.config.ts`. This mirrors the nginx proxy
setup in Docker Compose, so the browser always uses `localhost:3000` as the origin in both modes. **No CORS
setup is needed.**

All API calls go through `src/api/fetchWithAuth.ts` which automatically attaches the Keycloak JWT Bearer
token and refreshes it when expired.

---

## 🔐 Authentication Flow

The frontend uses **keycloak-js** with the PKCE flow:

1. On app boot, `AuthProvider` calls `keycloak.init({ onLoad: 'check-sso', pkceMethod: 'S256' })`.
2. If the user is not authenticated, the SPA redirects to Keycloak's login page.
3. After successful login, Keycloak redirects back with an authorization code.
4. `keycloak-js` exchanges the code for access/refresh tokens (no client secret — PKCE).
5. `fetchWithAuth` attaches `Authorization: Bearer <access_token>` to every API call.
6. Tokens are refreshed automatically via `keycloak.updateToken()` before each API call (if expiring soon).

> **React StrictMode caveat.** `keycloak.init()` may only be called once per page load.
> StrictMode unmounts/remounts components in dev which would call `init()` twice. The fix is to guard with
> `useRef(false)` — do **not** use `keycloak.authenticated !== undefined` as a guard, because `init()` is
> async and the field is still `undefined` on remount.

For the full Keycloak setup (realm import, client config, environment variables) and the end-to-end PKCE
sequence diagram, see the [Communication Flow section in the root README](../README.md#-communication-flow).

> **Where tokens live and what the web app persists.** The web app keeps the access / refresh
> tokens in memory only (managed by `keycloak-js`), never in `localStorage` / `sessionStorage` /
> cookies. The only client-side persistence is two UI preferences keyed by user id
> (`expenses-tracker-main-currency:<userId>`, `expenses-tracker-period-preset:<userId>`). For the
> full data-handling posture across all modules, see [`GDPR.md`](../GDPR.md) at the repo root.

---

## 🔍 Troubleshooting

### Docker Build Fails with `npm ci` Error

If `docker compose up -d --build` fails with:

```
npm error `npm ci` can only install packages when your package.json and package-lock.json are in sync.
```

This happens when the npm version in the Docker image differs from your local npm version, causing the
lock-file format to be incompatible. The Dockerfile pins `node:24.13.0-alpine` to prevent this. If
versions drift:

1. Check your local Node version: `node --version`
2. Update the `FROM` line in `expenses-tracker-frontend/Dockerfile` to match
3. Regenerate the lock file:

```bash
cd expenses-tracker-frontend
npm install
```

4. Rebuild:

```bash
docker compose build --no-cache
docker compose up -d
```

---

## 📚 Related Documentation

- [**Root README**](../README.md) — Project pitch, sync architecture, Docker Compose runbook, CI/CD.
- [**Backend README**](../expenses-tracker-api/README.md) — REST API, JWT validation, database schema,
  testing.
- [**Mobile README**](../expenses-tracker-mobile/README.md) — Native iOS/Android app (separate from this
  web frontend; uses its own local SQLite store and cloud-drive sync, no backend dependency).
- [**`.github/instructions/expenses-tracker-frontend.instructions.md`**](../.github/instructions/expenses-tracker-frontend.instructions.md)
  — Path-scoped Copilot rules (MUI v7 conventions, React 19 event types, TanStack Query patterns).
- [**`AGENTS.md`**](../AGENTS.md) — Agent-targeted quick-reference for all modules.
