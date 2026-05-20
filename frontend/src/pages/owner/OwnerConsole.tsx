import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from '../../api/client';

type OwnerLoginResponse = {
  accessToken?: string;
  token?: string;
  jwt?: string;
  role?: string;
  roles?: string[];
  isOwner?: boolean;
  isSuperAdmin?: boolean;
  email?: string;
};

type TenantRecord = {
  id: number | string;
  name?: string;
  companyName?: string;
  status?: string;
  isActive?: boolean;
  createdAt?: string;
  subscriptionPlan?: string;
  plan?: string;
  email?: string;
  contactEmail?: string;
};

type PlatformMetrics = {
  tenantCount?: number;
  activeTenantCount?: number;
  invoiceCount?: number;
  collectionCount?: number;
  userCount?: number;
};

type AiAlertRecord = {
  id?: number | string;
  companyName?: string;
  company?: {
    name?: string;
    companyName?: string;
  };
  severity?: string;
  title?: string;
  message?: string;
  createdAt?: string;
};

type AuditRecord = {
  id?: number | string;
  action?: string;
  entityType?: string;
  entityId?: number | string;
  message?: string;
  createdAt?: string;
  actorName?: string;
  actorEmail?: string;
};

type PlanRecord = {
  id?: number | string;
  name?: string;
  code?: string;
  price?: number;
  amount?: number;
  currency?: string;
  interval?: string;
  billingInterval?: string;
  isActive?: boolean;
};

type EndpointIssue = {
  endpoint: string;
  message: string;
  status?: number;
};

type OwnerSession = {
  token: string;
  email: string;
  role?: string;
  roles?: string[];
  isOwner?: boolean;
  isSuperAdmin?: boolean;
  savedAt: string;
};

type TenantActionState = {
  busyTenantId?: string;
  message?: string;
  error?: string;
};

const OWNER_TOKEN_KEY = "flowops_owner_access_token";
const OWNER_SESSION_KEY = "flowops_owner_session_v1";

const DEFAULT_OWNER_EMAIL = "flowopsaas@gmail.com";
const DEFAULT_OWNER_PASSWORD = "2026FlowOps!";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function extractToken(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const source = payload as Record<string, unknown>;
  const directCandidates = [source.accessToken, source.token, source.jwt];

  for (const candidate of directCandidates) {
    if (isNonEmptyString(candidate)) {
      return candidate;
    }
  }

  if (source.data && typeof source.data === "object") {
    const nested = source.data as Record<string, unknown>;
    const nestedCandidates = [nested.accessToken, nested.token, nested.jwt];

    for (const candidate of nestedCandidates) {
      if (isNonEmptyString(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function normalizeArrayResponse<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (payload && typeof payload === "object") {
    const source = payload as Record<string, unknown>;
    const candidates = [
      source.items,
      source.data,
      source.results,
      source.rows,
      source.tenants,
      source.alerts,
      source.audit,
      source.plans
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate as T[];
      }
    }

    if (source.data && typeof source.data === "object") {
      const nested = source.data as Record<string, unknown>;
      const nestedCandidates = [
        nested.items,
        nested.results,
        nested.rows,
        nested.tenants,
        nested.alerts,
        nested.audit,
        nested.plans
      ];

      for (const candidate of nestedCandidates) {
        if (Array.isArray(candidate)) {
          return candidate as T[];
        }
      }
    }
  }

  return [];
}

function normalizeObjectResponse<T>(payload: unknown): T {
  if (payload && typeof payload === "object") {
    const source = payload as Record<string, unknown>;

    if (source.data && typeof source.data === "object") {
      return source.data as T;
    }

    return payload as T;
  }

  return {} as T;
}

function getErrorMessage(error: unknown): { message: string; status?: number } {
  if (error && typeof error === "object") {
    const source = error as {
      response?: {
        status?: number;
        data?: {
          message?: string | string[];
          error?: string;
        };
      };
      message?: string;
    };

    const status = source.response?.status;
    const responseMessage = source.response?.data?.message;
    const responseError = source.response?.data?.error;

    if (Array.isArray(responseMessage) && responseMessage.length > 0) {
      return {
        message: responseMessage.join(", "),
        status
      };
    }

    if (isNonEmptyString(responseMessage)) {
      return {
        message: responseMessage,
        status
      };
    }

    if (isNonEmptyString(responseError)) {
      return {
        message: responseError,
        status
      };
    }

    if (isNonEmptyString(source.message)) {
      return {
        message: source.message,
        status
      };
    }

    return {
      message: "Unknown request error",
      status
    };
  }

  return {
    message: "Unknown request error"
  };
}

function loadStoredSession(): OwnerSession | null {
  const token = localStorage.getItem(OWNER_TOKEN_KEY);

  if (!isNonEmptyString(token)) {
    localStorage.removeItem(OWNER_TOKEN_KEY);
    localStorage.removeItem(OWNER_SESSION_KEY);
    sessionStorage.removeItem(OWNER_TOKEN_KEY);
    sessionStorage.removeItem(OWNER_SESSION_KEY);
    return null;
  }

  const rawSession =
    localStorage.getItem(OWNER_SESSION_KEY) ??
    sessionStorage.getItem(OWNER_SESSION_KEY);

  if (!rawSession) {
    const minimalSession: OwnerSession = {
      token,
      email: DEFAULT_OWNER_EMAIL,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(OWNER_SESSION_KEY, JSON.stringify(minimalSession));
    sessionStorage.setItem(OWNER_SESSION_KEY, JSON.stringify(minimalSession));
    sessionStorage.setItem(OWNER_TOKEN_KEY, token);
    return minimalSession;
  }

  try {
    const parsed = JSON.parse(rawSession) as Partial<OwnerSession>;

    if (!isNonEmptyString(parsed.token)) {
      throw new Error("Stored owner token is missing");
    }

    const session: OwnerSession = {
      token: parsed.token,
      email: isNonEmptyString(parsed.email) ? parsed.email : DEFAULT_OWNER_EMAIL,
      role: isNonEmptyString(parsed.role) ? parsed.role : undefined,
      roles: Array.isArray(parsed.roles)
        ? parsed.roles.filter((value): value is string => typeof value === "string")
        : undefined,
      isOwner: parsed.isOwner === true,
      isSuperAdmin: parsed.isSuperAdmin === true,
      savedAt: isNonEmptyString(parsed.savedAt) ? parsed.savedAt : new Date().toISOString()
    };

    localStorage.setItem(OWNER_TOKEN_KEY, session.token);
    localStorage.setItem(OWNER_SESSION_KEY, JSON.stringify(session));
    sessionStorage.setItem(OWNER_TOKEN_KEY, session.token);
    sessionStorage.setItem(OWNER_SESSION_KEY, JSON.stringify(session));

    return session;
  } catch {
    localStorage.removeItem(OWNER_TOKEN_KEY);
    localStorage.removeItem(OWNER_SESSION_KEY);
    sessionStorage.removeItem(OWNER_TOKEN_KEY);
    sessionStorage.removeItem(OWNER_SESSION_KEY);
    return null;
  }
}

function persistSession(session: OwnerSession): void {
  localStorage.setItem(OWNER_TOKEN_KEY, session.token);
  localStorage.setItem(OWNER_SESSION_KEY, JSON.stringify(session));
  sessionStorage.setItem(OWNER_TOKEN_KEY, session.token);
  sessionStorage.setItem(OWNER_SESSION_KEY, JSON.stringify(session));
}

function clearStoredSession(): void {
  localStorage.removeItem(OWNER_TOKEN_KEY);
  localStorage.removeItem(OWNER_SESSION_KEY);
  sessionStorage.removeItem(OWNER_TOKEN_KEY);
  sessionStorage.removeItem(OWNER_SESSION_KEY);
}

function formatDateTime(value?: string): string {
  if (!isNonEmptyString(value)) {
    return "-";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function getTenantName(tenant: TenantRecord): string {
  if (isNonEmptyString(tenant.companyName)) {
    return tenant.companyName;
  }

  if (isNonEmptyString(tenant.name)) {
    return tenant.name;
  }

  return "Unnamed Tenant";
}

function getPlanName(tenant: TenantRecord): string {
  if (isNonEmptyString(tenant.subscriptionPlan)) {
    return tenant.subscriptionPlan;
  }

  if (isNonEmptyString(tenant.plan)) {
    return tenant.plan;
  }

  return "No plan";
}

function getTenantStatus(tenant: TenantRecord): string {
  if (isNonEmptyString(tenant.status)) {
    return tenant.status;
  }

  if (tenant.isActive === true) {
    return "ACTIVE";
  }

  if (tenant.isActive === false) {
    return "INACTIVE";
  }

  return "UNKNOWN";
}

function getViewModeTenantUrl(tenantId: number | string): string {
  return `/owner/view-mode/${tenantId}`;
}

export default function OwnerConsole() {
  const [email, setEmail] = useState<string>(DEFAULT_OWNER_EMAIL);
  const [password, setPassword] = useState<string>(DEFAULT_OWNER_PASSWORD);
  const [session, setSession] = useState<OwnerSession | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loggingIn, setLoggingIn] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string>("");
  const [successBanner, setSuccessBanner] = useState<string>("");
  const [endpointIssues, setEndpointIssues] = useState<EndpointIssue[]>([]);
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [metrics, setMetrics] = useState<PlatformMetrics>({});
  const [aiAlerts, setAiAlerts] = useState<AiAlertRecord[]>([]);
  const [auditRows, setAuditRows] = useState<AuditRecord[]>([]);
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [tenantActionState, setTenantActionState] = useState<TenantActionState>({});

  const authHeaders = useCallback((token: string) => {
    return {
      Authorization: `Bearer ${token}`
    };
  }, []);

  const hardResetOwnerSession = useCallback((message?: string) => {
    clearStoredSession();
    setSession(null);
    setTenants([]);
    setMetrics({});
    setAiAlerts([]);
    setAuditRows([]);
    setPlans([]);
    setEndpointIssues([]);
    setTenantActionState({});
    setPassword(DEFAULT_OWNER_PASSWORD);
    setEmail(DEFAULT_OWNER_EMAIL);
    setSuccessBanner("");
    setErrorBanner(message ?? "Stored owner session was invalid and has been cleared. Please sign in again.");
  }, []);

  const loadDashboard = useCallback(
    async (token: string) => {
      const issues: EndpointIssue[] = [];

      const requestWithCapture = async <T,>(
        endpoint: string,
        method: () => Promise<T>,
        onSuccess: (value: T) => void,
      ): Promise<void> => {
        try {
          const value = await method();
          onSuccess(value);
        } catch (error) {
          const details = getErrorMessage(error);
          issues.push({
            endpoint,
            message: details.message,
            status: details.status
          });
        }
      };

      await Promise.all([
        requestWithCapture(
          "/owner/tenants",
          async () => {
            const response = await api.get("/owner/tenants", {
              headers: authHeaders(token)
            });
            return normalizeArrayResponse<TenantRecord>(response.data);
          },
          (value) => setTenants(value),
        ),
        requestWithCapture(
          "/owner/platform-metrics",
          async () => {
            const response = await api.get("/owner/platform-metrics", {
              headers: authHeaders(token)
            });
            return normalizeObjectResponse<PlatformMetrics>(response.data);
          },
          (value) => setMetrics(value),
        ),
        requestWithCapture(
          "/owner/ai-alerts",
          async () => {
            const response = await api.get("/owner/ai-alerts", {
              headers: authHeaders(token)
            });
            return normalizeArrayResponse<AiAlertRecord>(response.data);
          },
          (value) => setAiAlerts(value),
        ),
        requestWithCapture(
          "/owner/audit",
          async () => {
            const response = await api.get("/owner/audit", {
              headers: authHeaders(token)
            });
            return normalizeArrayResponse<AuditRecord>(response.data);
          },
          (value) => setAuditRows(value),
        ),
        requestWithCapture(
          "/owner/plans",
          async () => {
            const response = await api.get("/owner/plans", {
              headers: authHeaders(token)
            });
            return normalizeArrayResponse<PlanRecord>(response.data);
          },
          (value) => setPlans(value),
        )
      ]);

      const unauthorizedHit = issues.some((item) => item.status === 401);

      if (unauthorizedHit) {
        hardResetOwnerSession("Stored owner session was rejected by the backend. It has been cleared. Please sign in again.");
        return;
      }

      setEndpointIssues(issues);

      if (issues.length > 0) {
        setErrorBanner("");
      } else {
        setErrorBanner("");
      }
    },
    [authHeaders, hardResetOwnerSession],
  );

  const validateAndHydrateSession = useCallback(
    async (storedSession: OwnerSession) => {
      const response = await api.get("/owner/tenants", {
        headers: authHeaders(storedSession.token)
      });

      const tenantRows = normalizeArrayResponse<TenantRecord>(response.data);

      setSession(storedSession);
      setTenants(tenantRows);
      await loadDashboard(storedSession.token);
    },
    [authHeaders, loadDashboard],
  );

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      setLoading(true);

      try {
        const stored = loadStoredSession();

        if (!stored) {
          if (mounted) {
            setLoading(false);
          }
          return;
        }

        await validateAndHydrateSession(stored);
      } catch (error) {
        const details = getErrorMessage(error);
        const shouldClear =
          details.status === 401 ||
          /unauthorized|invalid owner token|invalid token/i.test(details.message);

        if (mounted) {
          if (shouldClear) {
            hardResetOwnerSession("Stored owner session was invalid and has been cleared. Please sign in again.");
          } else {
            setErrorBanner(details.message);
          }
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, [hardResetOwnerSession, validateAndHydrateSession]);

  const handleLogin = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setLoggingIn(true);
      setErrorBanner("");
      setSuccessBanner("");
      setEndpointIssues([]);

      try {
        clearStoredSession();

        const response = await api.post("/owner/auth/login", {
          email: email.trim(),
          password
        });

        const payload = response.data as OwnerLoginResponse;
        const token = extractToken(payload);

        if (!isNonEmptyString(token)) {
          throw new Error("Owner login succeeded but no access token was returned.");
        }

        const nextSession: OwnerSession = {
          token,
          email: email.trim(),
          role: payload.role,
          roles: Array.isArray(payload.roles) ? payload.roles : [],
          isOwner: payload.isOwner === true,
          isSuperAdmin: payload.isSuperAdmin === true,
          savedAt: new Date().toISOString()
        };

        persistSession(nextSession);
        setSession(nextSession);
        await loadDashboard(token);
        setSuccessBanner("Hidden owner session authenticated successfully.");
      } catch (error) {
        const details = getErrorMessage(error);
        hardResetOwnerSession(details.message);
      } finally {
        setLoggingIn(false);
      }
    },
    [email, loadDashboard, password, hardResetOwnerSession],
  );

  const handleRefresh = useCallback(async () => {
    if (!session?.token) {
      return;
    }

    setRefreshing(true);
    setErrorBanner("");
    setSuccessBanner("");

    try {
      await loadDashboard(session.token);
      setSuccessBanner("Owner dashboard refreshed successfully.");
    } catch (error) {
      const details = getErrorMessage(error);
      setErrorBanner(details.message);
    } finally {
      setRefreshing(false);
    }
  }, [loadDashboard, session]);

  const handleSignOut = useCallback(() => {
    hardResetOwnerSession("Owner session cleared.");
  }, [hardResetOwnerSession]);

  const runTenantAction = useCallback(
    async (tenantId: number | string, action: string) => {
      if (!session?.token) {
        setErrorBanner("Owner session is missing. Please sign in again.");
        return;
      }

      setTenantActionState({
        busyTenantId: String(tenantId),
        message: "",
        error: ""
      });
      setErrorBanner("");
      setSuccessBanner("");

      try {
        const response = await api.post(
          `/owner/tenants/${tenantId}/action`,
          { action },
          {
            headers: authHeaders(session.token)
          },
        );

        const payload = normalizeObjectResponse<Record<string, unknown>>(response.data);
        const actionMessage =
          (isNonEmptyString(payload.message) && payload.message) ||
          (isNonEmptyString(payload.status) && String(payload.status)) ||
          `Tenant action '${action}' completed successfully.`;

        setTenantActionState({
          busyTenantId: "",
          message: actionMessage,
          error: ""
        });

        setSuccessBanner(actionMessage);
        await loadDashboard(session.token);
      } catch (error) {
        const details = getErrorMessage(error);

        if (details.status === 401) {
          hardResetOwnerSession("Owner session expired during tenant action. Please sign in again.");
          return;
        }

        setTenantActionState({
          busyTenantId: "",
          message: "",
          error: details.message
        });

        setErrorBanner(details.message);
      }
    },
    [authHeaders, hardResetOwnerSession, loadDashboard, session],
  );

  const handleOpenViewMode = useCallback((tenantId: number | string) => {
    window.open(getViewModeTenantUrl(tenantId), "_blank", "noopener,noreferrer");
  }, []);

  const tenantNames = useMemo(() => tenants.map(getTenantName), [tenants]);
  const issueCount = endpointIssues.length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8 flex flex-col gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-400">
              FlowOps Hidden Owner Layer
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
            </p>
          </div>

          {session ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              <div className="font-semibold">Authenticated owner session</div>
              <div>{session.email}</div>
              <div>{session.role ?? "SUPER_ADMIN"}</div>
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              No active owner session
            </div>
          )}
        </div>

        {errorBanner ? (
          <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-4 text-sm text-rose-100">
            {errorBanner}
          </div>
        ) : null}

        {successBanner ? (
          <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-100">
            {successBanner}
          </div>
        ) : null}

        {!session ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-black/20">
              <h2 className="text-xl font-semibold text-white">Owner sign in</h2>
              <p className="mt-2 text-sm text-slate-400">
                This uses the hidden owner auth route and stores only the real access token returned by the backend.
              </p>

              <form className="mt-6 space-y-4" onSubmit={handleLogin}>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-300" htmlFor="owner-email">
                    Owner email
                  </label>
                  <input
                    id="owner-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="username"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-300" htmlFor="owner-password">
                    Owner password
                  </label>
                  <input
                    id="owner-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loggingIn}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                </button>
              </form>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-black/20">
              <h2 className="text-xl font-semibold text-white">Owner control scope</h2>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  Successful login stores the real owner access token and uses it for every owner route.
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  Tenant action buttons now post to the hidden owner tenant action route.
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  View Mode opens the selected real tenant in a separate browser tab.
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={refreshing}
                className="rounded-2xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? "Refreshing..." : "Refresh dashboard"}
              </button>

              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-rose-400 hover:text-rose-200"
              >
                Clear owner session
              </button>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-sm text-slate-300">
                Endpoint issues: <span className="font-semibold text-white">{issueCount}</span>
              </div>

              {tenantActionState.message ? (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-100">
                  {tenantActionState.message}
                </div>
              ) : null}

              {tenantActionState.error ? (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-100">
                  {tenantActionState.error}
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5">
                <div className="text-sm text-slate-400">Tenants</div>
                <div className="mt-2 text-3xl font-bold text-white">{metrics.tenantCount ?? tenants.length}</div>
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5">
                <div className="text-sm text-slate-400">Active tenants</div>
                <div className="mt-2 text-3xl font-bold text-white">{metrics.activeTenantCount ?? 0}</div>
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5">
                <div className="text-sm text-slate-400">Invoices</div>
                <div className="mt-2 text-3xl font-bold text-white">{metrics.invoiceCount ?? 0}</div>
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5">
                <div className="text-sm text-slate-400">Collections</div>
                <div className="mt-2 text-3xl font-bold text-white">{metrics.collectionCount ?? 0}</div>
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5">
                <div className="text-sm text-slate-400">Users</div>
                <div className="mt-2 text-3xl font-bold text-white">{metrics.userCount ?? 0}</div>
              </div>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-white">Tenant companies</h2>
                  <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                    {tenants.length} loaded
                  </span>
                </div>

                <div className="space-y-4">
                  {tenants.length > 0 ? (
                    tenants.map((tenant) => {
                      const tenantId = String(tenant.id);
                      const isBusy = tenantActionState.busyTenantId === tenantId;
                      const name = getTenantName(tenant);
                      const status = getTenantStatus(tenant);
                      const planName = getPlanName(tenant);

                      return (
                        <div
                          key={tenantId}
                          className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"
                        >
                          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                            <div>
                              <div className="text-sm font-semibold text-white">{name}</div>
                              <div className="mt-1 text-xs uppercase tracking-wide text-cyan-300">
                                {status}
                              </div>
                              <div className="mt-2 text-sm text-slate-300">
                                Plan: {planName}
                              </div>
                              <div className="mt-1 text-sm text-slate-400">
                                Created: {formatDateTime(tenant.createdAt)}
                              </div>
                              {(tenant.contactEmail || tenant.email) ? (
                                <div className="mt-1 text-sm text-slate-400">
                                  {(tenant.contactEmail || tenant.email) as string}
                                </div>
                              ) : null}
                            </div>

                            <div className="grid gap-2 sm:grid-cols-2 xl:w-[360px]">
                              <button
                                type="button"
                                onClick={() => void runTenantAction(tenant.id, "ACTIVATE")}
                                disabled={isBusy}
                                className="rounded-2xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isBusy ? "Working..." : "Activate"}
                              </button>

                              <button
                                type="button"
                                onClick={() => void runTenantAction(tenant.id, "SUSPEND")}
                                disabled={isBusy}
                                className="rounded-2xl bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isBusy ? "Working..." : "Suspend"}
                              </button>

                              <button
                                type="button"
                                onClick={() => void runTenantAction(tenant.id, "DEACTIVATE")}
                                disabled={isBusy}
                                className="rounded-2xl bg-rose-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isBusy ? "Working..." : "Deactivate"}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenViewMode(tenant.id)}
                                disabled={isBusy}
                                className="rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:border-cyan-400 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Open View Mode
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-400">
                      No tenants returned.
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-white">AI alerts</h2>
                  <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                    {aiAlerts.length} loaded
                  </span>
                </div>

                <div className="space-y-3">
                  {aiAlerts.length > 0 ? (
                    aiAlerts.map((alert, index) => {
                      const companyName =
                        alert.companyName ??
                        alert.company?.companyName ??
                        alert.company?.name ??
                        "Unknown company";

                      return (
                        <div
                          key={`${companyName}-${alert.id ?? index}`}
                          className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3"
                        >
                          <div className="text-sm font-semibold text-white">{companyName}</div>
                          <div className="mt-1 text-xs uppercase tracking-wide text-cyan-300">
                            {alert.severity ?? "INFO"}
                          </div>
                          <div className="mt-2 text-sm text-slate-300">
                            {alert.title ?? alert.message ?? "Alert loaded successfully."}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-400">
                      No AI alerts returned.
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-white">Audit trail</h2>
                  <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                    {auditRows.length} loaded
                  </span>
                </div>

                <div className="space-y-3">
                  {auditRows.length > 0 ? (
                    auditRows.slice(0, 12).map((row, index) => (
                      <div
                        key={`${row.id ?? index}-${row.createdAt ?? index}`}
                        className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3"
                      >
                        <div className="text-sm font-semibold text-white">
                          {row.action ?? row.message ?? "Audit event"}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {row.entityType ?? "ENTITY"} {row.entityId ? `#${row.entityId}` : ""}
                        </div>
                        <div className="mt-2 text-sm text-slate-300">
                          {row.message ?? row.actorEmail ?? row.actorName ?? "Audit record loaded successfully."}
                        </div>
                        <div className="mt-2 text-xs text-slate-500">{formatDateTime(row.createdAt)}</div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-400">
                      No audit records returned.
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-white">Plans</h2>
                  <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                    {plans.length} loaded
                  </span>
                </div>

                <div className="space-y-3">
                  {plans.length > 0 ? (
                    plans.map((plan, index) => (
                      <div
                        key={`${plan.id ?? index}-${plan.name ?? "plan"}`}
                        className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3"
                      >
                        <div className="text-sm font-semibold text-white">
                          {plan.name ?? plan.code ?? "Unnamed plan"}
                        </div>
                        <div className="mt-1 text-xs uppercase tracking-wide text-cyan-300">
                          {plan.billingInterval ?? plan.interval ?? "PLAN"}
                        </div>
                        <div className="mt-2 text-sm text-slate-300">
                          {plan.currency ?? "ZAR"} {plan.price ?? plan.amount ?? 0}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-400">
                      No plans returned.
                    </div>
                  )}
                </div>
              </section>
            </div>

            {tenantNames.length > 0 ? (
              <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
                <h2 className="text-xl font-semibold text-white">Loaded tenant names</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {tenantNames.map((name, index) => (
                    <span
                      key={`${name}-${index}`}
                      className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-xs text-slate-300"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            {endpointIssues.length > 0 ? (
              <section className="mt-6 rounded-3xl border border-amber-500/30 bg-amber-500/10 p-6">
                <h2 className="text-xl font-semibold text-amber-100">Endpoint issues</h2>
                <div className="mt-4 space-y-3">
                  {endpointIssues.map((issue, index) => (
                    <div
                      key={`${issue.endpoint}-${index}`}
                      className="rounded-2xl border border-amber-500/20 bg-slate-950/40 px-4 py-3"
                    >
                      <div className="text-sm font-semibold text-white">{issue.endpoint}</div>
                      <div className="mt-1 text-sm text-amber-100">{issue.message}</div>
                      <div className="mt-1 text-xs text-amber-200/80">
                        HTTP status: {issue.status ?? "-"}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}

        {loading ? (
          <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-900/80 p-6 text-sm text-slate-300">
            Restoring hidden owner session...
          </div>
        ) : null}
      </div>
    </div>
  );
}
