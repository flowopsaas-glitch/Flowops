import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import api, {
  clearClientSession,
  getToken,
  isTenantMode,
  setLoginMode,
  setToken,
} from "../api/client";

/** Login modes the backend distinguishes between. */
export type LoginMode = "tenant" | "owner";

/**
 * Subset of company fields embedded on the `/auth/me` response. The backend
 * returns this nested under `user.company` so pages can render banners and
 * billing summaries without a separate fetch.
 *
 * Kept loose intentionally — billing fields are still maturing on the
 * backend side. Mark unknown fields as optional rather than `any`.
 */
export type UserCompanySummary = {
  id?: number | string;
  name?: string | null;
  /** ISO 4217 code, e.g. "ZAR". */
  currency?: string | null;
  /** Display plan label (e.g. "Starter", "Pro"). */
  plan?: string | null;
  /** "active" | "trialing" | "past_due" | "canceled" — backend-defined. */
  status?: string | null;
  trialEndsAt?: string | null;
  trialStartedAt?: string | null;
  /** Days left in trial (null = not on trial / paid plan). */
  trialDaysLeft?: number | null;
  trialExpired?: boolean;
  isOnTrial?: boolean;
  baseTierPrice?: number | null;
  perUserPrice?: number | null;
  defaultVatRate?: number | null;
  autoInvoiceEnabled?: boolean | null;
};

/**
 * Shape of `/auth/me`. Conservative on documented fields; tolerant of
 * undocumented ones via `unknown` rather than `any`.
 */
export type User = {
  id: number | string;
  email: string;
  role?: string;
  /** Tenant id (for tenant users) or null for platform owners. */
  companyId?: number | string | null;
  /** Embedded company summary (see `UserCompanySummary`). */
  company?: UserCompanySummary | null;
  /** Display name if the backend supplies one. */
  name?: string | null;
  /** Platform-level super-admin flag (read by RBAC consumers). */
  isSuperAdmin?: boolean;
  /** "Ultimate owner" flag — the original platform-creator account. */
  isUltimateOwner?: boolean;
  /** Optional per-user nav-permission overrides set by a tenant admin. When
   *  present, these take precedence over the role defaults. Accepts either the
   *  `permissions` or `navPermissions` key the backend may use. */
  permissions?: Record<string, boolean> | string[] | null;
  navPermissions?: Record<string, boolean> | string[] | null;
};

export type LoginArgs = {
  email: string;
  password: string;
  /** Defaults to `"tenant"` when omitted. */
  mode?: LoginMode;
};

export type AuthContextValue = {
  /** True while we're checking the bootstrap token against `/auth/me`. */
  booting: boolean;
  /** Authenticated user, or `null` when not signed in. */
  user: User | null;
  /** Convenience: `Boolean(user)`. */
  isAuthenticated: boolean;
  /** Posts to `/auth/login` (or `/auth/owner-login`) and stores the session. */
  login: (args: LoginArgs) => Promise<void>;
  /** Clears the session locally and notifies the backend. */
  logout: () => void;
  /** Re-fetches `/auth/me`. Call after profile updates. */
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type LoginResponse = {
  accessToken?: string;
  token?: string;
  user?: User;
} & Partial<User>;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  const refreshMe = useCallback(async () => {
    if (!getToken()) {
      setBooting(false);
      return;
    }
    // Only tenant users have a `/auth/me`. Owner and driver sessions are
    // validated by their own guards/endpoints — calling the tenant `/auth/me`
    // with their token 401s, and the catch below would wipe a perfectly valid
    // session (bouncing owners back to /login). Skip tenant hydration unless
    // we're actually in tenant mode.
    if (!isTenantMode()) {
      setBooting(false);
      return;
    }
    try {
      const res = await api.get<User>("/auth/me");
      setUser(res.data);
    } catch {
      clearClientSession();
      setUser(null);
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const login = useCallback(async (args: LoginArgs) => {
    const mode: LoginMode = args.mode ?? "tenant";
    const endpoint = mode === "owner" ? "/auth/owner-login" : "/auth/login";
    const { data } = await api.post<LoginResponse>(endpoint, {
      email: args.email,
      password: args.password,
      mode,
    });

    const token = data.accessToken ?? data.token;
    if (!token) {
      throw new Error("Login response did not contain an access token");
    }
    setToken(token);
    setLoginMode(mode);

    // The backend sometimes returns `{ user }`, sometimes the user fields are
    // flattened on the response root. Accept both.
    const nextUser: User | null = data.user
      ? data.user
      : data.email
        ? {
            id: data.id ?? "",
            email: data.email,
            role: data.role,
            companyId: data.companyId ?? null,
            name: data.name ?? null,
          }
        : null;
    setUser(nextUser);
  }, []);

  const logout = useCallback(() => {
    void api.post("/auth/logout").finally(() => {
      clearClientSession();
      setUser(null);
    });
  }, []);

  const value: AuthContextValue = {
    booting,
    user,
    isAuthenticated: !!user,
    login,
    logout,
    refreshMe,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
