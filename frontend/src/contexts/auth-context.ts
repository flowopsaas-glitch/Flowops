import { createContext, useContext } from "react";
import type { AuthContextValue } from "./AuthContext";

/**
 * Auth context + hook live apart from AuthProvider so the provider file only
 * exports a component (react-refresh). The provider supplies the value.
 */
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
