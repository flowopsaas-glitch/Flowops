import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FLOWOPS_API_URL } from "../../lib/env";

type TenantRow = {
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
  status?: string | null;
  isActive?: boolean;
  pricing?: {
    monthlyPrice?: number | null;
  };
  demo?: {
    enabled?: boolean;
    expiresAt?: string | null;
  };
};

function getApiBase() {
  return FLOWOPS_API_URL;
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

export default function OwnerTenants() {
  const navigate = useNavigate();

  const [rows, setRows] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await ownerFetch("/companies");
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load tenants.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function activateDemo(id: number | string) {
    setBusyId(`demo-${id}`);
    setError("");
    setMessage("");
    try {
      await ownerFetch(`/companies/${id}/demo-subscription`, {
        method: "POST",
        body: JSON.stringify({
          notes: "Manual FlowOps owner demo activation",
        }),
      });
      setMessage(`Demo activated for tenant ${id}.`);
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to activate demo.");
    } finally {
      setBusyId("");
    }
  }

  async function setPlan(id: number | string, plan: string) {
    setBusyId(`plan-${id}`);
    setError("");
    setMessage("");
    try {
      await ownerFetch(`/companies/${id}/subscription`, {
        method: "PATCH",
        body: JSON.stringify({
          subscriptionPlan: plan,
          isActive: true,
        }),
      });
      setMessage(`Plan updated for tenant ${id}.`);
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to update plan.");
    } finally {
      setBusyId("");
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
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
  }, [query, rows]);

  return (
    <div className="space-y-6">
      <div className="rounded-[32px] border border-white/10 bg-white/[0.05] p-8 shadow-xl">
        <h1 className="text-4xl font-black tracking-tight text-white">
          Owner Tenant Manager
        </h1>
        <p className="mt-3 max-w-3xl text-slate-300">
          Live hidden owner-only tenant management with search, plan control, demo activation, and pricing visibility.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => navigate("/owner/dashboard")}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white hover:bg-white/10"
          >
            Back to Owner Dashboard
          </button>

          <button
            type="button"
            onClick={load}
            className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm font-bold text-cyan-200"
          >
            Refresh Tenants
          </button>
        </div>

        <div className="mt-5">
          <label className="text-xs uppercase tracking-[0.22em] text-white/50">
            Search
          </label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tenant, email, plan..."
            className="mt-2 w-full rounded-2xl border border-white/10 bg-[#071224] px-4 py-3 text-white outline-none focus:border-blue-400"
          />
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

      <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl overflow-x-auto">
        <table className="w-full min-w-[1250px] text-left">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-[0.18em] text-white/50">
              <th className="px-4 py-4">ID</th>
              <th className="px-4 py-4">Tenant</th>
              <th className="px-4 py-4">Email</th>
              <th className="px-4 py-4">Plan</th>
              <th className="px-4 py-4">Status</th>
              <th className="px-4 py-4">Demo</th>
              <th className="px-4 py-4">Demo Expiry</th>
              <th className="px-4 py-4">Monthly Price</th>
              <th className="px-4 py-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, index) => {
              const id = row.id ?? row.tenantId ?? index + 1;
              const name = row.name ?? row.tenantName ?? "Unknown Tenant";
              const email = row.email ?? row.contactEmail ?? "—";
              const plan = row.subscriptionPlan ?? row.planCode ?? "—";
              const status =
                row.status || (row.isActive === false ? "INACTIVE" : "ACTIVE");
              const demo = row.demo?.enabled ? "YES" : "NO";

              return (
                <tr key={String(id)} className="border-b border-white/5 align-top">
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
                    {formatDate(row.demo?.expiresAt)}
                  </td>
                  <td className="px-4 py-4 text-slate-300">
                    {formatMoney(row.pricing?.monthlyPrice)}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => activateDemo(id)}
                        disabled={busyId === `demo-${id}`}
                        className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-200 disabled:opacity-60"
                      >
                        {busyId === `demo-${id}` ? "Working..." : "Create Demo"}
                      </button>

                      <button
                        type="button"
                        onClick={() => setPlan(id, "GROWTH")}
                        disabled={busyId === `plan-${id}`}
                        className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-200 disabled:opacity-60"
                      >
                        Set Growth
                      </button>

                      <button
                        type="button"
                        onClick={() => setPlan(id, "PRO")}
                        disabled={busyId === `plan-${id}`}
                        className="rounded-xl border border-blue-400/20 bg-blue-500/10 px-3 py-2 text-xs font-bold text-blue-200 disabled:opacity-60"
                      >
                        Set Pro
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  No tenants found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
