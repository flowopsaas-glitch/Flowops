import React, { useEffect, useMemo, useState } from "react";

type CompanyRow = {
  id: number;
  companyId?: number;
  companyName?: string;
  name?: string;
  email?: string | null;
  userCount?: number;
  isActive?: boolean;
  subscriptionPlan?: string | null;
  monthlyPrice?: number | null;
  setupFee?: number | null;
  priceNotes?: string | null;
  enabledFeatures?: string[];
};

type TenantHealthRow = {
  companyId: number;
  companyName: string;
  plan: string;
  isActive: boolean;
  aiStatus: string;
  aiScore: number;
  users: number;
  drivers: number;
  collections: number;
  invoices: number;
  pricingRisk?: {
    risk?: string;
    notes?: string[];
  };
};

type AuditItem = {
  id?: string;
  action?: string;
  createdAt?: string;
  at?: string;
  tenantName?: string;
  companyName?: string;
  meta?: Record<string, unknown>;
  payload?: Record<string, unknown>;
};

type UserRow = {
  id: number;
  email?: string | null;
  role?: string | null;
  roles?: string[] | null;
  name?: string | null;
  isActive?: boolean | null;
  mustChangePassword?: boolean | null;
};

type AiSummary = {
  score?: number;
  status?: string;
  alerts?: string[];
  suggestions?: string[];
  snapshot?: Record<string, unknown>;
};

type PricingRisk = {
  risk?: string;
  notes?: string[];
};

type AutoFillPayload = {
  ok?: boolean;
  recommendedPlan?: string;
  preset?: {
    plan?: string;
    monthlyPrice?: number | null;
    setupFee?: number | null;
    enabledFeatures?: string[];
  };
  pricingRisk?: PricingRisk;
  reason?: string;
};

type RecommendPlanPayload = {
  recommendedPlan?: string;
  reason?: string;
};

const API_BASE =
  (typeof import.meta !== "undefined" &&
    (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL) ||
  (typeof import.meta !== "undefined" &&
    (import.meta as { env?: Record<string, string> }).env?.VITE_API_URL) ||
  "http://localhost:3000/api/v1";

const shellStyle: React.CSSProperties = {
  minHeight: "100vh",
  padding: "22px",
  overflowX: "hidden",
    background:
    "radial-gradient(circle at top left, rgba(74,144,226,0.20), transparent 22%), linear-gradient(180deg, #07111f 0%, #091423 45%, #07111d 100%)",
  color: "#e8eef8",
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const containerStyle: React.CSSProperties = {
  maxWidth: "1880px",
  margin: "0 auto",
  padding: "0 28px",
  width: "100%",
  boxSizing: "border-box",
  display: "grid",
  gap: "22px",
};

const heroStyle: React.CSSProperties = {
  borderRadius: "24px",
  padding: "24px",
  border: "1px solid rgba(140, 170, 210, 0.20)",
  background:
    "linear-gradient(135deg, rgba(17,31,53,0.96), rgba(9,19,35,0.96))",
  boxShadow: "0 24px 60px rgba(0, 0, 0, 0.35)",
};

const cardStyle: React.CSSProperties = {
  borderRadius: "22px",
  padding: "18px",
  border: "1px solid rgba(140, 170, 210, 0.16)",
  background: "rgba(11, 24, 42, 0.90)",
  boxShadow: "0 12px 30px rgba(0, 0, 0, 0.22)",
};

const mutedCardStyle: React.CSSProperties = {
  ...cardStyle,
  background: "rgba(12, 22, 38, 0.72)",
};

const grid2Style: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: "18px",
};

const grid3Style: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "14px",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#8ea7c8",
  marginBottom: "8px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: "14px",
  border: "1px solid rgba(141, 168, 207, 0.22)",
  background: "rgba(7, 17, 29, 0.95)",
  color: "#eef4ff",
  padding: "12px 14px",
  outline: "none",
  fontSize: "14px",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: "96px",
  resize: "vertical",
};

const buttonBase: React.CSSProperties = {
  border: "none",
  borderRadius: "14px",
  padding: "11px 14px",
  fontSize: "14px",
  fontWeight: 700,
  cursor: "pointer",
  transition: "transform 0.15s ease, opacity 0.15s ease",
};

const primaryButton: React.CSSProperties = {
  ...buttonBase,
  background: "linear-gradient(135deg, #59a9ff, #7d6bff)",
  color: "#031120",
};

const secondaryButton: React.CSSProperties = {
  ...buttonBase,
  background: "rgba(20, 38, 62, 0.95)",
  color: "#dbe7ff",
  border: "1px solid rgba(141, 168, 207, 0.18)",
};

const dangerButton: React.CSSProperties = {
  ...buttonBase,
  background: "linear-gradient(135deg, #ff748f, #ff4f5f)",
  color: "#fff",
};

const badgeBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  borderRadius: "999px",
  padding: "6px 10px",
  fontSize: "12px",
  fontWeight: 800,
  letterSpacing: "0.03em",
};

const dividerStyle: React.CSSProperties = {
  height: "1px",
  background: "rgba(148, 170, 204, 0.12)",
  margin: "14px 0",
};

const glowPanelStyle: React.CSSProperties = {
  borderRadius: "22px",
  padding: "18px",
  border: "1px solid rgba(106, 162, 255, 0.22)",
  background:
    "linear-gradient(135deg, rgba(18,34,58,0.98), rgba(9,18,33,0.96))",
  boxShadow: "0 18px 40px rgba(0,0,0,0.28)",
};

const planCompareCardStyle: React.CSSProperties = {
  borderRadius: "20px",
  padding: "18px",
  border: "1px solid rgba(130, 164, 210, 0.18)",
  background:
    "linear-gradient(135deg, rgba(13,27,47,0.98), rgba(8,17,31,0.96))",
  boxShadow: "0 14px 28px rgba(0,0,0,0.20)",
};

const metricTileStyle: React.CSSProperties = {
  borderRadius: "16px",
  padding: "14px",
  border: "1px solid rgba(143, 168, 207, 0.16)",
  background: "rgba(8, 18, 31, 0.86)",
  minHeight: "118px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
};

const selectedHealthCardStyle: React.CSSProperties = {
  borderRadius: "18px",
  padding: "16px",
  border: "1px solid rgba(111, 157, 233, 0.34)",
  background:
    "linear-gradient(135deg, rgba(20,40,72,0.98), rgba(13,27,48,0.98))",
  color: "#eef5ff",
  boxShadow: "0 18px 34px rgba(0,0,0,0.22)",
};

const selectedHealthMutedText: React.CSSProperties = {
  color: "rgba(227, 239, 255, 0.82)",
};


const commandBarStyle: React.CSSProperties = {
  borderRadius: "24px",
  padding: "18px",
  border: "1px solid rgba(96, 152, 255, 0.20)",
  background:
    "linear-gradient(135deg, rgba(8,20,40,0.98), rgba(7,16,31,0.96))",
  boxShadow: "0 24px 54px rgba(0,0,0,0.28)",
};

const neonTileStyle: React.CSSProperties = {
  borderRadius: "18px",
  padding: "14px",
  border: "1px solid rgba(102, 155, 255, 0.18)",
  background: "rgba(9, 22, 42, 0.88)",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.02)",
};

const miniActionButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(118, 169, 255, 0.26)",
  background: "linear-gradient(180deg, rgba(116,166,255,0.28), rgba(72,118,214,0.20))",
  color: "#eaf2ff",
  borderRadius: "999px",
  padding: "10px 14px",
  fontSize: "12px",
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  cursor: "pointer",
  boxShadow: "0 8px 20px rgba(60,110,210,0.18)",
};

const sectionTitleRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  marginBottom: "12px",
};

const futuristicDividerStyle: React.CSSProperties = {
  height: "1px",
  background: "linear-gradient(90deg, rgba(90,140,255,0), rgba(90,140,255,0.28), rgba(90,140,255,0))",
  margin: "14px 0",
};

const bridgeHeaderStyle: React.CSSProperties = {
  borderRadius: "26px",
  padding: "18px",
  border: "1px solid rgba(98, 154, 255, 0.22)",
  background:
    "linear-gradient(135deg, rgba(8,22,42,0.985), rgba(6,15,31,0.97))",
  boxShadow: "0 26px 56px rgba(0,0,0,0.30)",
};

const bridgeTopGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.2fr 0.9fr 0.9fr 0.9fr 1.4fr",
  gap: "12px",
  alignItems: "stretch",
};

const bridgeTileStyle: React.CSSProperties = {
  borderRadius: "18px",
  padding: "14px",
  border: "1px solid rgba(115, 166, 255, 0.16)",
  background: "rgba(10, 24, 45, 0.88)",
  minHeight: "108px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
};

const bridgeWideTileStyle: React.CSSProperties = {
  ...bridgeTileStyle,
  minHeight: "108px",
};

const bridgeActionRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  alignItems: "center",
};

const bridgeActionPrimaryStyle: React.CSSProperties = {
  ...miniActionButtonStyle,
  background: "linear-gradient(180deg, rgba(120,170,255,0.34), rgba(70,116,216,0.22))",
};

const bridgeActionGhostStyle: React.CSSProperties = {
  ...miniActionButtonStyle,
  background: "rgba(13, 28, 52, 0.90)",
};

function valueText(value: unknown, fallback = "—"): string {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function numValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function arrayValue<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function money(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return `R ${parsed.toLocaleString("en-ZA")}`;
}

function formatDate(value: unknown): string {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function riskBadgeStyle(risk: string | undefined): React.CSSProperties {
  const safe = String(risk || "").toUpperCase();
  if (safe === "HIGH" || safe === "RISK") {
    return {
      ...badgeBase,
      background: "rgba(255, 91, 114, 0.18)",
      color: "#ffb7c3",
      border: "1px solid rgba(255, 110, 130, 0.28)",
    };
  }
  if (safe === "WATCH" || safe === "MEDIUM") {
    return {
      ...badgeBase,
      background: "rgba(255, 196, 84, 0.18)",
      color: "#ffd98a",
      border: "1px solid rgba(255, 196, 84, 0.26)",
    };
  }
  return {
    ...badgeBase,
    background: "rgba(87, 220, 167, 0.18)",
    color: "#99efcc",
    border: "1px solid rgba(87, 220, 167, 0.26)",
  };
}

async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T | null> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const data = await readJson<T>(response);

  if (!response.ok) {
    const message =
      (data as { message?: string } | null)?.message ||
      `Request failed (${response.status})`;
    throw new Error(message);
  }

  return data;
}

export default function OwnerAccessManager() {
  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");

  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number>(1);
  const [tenantUsers, setTenantUsers] = useState<UserRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number>(0);

  const [tenantHealthRows, setTenantHealthRows] = useState<TenantHealthRow[]>([]);
  const [auditTimeline, setAuditTimeline] = useState<AuditItem[]>([]);
  const [aiSummary, setAiSummary] = useState<AiSummary | null>(null);
  const [autoFill, setAutoFill] = useState<AutoFillPayload | null>(null);
  const [recommendedPlan, setRecommendedPlan] = useState<string>("");
  const [recommendedPlanReason, setRecommendedPlanReason] = useState<string>("");

  const [createAdminName, setCreateAdminName] = useState<string>("");
  const [createAdminEmail, setCreateAdminEmail] = useState<string>("");
  const [createAdminPassword, setCreateAdminPassword] = useState<string>("");

  const [resetPassword, setResetPassword] = useState<string>("");
  const [ownerPassword, setOwnerPassword] = useState<string>("");

  const selectedCompany = useMemo(() => {
    return (
      companies.find((item: CompanyRow) => Number(item.id) === Number(selectedCompanyId)) ||
      null
    );
  }, [companies, selectedCompanyId]);

  const selectedHealth = useMemo(() => {
    return (
      tenantHealthRows.find(
        (item: TenantHealthRow) => Number(item.companyId) === Number(selectedCompanyId)
      ) || null
    );
  }, [tenantHealthRows, selectedCompanyId]);

  const selectedUser = useMemo(() => {
    return (
      tenantUsers.find((item: UserRow) => Number(item.id) === Number(selectedUserId)) || null
    );
  }, [tenantUsers, selectedUserId]);

  async function loadCompanies(): Promise<void> {
    const rows = (await api<CompanyRow[]>("/owner/access/companies")) || [];
    setCompanies(rows);

    if (rows.length > 0) {
      const nextId = rows.some((item: CompanyRow) => Number(item.id) === Number(selectedCompanyId))
        ? selectedCompanyId
        : Number(rows[0].id);
      setSelectedCompanyId(nextId);
    }
  }

  async function loadTenantHealth(): Promise<void> {
    const payload =
      (await api<{ rows?: TenantHealthRow[] }>("/owner/access/tenant-health")) || {};
    setTenantHealthRows(arrayValue<TenantHealthRow>(payload.rows));
  }

  async function loadAuditTimeline(): Promise<void> {
    const payload =
      (await api<{ items?: AuditItem[] }>("/owner/access/audit-timeline")) || {};
    setAuditTimeline(arrayValue<AuditItem>(payload.items));
  }

  async function loadUsers(companyId: number): Promise<void> {
    if (!companyId) {
      setTenantUsers([]);
      setSelectedUserId(0);
      return;
    }
    const rows =
      (await api<UserRow[]>(`/owner/access/company/${companyId}/users`)) || [];
    setTenantUsers(rows);
    setSelectedUserId(rows.length > 0 ? Number(rows[0].id) : 0);
  }

  async function loadAiSummary(companyId: number): Promise<void> {
    if (!companyId) {
      setAiSummary(null);
      return;
    }
    const payload =
      (await api<AiSummary>(`/owner/access/company/${companyId}/ai-summary`)) || null;
    setAiSummary(payload);
  }

  async function loadAutoFill(companyId: number): Promise<void> {
    if (!companyId) {
      setAutoFill(null);
      return;
    }
    const payload =
      (await api<AutoFillPayload>(`/owner/access/company/${companyId}/auto-fill`)) || null;
    setAutoFill(payload);
  }

  async function loadRecommendedPlan(companyId: number): Promise<void> {
    if (!companyId) {
      setRecommendedPlan("");
      setRecommendedPlanReason("");
      return;
    }
    const payload =
      (await api<RecommendPlanPayload>(
        `/owner/access/company/${companyId}/recommend-plan`
      )) || null;

    setRecommendedPlan(valueText(payload?.recommendedPlan, ""));
    setRecommendedPlanReason(valueText(payload?.reason, ""));
  }

  async function refreshEverything(companyId?: number): Promise<void> {
    const id = Number(companyId || selectedCompanyId || 0);
    await Promise.all([
      loadCompanies(),
      loadTenantHealth(),
      loadAuditTimeline(),
    ]);
    if (id) {
      await Promise.all([
        loadUsers(id),
        loadAiSummary(id),
        loadAutoFill(id),
        loadRecommendedPlan(id),
      ]);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function boot(): Promise<void> {
      try {
        setLoading(true);
        setError("");
        setMessage("");

        const companiesPayload =
          (await api<CompanyRow[]>("/owner/access/companies")) || [];

        if (!mounted) return;

        setCompanies(companiesPayload);
        const initialCompanyId =
          companiesPayload.length > 0 ? Number(companiesPayload[0].id) : 0;
        setSelectedCompanyId(initialCompanyId);

        const [healthPayload, auditPayload] = await Promise.all([
          api<{ rows?: TenantHealthRow[] }>("/owner/access/tenant-health"),
          api<{ items?: AuditItem[] }>("/owner/access/audit-timeline"),
        ]);

        if (!mounted) return;

        setTenantHealthRows(arrayValue<TenantHealthRow>(healthPayload?.rows));
        setAuditTimeline(arrayValue<AuditItem>(auditPayload?.items));

        if (initialCompanyId) {
          const [usersPayload, aiPayload, autofillPayload, planPayload] =
            await Promise.all([
              api<UserRow[]>(`/owner/access/company/${initialCompanyId}/users`),
              api<AiSummary>(
                `/owner/access/company/${initialCompanyId}/ai-summary`
              ),
              api<AutoFillPayload>(
                `/owner/access/company/${initialCompanyId}/auto-fill`
              ),
              api<RecommendPlanPayload>(
                `/owner/access/company/${initialCompanyId}/recommend-plan`
              ),
            ]);

          if (!mounted) return;

          const users = usersPayload || [];
          setTenantUsers(users);
          setSelectedUserId(users.length > 0 ? Number(users[0].id) : 0);
          setAiSummary(aiPayload || null);
          setAutoFill(autofillPayload || null);
          setRecommendedPlan(valueText(planPayload?.recommendedPlan, ""));
          setRecommendedPlanReason(valueText(planPayload?.reason, ""));
        }
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load owner data.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void boot();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedCompanyId) return;

    let alive = true;

    async function hydrate(): Promise<void> {
      try {
        setError("");
        const [usersPayload, aiPayload, autofillPayload, planPayload] =
          await Promise.all([
            api<UserRow[]>(`/owner/access/company/${selectedCompanyId}/users`),
            api<AiSummary>(`/owner/access/company/${selectedCompanyId}/ai-summary`),
            api<AutoFillPayload>(`/owner/access/company/${selectedCompanyId}/auto-fill`),
            api<RecommendPlanPayload>(
              `/owner/access/company/${selectedCompanyId}/recommend-plan`
            ),
          ]);

        if (!alive) return;

        const users = usersPayload || [];
        setTenantUsers(users);
        setSelectedUserId((prev: number) => {
          const stillExists = users.some((item: UserRow) => Number(item.id) === Number(prev));
          return stillExists ? prev : users.length > 0 ? Number(users[0].id) : 0;
        });
        setAiSummary(aiPayload || null);
        setAutoFill(autofillPayload || null);
        setRecommendedPlan(valueText(planPayload?.recommendedPlan, ""));
        setRecommendedPlanReason(valueText(planPayload?.reason, ""));
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Failed to hydrate selected tenant.");
      }
    }

    void hydrate();

    return () => {
      alive = false;
    };
  }, [selectedCompanyId]);

  async function perform(
    fn: () => Promise<void>,
    successMessage: string
  ): Promise<void> {
    try {
      setBusy(true);
      setError("");
      setMessage("");
      await fn();
      setMessage(successMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateTenantAdmin(): Promise<void> {
    if (!selectedCompanyId) return;
    await perform(async () => {
      await api(`/owner/access/company/${selectedCompanyId}/admins`, {
        method: "POST",
        body: JSON.stringify({
          name: createAdminName,
          email: createAdminEmail,
          password: createAdminPassword,
        }),
      });

      setCreateAdminName("");
      setCreateAdminEmail("");
      setCreateAdminPassword("");
      await refreshEverything(selectedCompanyId);
    }, "Tenant admin created successfully.");
  }

  async function handleResetPassword(): Promise<void> {
    if (!selectedUserId) return;
    await perform(async () => {
      await api(`/owner/access/users/${selectedUserId}/password`, {
        method: "PATCH",
        body: JSON.stringify({ password: resetPassword }),
      });
      setResetPassword("");
      await refreshEverything(selectedCompanyId);
    }, "Tenant user password updated.");
  }

  async function handleDeleteUser(): Promise<void> {
    if (!selectedUserId) return;
    await perform(async () => {
      await api(`/owner/access/users/${selectedUserId}/delete`, {
        method: "POST",
      });
      await refreshEverything(selectedCompanyId);
    }, "Selected tenant user deleted.");
  }

  async function handleToggleDemo(): Promise<void> {
    if (!selectedCompanyId) return;
    await perform(async () => {
      await api(`/owner/access/company/${selectedCompanyId}/demo`, {
        method: "PATCH",
        body: JSON.stringify({
          enabled: !(selectedCompany?.subscriptionPlan === "DEMO"),
        }),
      });
      await refreshEverything(selectedCompanyId);
    }, "Demo mode updated.");
  }

  async function handleApplyPreset(plan: string): Promise<void> {
    if (!selectedCompanyId) return;
    await perform(async () => {
      await api(`/owner/access/company/${selectedCompanyId}/apply-plan-preset`, {
        method: "POST",
        body: JSON.stringify({ plan }),
      });
      await refreshEverything(selectedCompanyId);
    }, `${plan} preset applied successfully.`);
  }

  async function handleSaveSubscriptionOverride(): Promise<void> {
    if (!selectedCompanyId) return;
    await perform(async () => {
      await api(`/owner/access/company/${selectedCompanyId}/subscription`, {
        method: "PATCH",
        body: JSON.stringify({
          subscriptionPlan: autoFill?.preset?.plan || recommendedPlan || selectedCompany?.subscriptionPlan || "STARTER",
          enabledFeatures:
            autoFill?.preset?.enabledFeatures ||
            selectedCompany?.enabledFeatures ||
            [],
          isActive: true,
        }),
      });
      await refreshEverything(selectedCompanyId);
    }, "Subscription override saved.");
  }

  async function handleRefreshAutoFill(): Promise<void> {
    if (!selectedCompanyId) return;
    await perform(async () => {
      await Promise.all([
        loadAutoFill(selectedCompanyId),
        loadRecommendedPlan(selectedCompanyId),
        loadAiSummary(selectedCompanyId),
        loadTenantHealth(),
      ]);
    }, "AI recommendation refreshed.");
  }

  async function handleChangeOwnerPassword(): Promise<void> {
    await perform(async () => {
      await api("/owner/access/change-owner-password", {
        method: "POST",
        body: JSON.stringify({ password: ownerPassword }),
      });
      setOwnerPassword("");
      await loadAuditTimeline();
    }, "Hidden owner password updated.");
  }

  const healthSummary = useMemo(() => {
    const total = tenantHealthRows.length;
    const actionNeeded = tenantHealthRows.filter(
      (item: TenantHealthRow) =>
        String(item.pricingRisk?.risk || "").toUpperCase() === "HIGH"
    ).length;
    const watch = tenantHealthRows.filter(
      (item: TenantHealthRow) =>
        String(item.aiStatus || "").toUpperCase() === "WATCH"
    ).length;
    const active = tenantHealthRows.filter((item: TenantHealthRow) => item.isActive)
      .length;

    return { total, actionNeeded, watch, active };
  }, [tenantHealthRows]);

  const currentPlanText = valueText(selectedCompany?.subscriptionPlan, "UNSET");
  const recommendedPlanText = valueText(
    autoFill?.recommendedPlan || recommendedPlan,
    "NO RECOMMENDATION"
  );
  const planGap =
    currentPlanText && recommendedPlanText && currentPlanText !== "UNSET"
      ? currentPlanText === recommendedPlanText
        ? "Current plan matches the AI recommendation."
        : `AI sees a plan gap: current ${currentPlanText} vs recommended ${recommendedPlanText}.`
      : "Owner review needed before locking subscription direction.";

  const riskText = valueText(
    autoFill?.pricingRisk?.risk || selectedHealth?.pricingRisk?.risk,
    "WATCH"
  );

  const tenantNameText = valueText(
    selectedCompany?.companyName || selectedCompany?.name,
    "No tenant selected"
  );

  if (loading) {
    return (
      <div style={shellStyle}>
        <div style={containerStyle}>
          <div style={heroStyle}>
            <div style={{ fontSize: "30px", fontWeight: 900 }}>
              Owner Access v4 + AI Subscription Intelligence
            </div>
            <div style={{ marginTop: "8px", color: "#9bb0d1" }}>
              Loading premium owner console...
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <div style={containerStyle}>
        <div style={heroStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "16px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 800,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#8cbcff",
                }}
              >
                FlowOps Hidden Owner Layer
              </div>
              <div style={{ fontSize: "34px", fontWeight: 900, marginTop: "6px" }}>
                Owner Access v4 + AI Subscription Intelligence
              </div>
              <div
                style={{
                  color: "#98adc9",
                  marginTop: "10px",
                  maxWidth: "980px",
                  lineHeight: 1.6,
                }}
              >
                Premium owner console for tenant health, AI subscription guidance,
                plan presets, audit visibility, tenant admin management, password
                control, and hidden platform supervision above all courier tenants.
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gap: "10px",
                minWidth: "280px",
                justifyItems: "stretch",
              }}
            >
              <button
                style={secondaryButton}
                onClick={() => {
                  void perform(async () => {
                    await refreshEverything(selectedCompanyId);
                  }, "Owner dashboard refreshed.");
                }}
                disabled={busy}
              >
                Refresh Owner Dashboard
              </button>
            </div>
          </div>

          {(message || error) && (
            <div style={{ marginTop: "16px" }}>
              {message ? (
                <div
                  style={{
                    borderRadius: "14px",
                    padding: "12px 14px",
                    background: "rgba(72, 197, 151, 0.15)",
                    color: "#aef0d0",
                    border: "1px solid rgba(72, 197, 151, 0.25)",
                  }}
                >
                  {message}
                </div>
              ) : null}

              {error ? (
                <div
                  style={{
                    borderRadius: "14px",
                    padding: "12px 14px",
                    background: "rgba(255, 91, 114, 0.15)",
                    color: "#ffc0ca",
                    border: "1px solid rgba(255, 91, 114, 0.24)",
                    marginTop: message ? "10px" : 0,
                  }}
                >
                  {error}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div style={grid3Style}>
          <div style={cardStyle}>
            <div style={labelStyle}>Total Tenant Rows</div>
            <div style={{ fontSize: "30px", fontWeight: 900 }}>
              {healthSummary.total}
            </div>
            <div style={{ color: "#8fa8ca", marginTop: "8px" }}>
              Tenants visible to the hidden FlowOps owner layer.
            </div>
          </div>

          <div style={cardStyle}>
            <div style={labelStyle}>Action Needed</div>
            <div style={{ fontSize: "30px", fontWeight: 900 }}>
              {healthSummary.actionNeeded}
            </div>
            <div style={{ color: "#8fa8ca", marginTop: "8px" }}>
              Tenants currently flagged with high pricing or control risk.
            </div>
          </div>

          <div style={cardStyle}>
            <div style={labelStyle}>Watchlist</div>
            <div style={{ fontSize: "30px", fontWeight: 900 }}>
              {healthSummary.watch}
            </div>
            <div style={{ color: "#8fa8ca", marginTop: "8px" }}>
              AI-supervised tenants needing closer observation.
            </div>
          </div>

          <div style={cardStyle}>
            <div style={labelStyle}>Active Tenants</div>
            <div style={{ fontSize: "30px", fontWeight: 900 }}>
              {healthSummary.active}
            </div>
            <div style={{ color: "#8fa8ca", marginTop: "8px" }}>
              Company rows currently marked active at platform level.
            </div>
          </div>
        </div>

        <div style={grid2Style}>
          <div style={glowPanelStyle}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "14px",
                alignItems: "stretch",
              }}
            >
              <div style={metricTileStyle}>
                <div style={labelStyle}>Current Applied Plan</div>
                <div style={{ fontSize: "22px", fontWeight: 900 }}>
                  {currentPlanText}
                </div>
                <div style={{ color: "#94acd0", marginTop: "6px" }}>
                  Live tenant subscription state.
                </div>
              </div>

              <div style={metricTileStyle}>
                <div style={labelStyle}>AI Recommended Plan</div>
                <div style={{ fontSize: "22px", fontWeight: 900 }}>
                  {recommendedPlanText}
                </div>
                <div style={{ color: "#94acd0", marginTop: "6px" }}>
                  AI guidance from tenant size and pricing guardrails.
                </div>
              </div>

              <div style={metricTileStyle}>
                <div style={labelStyle}>Pricing Risk</div>
                <div style={riskBadgeStyle(autoFill?.pricingRisk?.risk || selectedHealth?.pricingRisk?.risk)}>
                  {valueText(autoFill?.pricingRisk?.risk || selectedHealth?.pricingRisk?.risk, "WATCH")}
                </div>
                <div style={{ color: "#ffcaaf", marginTop: "10px", lineHeight: 1.5 }}>
                  {arrayValue<string>(autoFill?.pricingRisk?.notes).join(" • ") ||
                    arrayValue<string>(selectedHealth?.pricingRisk?.notes).join(" • ") ||
                    "No pricing notes returned yet."}
                </div>
              </div>

              <div style={metricTileStyle}>
                <div style={labelStyle}>Owner Decision Gap</div>
                <div style={{ fontWeight: 800, fontSize: "15px", lineHeight: 1.5 }}>
                  {planGap}
                </div>
                <div style={{ color: "#94acd0", marginTop: "6px" }}>
                  Use presets or subscription save to align tenant control.
                </div>
              </div>
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: "18px", fontWeight: 900 }}>
              AI Tenant Health Overview
            </div>
            <div style={{ color: "#90a8ca", marginTop: "6px" }}>
              AI score, status, plan, usage footprint, and pricing risk.
            </div>

            <div style={{ marginTop: "16px", display: "grid", gap: "12px" }}>
              {tenantHealthRows.length === 0 ? (
                <div style={{ color: "#90a8ca" }}>No tenant health rows found.</div>
              ) : (
                tenantHealthRows.map((row: TenantHealthRow) => {
                  const isSelected =
                    Number(row.companyId) === Number(selectedCompanyId);

                  return (
                    <button
                      key={row.companyId}
                      onClick={() => setSelectedCompanyId(Number(row.companyId))}
                      style={{
                        ...(isSelected ? selectedHealthCardStyle : mutedCardStyle),
                        textAlign: "left",
                        cursor: "pointer",
                        border: isSelected
                          ? selectedHealthCardStyle.border
                          : mutedCardStyle.border,
                        background: isSelected
                          ? selectedHealthCardStyle.background
                          : mutedCardStyle.background,
                        color: isSelected ? "#eef5ff" : "#e8eef8",
                        boxShadow: isSelected
                          ? selectedHealthCardStyle.boxShadow
                          : "none",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "10px",
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "17px", fontWeight: 900 }}>
                            {valueText(row.companyName)}
                          </div>
                          <div
                            style={{
                              color: isSelected ? "#d9e8ff" : "#90a8ca",
                              marginTop: "4px",
                              fontWeight: isSelected ? 700 : 400,
                            }}
                          >
                            Plan {valueText(row.plan)} · Users {numValue(row.users)} ·
                            Score {numValue(row.aiScore)}
                          </div>
                        </div>

                        <div style={riskBadgeStyle(row.pricingRisk?.risk || row.aiStatus)}>
                          {valueText(row.pricingRisk?.risk || row.aiStatus, "WATCH")}
                        </div>
                      </div>

                      <div style={dividerStyle} />

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                          gap: "12px",
                          marginTop: "2px",
                        }}
                      >
                        <div>
                          <div style={labelStyle}>Drivers</div>
                          <div style={{ fontWeight: 800 }}>{numValue(row.drivers)}</div>
                        </div>
                        <div>
                          <div style={labelStyle}>Collections</div>
                          <div style={{ fontWeight: 800 }}>
                            {numValue(row.collections)}
                          </div>
                        </div>
                        <div>
                          <div style={labelStyle}>Invoices</div>
                          <div style={{ fontWeight: 800 }}>{numValue(row.invoices)}</div>
                        </div>
                        <div>
                          <div style={labelStyle}>Status</div>
                          <div style={{ fontWeight: 800 }}>
                            {row.isActive ? "ACTIVE" : "INACTIVE"}
                          </div>
                        </div>
                      </div>

                      {arrayValue<string>(row.pricingRisk?.notes).length > 0 ? (
                        <div
                          style={{
                            marginTop: "12px",
                            color: isSelected ? "#f8d2b4" : "#ffcaaf",
                            lineHeight: 1.55,
                            fontSize: "13px",
                            fontWeight: isSelected ? 600 : 400,
                          }}
                        >
                          {arrayValue<string>(row.pricingRisk?.notes).join(" • ")}
                        </div>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: "18px", fontWeight: 900 }}>
              Selected Tenant Command
            </div>
            <div style={{ color: "#90a8ca", marginTop: "6px" }}>
              Target company selection, live plan state, and quick owner actions.
            </div>

            <div style={{ marginTop: "16px" }}>
              <label style={labelStyle}>Select Tenant Company</label>
              <select
                value={selectedCompanyId}
                onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                  setSelectedCompanyId(Number(event.target.value))
                }
                style={inputStyle}
              >
                {companies.map((company: CompanyRow) => (
                  <option key={company.id} value={company.id}>
                    {valueText(company.companyName || company.name)} ·{" "}
                    {valueText(company.subscriptionPlan, "NO PLAN")}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginTop: "16px", display: "grid", gap: "12px" }}>
              <div style={{ ...planCompareCardStyle, minHeight: "360px", width: "100%" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                  <div>
                    <div style={labelStyle}>Selected Company</div>
                    <div style={{ fontSize: "22px", fontWeight: 900 }}>
                      {valueText(selectedCompany?.companyName || selectedCompany?.name)}
                    </div>
                    <div style={{ color: "#9ab0cf", marginTop: "8px" }}>
                      Email {valueText(selectedCompany?.email)} · Users {numValue(selectedCompany?.userCount)}
                    </div>
                  </div>

                  <div style={riskBadgeStyle(selectedHealth?.pricingRisk?.risk || autoFill?.pricingRisk?.risk)}>
                    {valueText(selectedHealth?.pricingRisk?.risk || autoFill?.pricingRisk?.risk, "WATCH")}
                  </div>
                </div>

                <div style={dividerStyle} />

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: "12px",
                    alignItems: "stretch",
                  }}
                >
                  <div style={metricTileStyle}>
                    <div style={labelStyle}>Current Plan</div>
                    <div style={{ fontWeight: 900, fontSize: "18px" }}>
                      {currentPlanText}
                    </div>
                  </div>

                  <div style={metricTileStyle}>
                    <div style={labelStyle}>AI Recommended</div>
                    <div style={{ fontWeight: 900, fontSize: "18px" }}>
                      {recommendedPlanText}
                    </div>
                  </div>

                  <div style={metricTileStyle}>
                    <div style={labelStyle}>Monthly</div>
                    <div style={{ fontWeight: 900 }}>{money(selectedCompany?.monthlyPrice)}</div>
                  </div>

                  <div style={metricTileStyle}>
                    <div style={labelStyle}>Setup Fee</div>
                    <div style={{ fontWeight: 900 }}>{money(selectedCompany?.setupFee)}</div>
                  </div>

                  <div style={metricTileStyle}>
                    <div style={labelStyle}>Features</div>
                    <div style={{ fontWeight: 900 }}>
                      {arrayValue<string>(selectedCompany?.enabledFeatures).length}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: "12px",
                    borderRadius: "14px",
                    padding: "12px 14px",
                    background: "rgba(87, 136, 255, 0.10)",
                    color: "#cfe0ff",
                    lineHeight: 1.6,
                  }}
                >
                  {planGap}
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  style={secondaryButton}
                  onClick={() => void handleToggleDemo()}
                  disabled={busy || !selectedCompanyId}
                >
                  Toggle Demo Subscription
                </button>

                <button
                  style={secondaryButton}
                  onClick={() => void handleSaveSubscriptionOverride()}
                  disabled={busy || !selectedCompanyId}
                >
                  Save Current Subscription State
                </button>
              </div>
            </div>
          </div>
        </div>

        <div style={grid2Style}>
          <div style={cardStyle}>
            <div style={{ fontSize: "18px", fontWeight: 900 }}>
              AI Subscription Intelligence
            </div>
            <div style={{ color: "#90a8ca", marginTop: "6px" }}>
              Auto-fill recommendation, pricing risk, suggested plan, and AI reasoning.
            </div>

            <div style={{ marginTop: "16px", display: "grid", gap: "12px" }}>
              <div style={mutedCardStyle}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "10px",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div style={labelStyle}>AI Auto-Fill Recommendation</div>
                    <div style={{ fontSize: "20px", fontWeight: 900 }}>
                      {valueText(autoFill?.recommendedPlan || autoFill?.preset?.plan)}
                    </div>
                  </div>
                  <button
                    style={secondaryButton}
                    onClick={() => void handleRefreshAutoFill()}
                    disabled={busy || !selectedCompanyId}
                  >
                    Refresh AI Recommendation
                  </button>
                </div>

                <div style={{ color: "#9ab0cf", marginTop: "10px", lineHeight: 1.6 }}>
                  {valueText(autoFill?.reason, "No AI recommendation reason found.")}
                </div>

                <div style={dividerStyle} />

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: "12px",
                  }}
                >
                  <div>
                    <div style={labelStyle}>Suggested Monthly</div>
                    <div style={{ fontWeight: 900 }}>
                      {money(autoFill?.preset?.monthlyPrice)}
                    </div>
                  </div>
                  <div>
                    <div style={labelStyle}>Suggested Setup Fee</div>
                    <div style={{ fontWeight: 900 }}>
                      {money(autoFill?.preset?.setupFee)}
                    </div>
                  </div>
                  <div>
                    <div style={labelStyle}>AI Plan</div>
                    <div style={{ fontWeight: 900 }}>
                      {valueText(recommendedPlan || autoFill?.recommendedPlan)}
                    </div>
                  </div>
                  <div>
                    <div style={labelStyle}>Pricing Risk</div>
                    <div style={riskBadgeStyle(autoFill?.pricingRisk?.risk)}>
                      {valueText(autoFill?.pricingRisk?.risk, "WATCH")}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: "12px", color: "#ffcaaf", lineHeight: 1.6 }}>
                  {arrayValue<string>(autoFill?.pricingRisk?.notes).join(" • ") || "No pricing risk notes returned."}
                </div>
              </div>

              <div style={mutedCardStyle}>
                <div style={labelStyle}>Recommended Plan Reasoning</div>
                <div style={{ fontWeight: 800, fontSize: "16px" }}>
                  {valueText(recommendedPlan || autoFill?.recommendedPlan, "NO RECOMMENDATION")}
                </div>
                <div style={{ color: "#9ab0cf", marginTop: "8px", lineHeight: 1.6 }}>
                  {valueText(recommendedPlanReason, "No recommendation reasoning returned.")}
                </div>
              </div>

              <div style={mutedCardStyle}>
                <div style={labelStyle}>Suggested Features</div>
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                    marginTop: "4px",
                  }}
                >
                  {arrayValue<string>(autoFill?.preset?.enabledFeatures).length > 0 ? (
                    arrayValue<string>(autoFill?.preset?.enabledFeatures).map((feature: string) => (
                      <span key={feature} style={riskBadgeStyle("OK")}>
                        {feature}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: "#90a8ca" }}>No feature recommendation yet.</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: "18px", fontWeight: 900 }}>
              Plan Presets + Rapid Activation
            </div>
            <div style={{ color: "#90a8ca", marginTop: "6px" }}>
              Fast owner controls for Starter, Growth, Pro, and Enterprise rollout.
            </div>

            <div style={{ marginTop: "16px", display: "grid", gap: "12px" }}>
              {[
                {
                  plan: "STARTER",
                  desc: "Lean starter package for smaller tenants.",
                },
                {
                  plan: "GROWTH",
                  desc: "Balanced package for growing courier tenants.",
                },
                {
                  plan: "PRO",
                  desc: "Advanced package with bigger operational footprint.",
                },
                {
                  plan: "ENTERPRISE",
                  desc: "Top-level package for premium tenant expansion.",
                },
              ].map((item: { plan: string; desc: string }) => (
                <div key={item.plan} style={mutedCardStyle}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "10px",
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "16px", fontWeight: 900 }}>
                        {item.plan}
                      </div>
                      <div style={{ color: "#9ab0cf", marginTop: "6px" }}>
                        {item.desc}
                      </div>
                    </div>
                    <button
                      style={primaryButton}
                      onClick={() => void handleApplyPreset(item.plan)}
                      disabled={busy || !selectedCompanyId}
                    >
                      Apply {item.plan}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={grid2Style}>
          <div style={cardStyle}>
            <div style={{ fontSize: "18px", fontWeight: 900 }}>
              AI Tenant Intelligence Snapshot
            </div>
            <div style={{ color: "#90a8ca", marginTop: "6px" }}>
              Live AI status, alerts, suggestions, and tenant snapshot.
            </div>

            <div style={{ marginTop: "16px", display: "grid", gap: "12px" }}>
              <div style={mutedCardStyle}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "10px",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div style={labelStyle}>AI Status</div>
                    <div style={{ fontSize: "22px", fontWeight: 900 }}>
                      {valueText(aiSummary?.status, selectedHealth?.aiStatus || "WATCH")}
                    </div>
                  </div>
                  <div style={riskBadgeStyle(aiSummary?.status || selectedHealth?.aiStatus)}>
                    Score {numValue(aiSummary?.score, numValue(selectedHealth?.aiScore, 0))}
                  </div>
                </div>

                <div style={dividerStyle} />

                <div style={labelStyle}>AI Alerts</div>
                <div style={{ display: "grid", gap: "8px" }}>
                  {arrayValue<string>(aiSummary?.alerts).length > 0 ? (
                    arrayValue<string>(aiSummary?.alerts).map((item: string, index: number) => (
                      <div
                        key={`${item}-${index}`}
                        style={{
                          borderRadius: "12px",
                          padding: "10px 12px",
                          background: "rgba(255, 103, 130, 0.10)",
                          color: "#ffc2cf",
                        }}
                      >
                        {item}
                      </div>
                    ))
                  ) : (
                    <div style={{ color: "#90a8ca" }}>No AI alerts returned.</div>
                  )}
                </div>

                <div style={{ marginTop: "14px" }} />

                <div style={labelStyle}>AI Suggestions</div>
                <div style={{ display: "grid", gap: "8px" }}>
                  {arrayValue<string>(aiSummary?.suggestions).length > 0 ? (
                    arrayValue<string>(aiSummary?.suggestions).map(
                      (item: string, index: number) => (
                        <div
                          key={`${item}-${index}`}
                          style={{
                            borderRadius: "12px",
                            padding: "10px 12px",
                            background: "rgba(76, 148, 255, 0.10)",
                            color: "#b7d5ff",
                          }}
                        >
                          {item}
                        </div>
                      )
                    )
                  ) : (
                    <div style={{ color: "#90a8ca" }}>No AI suggestions returned.</div>
                  )}
                </div>
              </div>

              <div style={mutedCardStyle}>
                <div style={labelStyle}>AI Snapshot</div>
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontSize: "12px",
                    color: "#cfe0fb",
                    lineHeight: 1.6,
                  }}
                >
                  {JSON.stringify(aiSummary?.snapshot || {}, null, 2)}
                </pre>
              </div>
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: "18px", fontWeight: 900 }}>
              Tenant Admin + Rapid User Controls
            </div>
            <div style={{ color: "#90a8ca", marginTop: "6px" }}>
              Create tenant admins, reset passwords, and remove users.
            </div>

            <div style={{ marginTop: "16px", display: "grid", gap: "14px" }}>
              <div style={mutedCardStyle}>
                <div style={{ fontWeight: 900, fontSize: "16px" }}>
                  Create Tenant Admin
                </div>
                <div style={{ marginTop: "14px", display: "grid", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Full Name</label>
                    <input
                      style={inputStyle}
                      value={createAdminName}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setCreateAdminName(e.target.value)
                      }
                      placeholder="Owner-created tenant admin"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Email</label>
                    <input
                      style={inputStyle}
                      value={createAdminEmail}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setCreateAdminEmail(e.target.value)
                      }
                      placeholder="tenantadmin@company.com"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Password</label>
                    <input
                      style={inputStyle}
                      type="password"
                      value={createAdminPassword}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setCreateAdminPassword(e.target.value)
                      }
                      placeholder="Temporary password"
                    />
                  </div>
                  <button
                    style={primaryButton}
                    onClick={() => void handleCreateTenantAdmin()}
                    disabled={busy || !selectedCompanyId}
                  >
                    Create Tenant Admin
                  </button>
                </div>
              </div>

              <div style={mutedCardStyle}>
                <div style={{ fontWeight: 900, fontSize: "16px" }}>
                  Reset Tenant Password
                </div>

                <div style={{ marginTop: "14px", display: "grid", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Select Tenant User</label>
                    <select
                      value={selectedUserId}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        setSelectedUserId(Number(e.target.value))
                      }
                      style={inputStyle}
                    >
                      {tenantUsers.length === 0 ? (
                        <option value={0}>No users found</option>
                      ) : (
                        tenantUsers.map((user: UserRow) => (
                          <option key={user.id} value={user.id}>
                            {valueText(user.email)} · {valueText(user.role || arrayValue<string>(user.roles).join(","), "USER")}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div style={{ color: "#8fa8ca" }}>
                    Selected user: {valueText(selectedUser?.email)} · Role{" "}
                    {valueText(selectedUser?.role || arrayValue<string>(selectedUser?.roles).join(","))}
                  </div>

                  <div>
                    <label style={labelStyle}>New Password</label>
                    <input
                      style={inputStyle}
                      type="password"
                      value={resetPassword}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setResetPassword(e.target.value)
                      }
                      placeholder="Reset password for selected user"
                    />
                  </div>

                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button
                      style={secondaryButton}
                      onClick={() => void handleResetPassword()}
                      disabled={busy || !selectedUserId}
                    >
                      Reset Tenant Password
                    </button>

                    <button
                      style={dangerButton}
                      onClick={() => void handleDeleteUser()}
                      disabled={busy || !selectedUserId}
                    >
                      Delete Selected User
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={grid2Style}>
          <div style={cardStyle}>
            <div style={{ fontSize: "18px", fontWeight: 900 }}>
              Owner Event Timeline
            </div>
            <div style={{ color: "#90a8ca", marginTop: "6px" }}>
              Hidden owner event stream across subscription, AI, tenant, and admin actions.
            </div>

            <div style={{ marginTop: "14px", display: "grid", gap: "10px", maxHeight: "720px", overflowY: "auto", paddingRight: "4px" }}>
              {auditTimeline.length === 0 ? (
                <div style={{ color: "#90a8ca" }}>No audit items available.</div>
              ) : (
                auditTimeline.slice(0, 60).map((item: AuditItem, index: number) => (
                  <div key={item.id || `${item.action}-${index}`} style={mutedCardStyle}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "10px",
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ fontSize: "14px", fontWeight: 900 }}>
                        {valueText(item.action, "OWNER_EVENT")}
                      </div>
                      <div style={{ color: "#8fa8ca", fontSize: "12px" }}>
                        {formatDate(item.createdAt || item.at)}
                      </div>
                    </div>

                    <div style={{ color: "#90a8ca", marginTop: "8px" }}>
                      {valueText(item.tenantName || item.companyName, "Platform-level event")}
                    </div>

                    {(item.meta || item.payload) && (
                      <pre
                        style={{
                          marginTop: "12px",
                          marginBottom: 0,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          fontSize: "12px",
                          lineHeight: 1.55,
                          color: "#cbddfb",
                        }}
                      >
                        {JSON.stringify(item.meta || item.payload || {}, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: "18px", fontWeight: 900 }}>
              Hidden Owner Security Layer
            </div>
            <div style={{ color: "#90a8ca", marginTop: "6px" }}>
              Protected owner password control for the invisible platform layer.
            </div>

            <div style={{ marginTop: "16px", display: "grid", gap: "14px" }}>
              <div style={mutedCardStyle}>
                <div style={{ fontWeight: 900, fontSize: "16px" }}>
                  Change Hidden Owner Password
                </div>
                <div style={{ color: "#90a8ca", marginTop: "8px", lineHeight: 1.6 }}>
                  Update the password used by the FlowOps owner layer without exposing
                  this control in tenant-facing views.
                </div>

                <div style={{ marginTop: "14px" }}>
                  <label style={labelStyle}>New Owner Password</label>
                  <input
                    style={inputStyle}
                    type="password"
                    value={ownerPassword}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setOwnerPassword(e.target.value)
                    }
                    placeholder="New hidden owner password"
                  />
                </div>

                <div style={{ marginTop: "12px" }}>
                  <button
                    style={secondaryButton}
                    onClick={() => void handleChangeOwnerPassword()}
                    disabled={busy}
                  >
                    Change Hidden Owner Password
                  </button>
                </div>
              </div>

              <div style={mutedCardStyle}>
                <div style={{ fontWeight: 900, fontSize: "16px" }}>
                  Selected Tenant Feature Set
                </div>
                <div
                  style={{
                    marginTop: "12px",
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                  }}
                >
                  {arrayValue<string>(selectedCompany?.enabledFeatures).length > 0 ? (
                    arrayValue<string>(selectedCompany?.enabledFeatures).map(
                      (feature: string) => (
                        <span key={feature} style={riskBadgeStyle("OK")}>
                          {feature}
                        </span>
                      )
                    )
                  ) : (
                    <span style={{ color: "#90a8ca" }}>
                      No enabled features found for this company.
                    </span>
                  )}
                </div>
              </div>

              <div style={mutedCardStyle}>
                <div style={{ fontWeight: 900, fontSize: "16px" }}>
                  Selected Tenant Risk Summary
                </div>
                <div style={{ marginTop: "10px" }}>
                  <span style={riskBadgeStyle(selectedHealth?.pricingRisk?.risk || selectedHealth?.aiStatus)}>
                    {valueText(
                      selectedHealth?.pricingRisk?.risk || selectedHealth?.aiStatus,
                      "WATCH"
                    )}
                  </span>
                </div>
                <div style={{ color: "#ffcaaf", marginTop: "10px", lineHeight: 1.6 }}>
                  {arrayValue<string>(selectedHealth?.pricingRisk?.notes).join(" • ") ||
                    "No extra pricing risk notes for this tenant."}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
