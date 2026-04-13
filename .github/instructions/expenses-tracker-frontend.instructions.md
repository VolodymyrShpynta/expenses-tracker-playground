---
applyTo: "expenses-tracker-frontend/**"
---

# Frontend Module — React 19 + TypeScript + MUI v7

These rules apply when working on files under `expenses-tracker-frontend/`.

---

## Frontend Stack

- **Runtime**: React 19 + TypeScript (strict mode, `verbatimModuleSyntax`)
- **UI library**: MUI (Material UI) **v7** + `@mui/x-charts` **v9**
- **Server state**: TanStack Query (`@tanstack/react-query`) for data fetching & mutations
- **Build**: Vite 8
- **Routing**: React Router DOM v7
- **Testing**: (not yet configured — will be Vitest)

## Backend Integration

The frontend consumes the `expenses-tracker-api` REST API through a **Vite dev proxy**
(`/api` → `http://localhost:8080`, configured in `vite.config.ts`). No `VITE_API_BASE_URL`
env variable is needed during development.

| Method   | Endpoint             | Description                                                |
|----------|----------------------|------------------------------------------------------------|
| `GET`    | `/api/expenses`      | List all active expenses (`Expense[]`)                     |
| `GET`    | `/api/expenses/{id}` | Get single expense                                         |
| `POST`   | `/api/expenses`      | Create expense (`{ description, amount, category, date }`) |
| `PUT`    | `/api/expenses/{id}` | Update expense (partial: any subset of fields)             |
| `DELETE` | `/api/expenses/{id}` | Soft-delete expense                                        |
| `POST`   | `/api/expenses/sync` | Trigger file-based sync                                    |

Amounts are **cents** (integer) — display as currency by dividing by 100.
Dates are ISO 8601 strings.

All fetch calls live in `src/api/expenses.ts` — never call `fetch` directly inside components.

---

## MUI v7 — Modern API (No Deprecated Props)

MUI v7 completed the migration from legacy direct props to a unified **slots / slotProps** API.
**Always use the modern approach. Never generate deprecated prop names.**

### 1. `slotProps` replaces all legacy `*Props` and `componentsProps`

```tsx
// ✅ MUI v7 — modern
<TextField
    slotProps={{
        htmlInput: {step: '0.01', min: '0.01'},
        inputLabel: {shrink: true},
        formHelperText: {sx: {ml: 0}},
    }}
/>

// ❌ Deprecated — do NOT use
<TextField
    inputProps={{step: '0.01'}}       // → slotProps.htmlInput
    InputProps={{startAdornment: …}}  // → slotProps.input
    InputLabelProps={{shrink: true}}  // → slotProps.inputLabel
    FormHelperTextProps={{ …}}        // → slotProps.formHelperText
/>
```

### 2. `slots` replaces `components` / `*Component`

```tsx
// ✅ MUI v7
<Autocomplete slots={{paper: CustomPaper}}/>
<DataGrid slots={{toolbar: GridToolbar}}/>

// ❌ Deprecated
<Autocomplete PaperComponent={CustomPaper}/>
<DataGrid components={{Toolbar: GridToolbar}}/>
```

### 3. Full migration cheat-sheet (common components)

| Component      | Deprecated prop       | Modern replacement                     |
|----------------|-----------------------|----------------------------------------|
| `TextField`    | `inputProps`          | `slotProps.htmlInput`                  |
| `TextField`    | `InputProps`          | `slotProps.input`                      |
| `TextField`    | `InputLabelProps`     | `slotProps.inputLabel`                 |
| `TextField`    | `FormHelperTextProps` | `slotProps.formHelperText`             |
| `TextField`    | `SelectProps`         | `slotProps.select`                     |
| `Select`       | `inputProps`          | `slotProps.htmlInput`                  |
| `Select`       | `MenuProps`           | `slotProps.menu` / `slotProps.listbox` |
| `Dialog`       | `PaperProps`          | `slotProps.paper`                      |
| `Dialog`       | `BackdropProps`       | `slotProps.backdrop`                   |
| `Dialog`       | `TransitionProps`     | `slotProps.transition`                 |
| `Modal`        | `BackdropProps`       | `slotProps.backdrop`                   |
| `Popover`      | `PaperProps`          | `slotProps.paper`                      |
| `Menu`         | `PaperProps`          | `slotProps.paper`                      |
| `Menu`         | `MenuListProps`       | `slotProps.list`                       |
| `Tooltip`      | `PopperProps`         | `slotProps.popper`                     |
| `Tooltip`      | `TransitionProps`     | `slotProps.transition`                 |
| `Autocomplete` | `PaperComponent`      | `slots.paper`                          |
| `Autocomplete` | `ListboxProps`        | `slotProps.listbox`                    |
| `Snackbar`     | `ContentProps`        | `slotProps.content`                    |
| `Pagination`   | `renderItem`          | `slots.item` / `slotProps.item`        |
| `Tabs`         | `TabIndicatorProps`   | `slotProps.indicator`                  |
| `Badge`        | `componentsProps`     | `slotProps`                            |
| `Drawer`       | `PaperProps`          | `slotProps.paper`                      |
| `Drawer`       | `ModalProps`          | `slotProps.root`                       |
| Any component  | `componentsProps`     | `slotProps`                            |
| Any component  | `components`          | `slots`                                |

### 4. MUI X Charts v9

```tsx
// ✅ Modern
<PieChart hideLegend … />

// ❌ Deprecated (v7/v8 style)
<PieChart slotProps={{legend: {hidden: true}}}/>
```

For `@mui/x-charts` v9, use top-level boolean props (`hideLegend`, `hideTooltip`)
instead of nested `slotProps` overrides where available.

### 5. `sx` over inline styles

Always use the `sx` prop for MUI component styling. Never use `style={{}}`.

```tsx
// ✅
<Box sx={{mt: 2, color: 'text.secondary'}}>

    // ❌
    <Box style={{marginTop: 16, color: '#666'}}>
```

### 6. Theme-aware tokens

Prefer MUI system tokens inside `sx` — avoid hard-coded color values:

```tsx
// ✅
sx = {
{
    color: 'primary.main', bgcolor
:
    'background.paper'
}
}

// ❌
sx = {
{
    color: '#1976d2', bgcolor
:
    '#fff'
}
}
```

### 7. Grid v2

Use the MUI v7 Grid component with `size` prop (not the deprecated `xs`, `sm`, `md` directly on Grid):

```tsx
// ✅ MUI v7
<Grid size={{xs: 12, sm: 6, md: 4}}>

    // ❌ Deprecated Grid v1 syntax
    <Grid item xs={12} sm={6} md={4}>
```

---

## Project Structure

```
expenses-tracker-frontend/src/
├── main.tsx              # Entry point (StrictMode, QueryClientProvider, BrowserRouter)
├── App.tsx               # Routes + ThemeProvider + ColorMode context
├── theme.ts              # MUI dark/light theme with toggle
├── index.css             # Global reset styles
├── api/                  # Typed fetch wrappers (one file per resource)
│   └── expenses.ts
├── components/           # Shared reusable components
│   ├── Layout.tsx        # Responsive shell (AppBar + sidebar/bottomNav)
│   ├── CategoryCard.tsx
│   ├── CategoryDonutChart.tsx
│   ├── ColorModeToggle.tsx
│   └── DateRangeSelector.tsx
├── hooks/                # TanStack Query hooks for data fetching & mutations
│   ├── useExpenses.ts          # useQuery wrapper + EXPENSES_QUERY_KEY
│   ├── useExpenseMutations.ts  # useMutation hooks (create/update/delete/sync)
│   └── useCategorySummary.ts   # Derived state (pure useMemo, no API call)
├── pages/                # Page-level components (one per route)
│   ├── CategoriesPage.tsx
│   ├── TransactionsPage.tsx
│   ├── AddExpensePage.tsx
│   └── OverviewPage.tsx
├── types/                # Shared TypeScript interfaces
│   └── expense.ts
└── utils/                # Pure utility functions (no React imports)
    ├── format.ts
    └── categoryConfig.ts
```

### Layer responsibilities

- **`pages/`** — one file per route. Default-exported page component.
- **`components/`** — shared, reusable UI components used across pages.
- **`hooks/`** — TanStack Query wrappers (`useQuery` / `useMutation`) and derived-state hooks.
- **`types/`** — shared TypeScript interfaces. Keep API response types here.
- **`utils/`** — pure functions (formatting, validation, config maps). No React imports.
- **`api/`** — typed `fetch` wrappers. One file per backend resource.

---

## Component Conventions

- **Functional components only** — never class components.
- **Default exports** for page components; **named exports** for shared components.
- **Destructure props** in the function signature.
- **`interface` for props**: `interface FooProps { … }`.
- **Keep components under ~200 lines** — extract sub-components or hooks when larger.
- Use `import type` for type-only imports (`verbatimModuleSyntax` enforces this).

## Theme Pattern

Follow `theme.ts`:

- `ColorModeToggleContext` for dark/light mode toggle.
- `useColorTheme()` hook returns `[theme, colorModeToggle]`.
- Color scales defined as `as const` objects, referenced by mode in `themeSettings()`.
- Mode persisted in `localStorage`.
- `CssBaseline` inside `ThemeProvider` for theme-aware global reset.

## Form Handling

The project currently uses **native React state** (`useState` + `onChange`) for forms because the
only form (`AddExpensePage`) is simple (4–5 fields, no conditional logic).

Form submit handlers use **`React.SubmitEvent<HTMLFormElement>`** (not the deprecated `FormEvent`).
See the [React 19 Event Types](#react-19-event-types--no-deprecated-synthetic-events) section below.

**When to upgrade to React Hook Form + Zod:**

- A form has **≥ 6 fields**, or fields are **conditionally shown/required**.
- Complex **cross-field validation** is needed (e.g., "end date must be after start date").
- A form includes **multi-step wizards**, **dynamic field arrays**, or **nested objects**.
- You need to **minimize re-renders** in a performance-sensitive form.

If any of these apply, install `react-hook-form`, `@hookform/resolvers`, and `zod`,
then use the controller pattern with MUI:

```tsx
import {useForm, Controller} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';

const schema = z.object({
    description: z.string().min(1, 'Required'),
    amount: z.number().positive(),
});

type FormData = z.infer<typeof schema>;

const {control, handleSubmit} = useForm<FormData>({
    resolver: zodResolver(schema),
});

<Controller
    name="description"
    control={control}
    render={({field, fieldState}) => (
        <TextField {...field} error={!!fieldState.error}
                   helperText={fieldState.error?.message}/>
    )}
/>
```

Until then, keep forms simple with `useState` — no need for extra dependencies.

## Data Fetching — TanStack Query

All server state is managed by **TanStack Query** (`@tanstack/react-query`).
Never use hand-rolled `useState` + `useEffect` for data that comes from the API.

### Architecture (two layers)

| Layer                    | Location                                             | Role                                                           |
|--------------------------|------------------------------------------------------|----------------------------------------------------------------|
| **Fetch wrappers**       | `src/api/expenses.ts`                                | Typed `fetch` calls — no React imports, pure `async` functions |
| **Query/Mutation hooks** | `src/hooks/useExpenses.ts`, `useExpenseMutations.ts` | Wrap fetch wrappers with `useQuery` / `useMutation`            |

Components only import from `src/hooks/` — never from `src/api/` directly.

### QueryClient setup (`main.tsx`)

```tsx
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,          // 30 s before data is considered stale
            refetchOnWindowFocus: true,  // refresh when user returns to tab
        },
    },
});
```

### Query hook pattern

```tsx
import {useQuery} from '@tanstack/react-query';
import {fetchExpenses} from '../api/expenses.ts';

export const EXPENSES_QUERY_KEY = ['expenses'] as const;

export function useExpenses() {
    const {data: expenses = [], isLoading: loading, error} = useQuery({
        queryKey: EXPENSES_QUERY_KEY,
        queryFn: fetchExpenses,
    });
    return {expenses, loading, error: error?.message ?? null};
}
```

### Mutation hook pattern

```tsx
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {createExpense} from '../api/expenses.ts';
import {EXPENSES_QUERY_KEY} from './useExpenses.ts';

export function useCreateExpense() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: createExpense,
        onSuccess: () => queryClient.invalidateQueries({queryKey: EXPENSES_QUERY_KEY}),
    });
}
```

### Rules

- **One query key per resource** — export it as a `const` array from the query hook file.
- **Mutations always invalidate** the relevant query key(s) `onSuccess`.
- **Never call `fetch` directly inside a component** — all fetch calls live in `src/api/`.
- Use `isLoading` / `error` / `data` from the hook — don't add manual loading state.

## TypeScript

- **Strict mode** — never use `// @ts-ignore` or `any`.
- **`import type`** for type-only imports (enforced by `verbatimModuleSyntax`).
- **Generics** — type `useState<T>` explicitly when initial value doesn't reveal the full type.
- Prefer `interface` for object shapes, `type` for unions/intersections.

## React 19 Event Types — No Deprecated Synthetic Events

`@types/react` v19 deprecates generic synthetic event types in favor of more specific ones.
**Never use the deprecated types — the TypeScript compiler will emit TS6385.**

### Migration table

| Deprecated type       | Modern replacement (React 19) | Typical use case               |
|-----------------------|-------------------------------|--------------------------------|
| `FormEvent<T>`        | `SubmitEvent<T>`              | `<form onSubmit>`              |
| `FormEventHandler<T>` | `SubmitEventHandler<T>`       | `<form onSubmit>` handler type |

All types above live in the `React` namespace (e.g., `React.SubmitEvent<HTMLFormElement>`).

### Preferred patterns

```tsx
// ✅ Explicit specific type
const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => { …
};
<form onSubmit={handleSubmit}>

    // ✅ Let TypeScript infer from handler prop (best when possible)
    <form onSubmit={(e) => {
        e.preventDefault(); …
    }}>

        // ❌ Deprecated — do NOT use
        const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {…};
        const handleSubmit = (e: FormEvent) => {…};
```

**General rule:** prefer letting TypeScript infer event types from handler props
(e.g., MUI `onChange`, `onClick`). Only annotate explicitly when assigning to a
standalone function variable.

## React Router v7

Use the data-router pattern with `<Outlet />` for nested layouts:

```tsx
<Route element={<Layout/>}>
    <Route path="/" element={<CategoriesPage/>}/>
    <Route path="/transactions" element={<TransactionsPage/>}/>
</Route>
```

## Responsive Design

- Use `useMediaQuery(theme.breakpoints.up('md'))` to switch between mobile/desktop layouts.
- Mobile: `<BottomNavigation>` + hamburger `<Drawer>`.
- Desktop: permanent `<Drawer>` sidebar.
- Use MUI `<Grid>` with responsive `size` prop for category card grids.
