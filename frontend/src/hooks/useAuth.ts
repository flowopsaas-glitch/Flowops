import { useState, useEffect } from 'react';
import {
  clearSession,
  getAccessToken,
  setAccessToken,
} from '../lib/session';

/**
 * Lightweight auth hook used by `components/Collections.tsx`. Distinct from
 * the proper `useAuth()` exported from `contexts/AuthContext.tsx`, which is
 * what the rest of the app consumes.
 *
 * Both now share the same underlying storage (`lib/session.ts`), so this
 * hook's view stays in sync with `<AuthProvider>` after login/logout.
 */
export function useAuth() {
  const [token, setToken] = useState<string | null>(() => getAccessToken());

  useEffect(() => {
    // Follow token changes made by other tabs/windows; same-tab updates flow
    // through this hook's own login/logout. (The initial value already comes
    // from the lazy initializer above.)
    const onStorage = () => setToken(getAccessToken());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const login = (newToken: string) => {
    setAccessToken(newToken);
    setToken(newToken);
  };

  const logout = () => {
    clearSession();
    setToken(null);
  };

  return { token, login, logout };
}
