import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

type PlanBreakdown = Record<string, number>;

type PlatformOverview = {
  companies: number;
  users: number;
  superAdmins: number;
  companyAdmins: number;
  activeCompanies: number;
  inactiveCompanies: number;
  demoTenants: number;
  planBreakdown: PlanBreakdown;
};

type CompanyRow = {
  id?: number;
  tenantId?: number;
  name?: string;
  tenantName?: string;
  legalName?: string | null;
  email?: string | null;
  contactEmail?: string | null;
  phone?: string | null;
  subscriptionPlan?: string | null;
  planCode?: string | null;
  isActive?: boolean;
  status?: string | null;
  pricing?: {
    monthlyPrice?: number | null;
    setupFee?: number | null;
    priceNotes?: string | null;
  };
  demo?: {
    enabled?: boolean;
    expiresAt?: string | null;
    notes?: string | null;
  };
};

type AIFeedItem = {
  id?: string | number;
  title?: string;
  message?: string;
  severity?: string;
  companyName?: string;
  createdAt?: string;
};

function getApiBase() {
  const raw =
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_API_URL ||
    "http://127.0.0.1:3000/api";
  return String(raw).replace(/\/+$/, "");
}

function getOwnerToken() {
  return (
    localStorage.getItem("flowops_owner_token") ||
    localStorage.getItem("flowops_owner_access_token") ||
    localStorage.getItem("flowops.owner.accessToken") ||
    localStorage.getItem("ownerAccessToken") ||
    ""
  );
}

async function readJsonSafe(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function ownerFetch(path: string, init?: RequestInit) {
  const token = getOwnerToken();

  const response = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });

  const data = await readJsonSafe(response);

  if (!response.ok) {
    throw new Error(
      data?.message || data?.error || `Request failed (${response.status})`
    );
  }

  return data;
}

function toNumber(value: any, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatMoney(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `ZAR ${Number(value).toLocaleString("en-ZA")}`;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function StatCard(props: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
      <div className="text-xs font-extrabold uppercase tracking-[0.18em] text-white/50">
        {props.title}
      </div>
      <div className="mt-3 text-4xl font-black text-white">{props.value}</div>
      <div className="mt-2 text-sm text-slate-300">{props.subtitle}</div>
    </div>
  );
}

function SectionCard(props: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
      <div className="text-2xl font-black tracking-tight text-white">
        {props.title}
      </div>
      {props.subtitle ? (
        <div className="mt-2 text-sm text-slate-300">{props.subtitle}</div>
      ) : null}
      <div className="mt-5">{props.children}</div>
    </div>
  );
}

function Input(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs uppercase tracking-[0.22em] text-white/50">
        {props.label}
      </label>
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder || ""}
        className="w-full rounded-2xl border border-white/10 bg-[#071224] px-4 py-3 text-white outline-none focus:border-blue-400"
      />
    </div>
  );
}

function Select(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs uppercase tracking-[0.22em] text-white/50">
        {props.label}
      </label>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-[#071224] px-4 py-3 text-white outline-none focus:border-blue-400"
      >
        {props.options.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function SuperAdminDashboard() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [overview, setOverview] = useState<PlatformOverview>({
    companies: 0,
    users: 0,
    superAdmins: 0,
    companyAdmins: 0,
    activeCompanies: 0,
    inactiveCompanies: 0,
    demoTenants: 0,
    planBreakdown: {},
  });

  const [tenants, setTenants] = useState<CompanyRow[]>([]);
  const [aiFeed, setAiFeed] = useState<AIFeedItem[]>([]);
  const [search, setSearch] = useState("");

  const [newCompanyName, setNewCompanyName] = useState("");
  const [newLegalName, setNewLegalName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newPlan, setNewPlan] = useState("STARTER");

  const [demoTenantId, setDemoTenantId] = useState("");
  const [demoNotes, setDemoNotes] = useState("Manual FlowOps owner demo activation");

  const [subTenantId, setSubTenantId] = useState("");
  const [subPlan, setSubPlan] = useState("PRO");
  const [subMonthlyPrice, setSubMonthlyPrice] = useState("1499");
  const [subSetupFee, setSubSetupFee] = useState("0");
  const [subPriceNotes, setSubPriceNotes] = useState("Manual owner pricing");

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [companiesResult, platformResult, aiAlertsResult] = await Promise.allSettled([
        ownerFetch("/companies"),
        ownerFetch("/companies/platform/overview"),
        ownerFetch("/owner/ai-alerts"),
      ]);

      if (companiesResult.status === "fulfilled") {
        const companies = Array.isArray(companiesResult.value)
          ? companiesResult.value
          : [];
        setTenants(companies);
      } else {
        setTenants([]);
      }

      if (platformResult.status === "fulfilled") {
        const platform = platformResult.value || {};
        setOverview({
          companies: toNumber(platform?.companies),
          users: toNumber(platform?.users),
          superAdmins: toNumber(platform?.superAdmins),
          companyAdmins: toNumber(platform?.companyAdmins),
          activeCompanies: toNumber(platform?.activeCompanies),
          inactiveCompanies: toNumber(platform?.inactiveCompanies),
          demoTenants: toNumber(platform?.demoTenants),
          planBreakdown:
            platform?.planBreakdown && typeof platform.planBreakdown === "object"
              ? platform.planBreakdown
              : {},
        });
      } else {
        setOverview({
          companies: 0,
          users: 0,
          superAdmins: 0,
          companyAdmins: 0,
          activeCompanies: 0,
          inactiveCompanies: 0,
          demoTenants: 0,
          planBreakdown: {},
        });
      }

      if (aiAlertsResult.status === "fulfilled") {
        const payload = aiAlertsResult.value;
        const items = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.items)
          ? payload.items
          : [];
        setAiFeed(items.slice(0, 6));
      } else {
        setAiFeed([]);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load owner dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const filteredTenants = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter((row) => {
      const text = [
        row.name,
        row.tenantName,
        row.legalName,
        row.email,
        row.contactEmail,
        row.subscriptionPlan,
        row.planCode,
        row.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(q);
    });
  }, [search, tenants]);

  async function createTenant() {
    setBusyKey("create-tenant");
    setError("");
    setMessage("");
    try {
      await ownerFetch("/companies", {
        method: "POST",
        body: JSON.stringify({
          name: newCompanyName,
          legalName: newLegalName || undefined,
          email: newEmail || undefined,
          phone: newPhone || undefined,
          subscriptionPlan: newPlan,
          enabledFeatures: [],
          onboardingComplete: false,
          onboardingStep: "general",
          isActive: true,
        }),
      });

      setNewCompanyName("");
      setNewLegalName("");
      setNewEmail("");
      setNewPhone("");
      setNewPlan("STARTER");
      setMessage("Tenant created successfully.");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Failed to create tenant.");
    } finally {
      setBusyKey("");
    }
  }

  async function createDemoSubscription() {
    if (!demoTenantId.trim()) return;
    setBusyKey("demo");
    setError("");
    setMessage("");
    try {
      await ownerFetch(`/companies/${demoTenantId}/demo-subscription`, {
        method: "POST",
        body: JSON.stringify({
          notes: demoNotes,
        }),
      });

      setMessage("Demo subscription activated.");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Failed to activate demo subscription.");
    } finally {
      setBusyKey("");
    }
  }

  async function saveSubscription() {
    if (!subTenantId.trim()) return;
    setBusyKey("subscription");
    setError("");
    setMessage("");
    try {
      await ownerFetch(`/companies/${subTenantId}/subscription`, {
        method: "PATCH",
        body: JSON.stringify({
          subscriptionPlan: subPlan,
          isActive: true,
        }),
      });

      await ownerFetch(`/companies/${subTenantId}/pricing`, {
        method: "PATCH",
        body: JSON.stringify({
          monthlyPrice: Number(subMonthlyPrice || 0),
          setupFee: Number(subSetupFee || 0),
          priceNotes: subPriceNotes || "",
        }),
      });

      setMessage("Subscription and pricing updated.");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Failed to update subscription.");
    } finally {
      setBusyKey("");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[32px] border border-white/10 bg-white/[0.05] p-8 shadow-xl">
        <div className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
          Hidden Platform Control
        </div>

        <h1 className="mt-4 text-4xl font-black tracking-tight text-white">
          FlowOps Super Owner Dashboard
        </h1>

        <p className="mt-3 max-w-4xl text-slate-300">
          Platform-level command center for manual tenant creation, automated demo handling,
          subscription control, email oversight, and AI supervisor visibility across the entire platform.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={loadAll}
            className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm font-bold text-cyan-200"
          >
            Refresh Owner Dashboard
          </button>

          <button
            type="button"
            onClick={() => navigate("/owner/tenants")}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white"
          >
            Open Full Tenant Manager
          </button>

          <button
            type="button"
            onClick={() => navigate("/owner/access")}
            className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-200"
          >
            Open Access + Password Manager
          </button>

          <button
            type="button"
            onClick={() => navigate("/owner/access")}
            className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-200"
          >
            Open Access + Password Manager
          </button>
        </div>

        {error ? (
          <div className="mt-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {message}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Tenant Companies" value={String(overview.companies)} subtitle="Platform-wide tenant count" />
        <StatCard title="Platform Users" value={String(overview.users)} subtitle="All users across the platform" />
        <StatCard title="Company Admins" value={String(overview.companyAdmins)} subtitle="Operational tenant admins" />
        <StatCard title="Demo Tenants" value={String(overview.demoTenants)} subtitle="Live demo subscriptions" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          title="Create Tenant"
          subtitle="Manual platform onboarding from the hidden owner layer."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Company Name" value={newCompanyName} onChange={setNewCompanyName} placeholder="Budget Couriers" />
            <Input label="Legal Name" value={newLegalName} onChange={setNewLegalName} placeholder="Budget Couriers Pty Ltd" />
            <Input label="Email" value={newEmail} onChange={setNewEmail} placeholder="ops@budgetcouriers.com" />
            <Input label="Phone" value={newPhone} onChange={setNewPhone} placeholder="+27 ..." />
            <Select label="Plan" value={newPlan} onChange={setNewPlan} options={["STARTER", "GROWTH", "PRO", "ENTERPRISE"]} />
          </div>

          <div className="mt-5">
            <button
              type="button"
              onClick={createTenant}
              disabled={busyKey === "create-tenant" || !newCompanyName.trim()}
              className="rounded-2xl bg-gradient-to-r from-blue-400 to-indigo-400 px-5 py-3 font-bold text-slate-950 disabled:opacity-60"
            >
              {busyKey === "create-tenant" ? "Creating..." : "Create Tenant"}
            </button>
          </div>
        </SectionCard>

        <SectionCard
          title="Manual + Auto Subscriptions"
          subtitle="Demo activation and manual pricing control."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Demo Tenant ID" value={demoTenantId} onChange={setDemoTenantId} placeholder="1" />
            <Input label="Demo Notes" value={demoNotes} onChange={setDemoNotes} placeholder="Demo activation notes" />
            <Input label="Subscription Tenant ID" value={subTenantId} onChange={setSubTenantId} placeholder="1" />
            <Select label="Plan" value={subPlan} onChange={setSubPlan} options={["STARTER", "GROWTH", "PRO", "ENTERPRISE"]} />
            <Input label="Monthly Price" value={subMonthlyPrice} onChange={setSubMonthlyPrice} placeholder="1499" />
            <Input label="Setup Fee" value={subSetupFee} onChange={setSubSetupFee} placeholder="0" />
            <div className="md:col-span-2">
              <Input label="Price Notes" value={subPriceNotes} onChange={setSubPriceNotes} placeholder="Manual owner pricing" />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={createDemoSubscription}
              disabled={busyKey === "demo" || !demoTenantId.trim()}
              className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 py-3 font-bold text-emerald-200 disabled:opacity-60"
            >
              {busyKey === "demo" ? "Creating Demo..." : "Create Demo Subscription"}
            </button>

            <button
              type="button"
              onClick={saveSubscription}
              disabled={busyKey === "subscription" || !subTenantId.trim()}
              className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-5 py-3 font-bold text-cyan-200 disabled:opacity-60"
            >
              {busyKey === "subscription" ? "Saving..." : "Save Manual Subscription"}
            </button>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard
          title="Platform Email Hub"
          subtitle="Owner entry point for platform-wide email supervision."
        >
          <div className="space-y-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
              Monitor support, quote, billing, and operational email activity across the platform.
            </div>
            <button
              type="button"
              onClick={() => navigate("/email")}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-bold text-white"
            >
              Open Email Hub
            </button>
          </div>
        </SectionCard>

        <SectionCard
          title="AI Supervisor"
          subtitle="Platform-wide AI oversight entry point."
        >
          <div className="space-y-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
              Review anomalies, upgrade intent, operational risks, and billing intelligence.
            </div>
            <button
              type="button"
              onClick={() => navigate("/ai-control-tower")}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-bold text-white"
            >
              Open AI Control Tower
            </button>
          </div>
        </SectionCard>

        <SectionCard
          title="Tenant Search"
          subtitle="Search every tenant on the platform instantly."
        >
          <Input label="Search" value={search} onChange={setSearch} placeholder="Search tenant, email, plan..." />
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard
          title="Tenant Snapshot"
          subtitle={loading ? "Loading live tenant data..." : "Live platform tenant visibility"}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-[0.18em] text-white/50">
                  <th className="px-4 py-4">ID</th>
                  <th className="px-4 py-4">Tenant</th>
                  <th className="px-4 py-4">Email</th>
                  <th className="px-4 py-4">Plan</th>
                  <th className="px-4 py-4">Status</th>
                  <th className="px-4 py-4">Demo</th>
                  <th className="px-4 py-4">Price</th>
                </tr>
              </thead>
              <tbody>
                {filteredTenants.slice(0, 8).map((row, index) => {
                  const id = row.id ?? row.tenantId ?? index + 1;
                  const name = row.name ?? row.tenantName ?? "Unknown Tenant";
                  const email = row.email ?? row.contactEmail ?? "—";
                  const plan = row.subscriptionPlan ?? row.planCode ?? "—";
                  const status =
                    row.status || (row.isActive === false ? "INACTIVE" : "ACTIVE");
                  const demo = row.demo?.enabled ? "YES" : "NO";

                  return (
                    <tr key={String(id)} className="border-b border-white/5">
                      <td className="px-4 py-4 text-white">{id}</td>
                      <td className="px-4 py-4 font-semibold text-white">{name}</td>
                      <td className="px-4 py-4 text-slate-300">{email}</td>
                      <td className="px-4 py-4 text-slate-300">{plan}</td>
                      <td className="px-4 py-4">
                        <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-200">
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-slate-300">{demo}</td>
                      <td className="px-4 py-4 text-slate-300">
                        {formatMoney(row.pricing?.monthlyPrice)}
                      </td>
                    </tr>
                  );
                })}

                {!loading && filteredTenants.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      No tenants found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard
          title="AI Supervisor Feed"
          subtitle="Latest platform-level AI and owner signals."
        >
          <div className="space-y-3">
            {aiFeed.length > 0 ? (
              aiFeed.map((item, index) => (
                <div
                  key={String(item.id ?? index)}
                  className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-bold text-white">
                      {item.title || item.companyName || "AI Event"}
                    </div>
                    <div className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200">
                      {item.severity || "INFO"}
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-slate-300">
                    {item.message || "Platform AI event available."}
                  </div>
                  <div className="mt-2 text-xs text-white/45">
                    {formatDate(item.createdAt)}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-slate-300">
                No AI alerts available yet. The dashboard remains stable even when this feed is empty.
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Plan Breakdown"
        subtitle="Current subscription distribution across tenant companies."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Object.keys(overview.planBreakdown).length > 0 ? (
            Object.entries(overview.planBreakdown).map(([plan, count]) => (
              <div
                key={plan}
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4"
              >
                <div className="text-xs uppercase tracking-[0.18em] text-white/50">
                  {plan}
                </div>
                <div className="mt-2 text-3xl font-black text-white">
                  {String(count)}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-slate-300">
              No plan breakdown available yet.
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
