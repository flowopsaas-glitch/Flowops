import { createContext, useContext } from "react";
import type { ResolvedBranding, TenantContextValue } from "./TenantContext";

/**
 * Tenant context + hooks live apart from TenantProvider so the provider file
 * only exports a component (react-refresh). The provider supplies the value.
 */
export const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenant must be used inside <TenantProvider>");
  }
  return ctx;
}

/** Convenience hook: just the resolved branding object. */
export function useBranding(): ResolvedBranding {
  return useTenant().branding;
}
