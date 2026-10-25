import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { TenantContext } from "./tenant-context";
import {
  getMyCompany,
  type CompanyBranding,
  type CompanyRecord,
} from "../api/companiesApi";
import { FLOWOPS_HTTP_ORIGIN } from "../lib/env";
import { useAuth } from "./auth-context";

/**
 * The branding object the UI actually consumes.
 *
 * Distinct from the raw `CompanyRecord` columns in two ways:
 *
 * 1. Every field is guaranteed non-null — fallbacks have been applied. The
 *    UI never has to write `tenant?.primaryColor ?? "#3b82f6"` itself.
 * 2. `logoUrl` is an absolute URL ready to be passed to `<img src>`. Relative
 *    paths from the backend (`/uploads/logo.png`) are resolved against
 *    `FLOWOPS_HTTP_ORIGIN` here, so consumers don't have to.
 */
export type ResolvedBranding = {
  brandName: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  invoiceHeaderColor: string;
  portalSubdomain: string | null;
};

export type TenantContextValue = {
  /** Raw company record. `null` when not authenticated, loading, or fetch failed. */
  tenant: CompanyRecord | null;
  /** Always defined — falls back to platform defaults when no tenant is loaded. */
  branding: ResolvedBranding;
  isLoading: boolean;
  error: string | null;
  /** Refetches the tenant. Call this after PATCHing branding so the UI updates. */
  refresh: () => Promise<void>;
};

const DEFAULT_BRAND_NAME = "FlowOps";
const DEFAULT_PRIMARY = "#3b82f6"; // tailwind blue-500, matches existing accent
const DEFAULT_SECONDARY = "#0ea5e9"; // tailwind sky-500
const DEFAULT_INVOICE_HEADER = DEFAULT_PRIMARY;

const DEFAULT_BRANDING: ResolvedBranding = {
  brandName: DEFAULT_BRAND_NAME,
  logoUrl: null,
  primaryColor: DEFAULT_PRIMARY,
  secondaryColor: DEFAULT_SECONDARY,
  invoiceHeaderColor: DEFAULT_INVOICE_HEADER,
  portalSubdomain: null,
};


/**
 * Resolves a possibly-relative logo URL into something `<img src>` can use.
 * - Absolute http(s) URLs pass through unchanged.
 * - Paths starting with `/` are prefixed with `FLOWOPS_HTTP_ORIGIN`.
 * - Anything else is treated as relative to the API origin too.
 * - Empty / null returns `null` so the consumer can render a fallback.
 */
function resolveLogoUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^data:image\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return `${FLOWOPS_HTTP_ORIGIN}${trimmed}`;
  return `${FLOWOPS_HTTP_ORIGIN}/${trimmed}`;
}

/** Normalises a possibly-empty string colour, returning the fallback if blank. */
function pickColour(value: string | null | undefined, fallback: string): string {
  const trimmed = (value ?? "").trim();
  return trimmed || fallback;
}

function deriveBranding(tenant: CompanyRecord | null): ResolvedBranding {
  if (!tenant) return DEFAULT_BRANDING;
  const primary = pickColour(tenant.primaryColor, DEFAULT_PRIMARY);
  return {
    brandName: pickColour(tenant.brandName, tenant.name || DEFAULT_BRAND_NAME),
    logoUrl: resolveLogoUrl(tenant.logoUrl),
    primaryColor: primary,
    secondaryColor: pickColour(tenant.secondaryColor, DEFAULT_SECONDARY),
    invoiceHeaderColor: pickColour(tenant.invoiceHeaderColor, primary),
    portalSubdomain:
      typeof tenant.portalSubdomain === "string" && tenant.portalSubdomain.trim()
        ? tenant.portalSubdomain.trim()
        : null,
  };
}

/**
 * Applies the resolved branding to `:root` as CSS custom properties. Any
 * component anywhere in the tree can consume these via `var(--brand-primary)`
 * etc., without prop-drilling.
 */
function applyBrandingToRoot(branding: ResolvedBranding) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--brand-primary", branding.primaryColor);
  root.style.setProperty("--brand-secondary", branding.secondaryColor);
  root.style.setProperty(
    "--brand-invoice-header",
    branding.invoiceHeaderColor,
  );
  // expose as a comma-separated rgb-friendly form too, for `rgb(var(--brand-primary-rgb) / 0.4)` style usage
  // (kept simple: leave the hex; consumers can use color-mix() in modern Tailwind).
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, booting } = useAuth();
  const [tenant, setTenant] = useState<CompanyRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    return getMyCompany()
      .then((data) => {
        setTenant(data);
        setError(null);
      })
      .catch((err: unknown) => {
        // Don't blow up the whole app — sign-in still works without tenant
        // data. The most common failure mode in this repo is "no backend
        // running" during dev; we want the UI to keep going on default
        // branding.
        const message =
          err instanceof Error ? err.message : "Failed to load tenant";
        setError(message);
        setTenant(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    if (booting) return;
    if (!isAuthenticated) return;
    void load();
  }, [booting, isAuthenticated, load]);

  // While signed out, the tenant record is hidden (the derivation below),
  // rather than cleared by a synchronous effect setState; signing back in
  // reloads it via load().
  const visibleTenant = isAuthenticated ? tenant : null;
  const visibleError = isAuthenticated ? error : null;

  const branding = useMemo(() => deriveBranding(visibleTenant), [visibleTenant]);

  // Apply CSS variables whenever the resolved branding changes. Runs once on
  // mount with defaults too, so the tokens are always present.
  useEffect(() => {
    applyBrandingToRoot(branding);
    // Expose tenant currency globally so page-level money() helpers can read it
    // without needing the hook (backward-compat for existing inline formatters).
    window.__FLOWOPS_CURRENCY__ = visibleTenant?.currency ?? 'ZAR';
    window.__FLOWOPS_COUNTRY__ = visibleTenant?.country ?? 'ZA';
  }, [branding, visibleTenant?.currency, visibleTenant?.country]);

  const value = useMemo<TenantContextValue>(
    () => ({ tenant: visibleTenant, branding, isLoading, error: visibleError, refresh: load }),
    [visibleTenant, branding, isLoading, visibleError, load],
  );

  return (
    <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
  );
}


// Re-export for consumers that only care about the shape.
export type { CompanyBranding };
