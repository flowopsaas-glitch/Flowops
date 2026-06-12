# TenantContext + branding

Reference for the `TenantContext` introduced in PR #4 (`contexts/TenantContext.tsx`).

## What it is

A React context mounted at app root that loads the current tenant's company record once on auth and exposes:

- The raw `CompanyRecord` (or `null` when not authenticated / loading / errored).
- A `ResolvedBranding` object with non-null defaults, so consumers don't need null guards.
- CSS variables on `:root` (`--brand-primary`, `--brand-secondary`, `--brand-invoice-header`) for components that prefer styling over reading the JS object.
- A `refresh()` function to re-fetch after mutations.

The provider is mounted in `main.tsx` **inside** `<AuthProvider>` (it depends on `useAuth()`).

```
<BrowserRouter>
  <AuthProvider>
    <TenantProvider>      ← here
      <ToastProvider>
        <App />
      </ToastProvider>
    </TenantProvider>
  </AuthProvider>
</BrowserRouter>
```

## Hooks

```ts
import { useTenant, useBranding } from "@/contexts/TenantContext";
```

### `useTenant()`

Returns the full context value:

```ts
const { tenant, branding, isLoading, error, refresh } = useTenant();
```

| Field | Type | Notes |
|---|---|---|
| `tenant` | `CompanyRecord \| null` | Raw record from `GET /companies/my-company`. `null` until first load completes. |
| `branding` | `ResolvedBranding` | Always defined. Defaults applied for any unset fields. |
| `isLoading` | `boolean` | `true` during the initial fetch and during `refresh()`. |
| `error` | `string \| null` | Error message from the last fetch attempt; the app keeps working on default branding. |
| `refresh` | `() => Promise<void>` | Refetches the tenant. Call after PATCHing the tenant record. |

### `useBranding()`

Convenience wrapper for components that only care about branding:

```ts
const branding = useBranding();
//    ^? ResolvedBranding
```

## `ResolvedBranding` shape

```ts
type ResolvedBranding = {
  brandName: string;          // never empty — defaults to tenant.name then "FlowOps"
  logoUrl: string | null;     // already absolute — backend-relative paths are joined with FLOWOPS_HTTP_ORIGIN
  primaryColor: string;       // 7-char hex, e.g. "#3b82f6"
  secondaryColor: string;     // 7-char hex
  invoiceHeaderColor: string; // 7-char hex (defaults to primaryColor)
  portalSubdomain: string | null;
};
```

### Defaults (when no branding has been saved)

| Field | Default |
|---|---|
| `brandName` | `"FlowOps"` |
| `logoUrl` | `null` (consumers should fall back to a static asset) |
| `primaryColor` | `#3b82f6` (Tailwind blue-500) |
| `secondaryColor` | `#0ea5e9` (Tailwind sky-500) |
| `invoiceHeaderColor` | same as `primaryColor` |
| `portalSubdomain` | `null` |

## CSS variables

The provider writes the resolved colours to `document.documentElement` so components can theme without prop-drilling:

```css
:root {
  --brand-primary: #3b82f6;
  --brand-secondary: #0ea5e9;
  --brand-invoice-header: #3b82f6;
}
```

Consume in any component:

```tsx
<button
  className="rounded-lg px-4 py-2 text-white"
  style={{ background: "var(--brand-primary)" }}
>
  Save
</button>
```

Or with Tailwind 4 arbitrary values:

```tsx
<div className="bg-[var(--brand-primary)] text-white">…</div>
```

## When to use which

| Need | Use |
|---|---|
| The current company id, plan, support email, etc. | `useTenant().tenant?.fieldName` |
| Sidebar / header / navbar branding | `useBranding()` (resolved object) |
| Themed buttons, accents, badges | `var(--brand-primary)` etc. (no JS read needed) |
| Trigger a re-fetch after editing the tenant | `useTenant().refresh()` |

## Migration: replacing ad-hoc `GET /companies/my-company` fetches

Several pages (e.g. `pages/SettingsCommandCenter.tsx`) still fetch `/companies/my-company` directly. The replacement is straightforward:

```ts
// Before:
const [company, setCompany] = useState<CompanyPayload | null>(null);
useEffect(() => {
  api.get("/companies/my-company").then((res) => setCompany(res.data));
}, []);

// After:
const { tenant: company, isLoading } = useTenant();
```

Benefits:
- One request per session instead of per page.
- Single source of truth for branding fields — no risk of stale data after editing.
- Updates from the branding editor propagate everywhere automatically (`refresh()` in the editor → all consumers re-render).

## Failure modes

The provider catches fetch errors silently:
- `error` is set to the message.
- `tenant` is `null`.
- `branding` falls back to platform defaults.
- The UI keeps working — important for dev mode where the backend may not be running.

If you need to surface the error to the user (e.g. on a settings page), read `error` from `useTenant()` and render an inline notice.

## Editing branding

`pages/settings/BrandingSettings.tsx` is the reference implementation:

1. Initialise form state from `useTenant().tenant`.
2. Compute the diff against the original tenant on submit.
3. Send only the diff via `updateMyCompanyBranding(payload)` from `api/companiesApi.ts`.
4. On success, call `useTenant().refresh()`.
5. Empty strings in the form are sent as `null` so a tenant can clear a column.

When building further branding-related editors (e.g. logo upload), follow the same pattern. The diff-only PATCH avoids accidental clobbering of fields the editor doesn't manage.
