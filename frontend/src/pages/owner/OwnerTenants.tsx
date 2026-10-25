import { errorMessageOf } from "@/components/patterns/errorMessage";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  CheckCircle,
  Eye,
  Plus,
  RefreshCw,
  Search,
  UserX,
  XCircle,
  Trash2,
} from "lucide-react";
import { api } from "../../api/client";
import { startImpersonation } from "../../lib/impersonation";

type TenantRow = {
  id: string;
  name: string;
  tradingName?: string | null;
  email?: string | null;
  phone?: string | null;
  plan?: string | null;
  isActive: boolean;
  trialEndsAt?: string | null;
  createdAt: string;
  _count?: { users: number; waybills: number };
};

type ApprovalRequest = {
  id: string;
  fullName: string;
  email: string;
  company: string;
  phone?: string | null;
  status: string;
  createdAt: string;
};

const PLAN_COLORS: Record<string, string> = {
  starter: "border-slate-400/20 bg-slate-500/10 text-slate-300",
  professional: "border-blue-400/20 bg-blue-500/10 text-blue-200",
  enterprise: "border-purple-400/20 bg-purple-500/10 text-purple-200",
};

function planBadge(plan?: string | null) {
  const p = (plan || "starter").toLowerCase();
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold capitalize ${PLAN_COLORS[p] ?? PLAN_COLORS.starter}`}>
      {p}
    </span>
  );
}

function unwrap<T>(res: unknown): T { return ((res as { data?: T } | null)?.data ?? res) as T; }

export default function OwnerTenants() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  // Create tenant form
  const [form, setForm] = useState({ name: "", email: "", phone: "", plan: "starter" });

  async function load() {
  return (async () => {
    const [tRes, aRes] = await Promise.allSettled([
      api.get("/owner/tenants"),
      api.get("/owner/approval-requests"),
    ]);

    if (tRes.status === "fulfilled") {
      const d = unwrap<TenantRow[] | { data?: TenantRow[] }>(tRes.value);
      setTenants(Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []);
    }
    if (aRes.status === "fulfilled") {
      const d = unwrap<ApprovalRequest[] | { data?: ApprovalRequest[] }>(aRes.value);
      const items = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
      setApprovals(items.filter((r: ApprovalRequest) => r.status === "PENDING"));
    }

  })().catch((err: unknown) => {
    setError(errorMessageOf(err) || "Failed to load tenants.");

  }).finally(() => {
    setLoading(false);

  });
}

  useEffect(() => { void load(); }, []);

  async function doAction(key: string, fn: () => Promise<void>, msg: string) {
    setBusy(key);
    setError("");
    setSuccess("");
    try {
      await fn();
      setSuccess(msg);
      await load();
    } catch (err) {
      setError(errorMessageOf(err) || "Action failed.");
    } finally {
      setBusy("");
    }
  }

  function createTenant() {
    if (!form.name.trim()) { setError("Company name is required."); return; }
    doAction("create", async () => {
      await api.post("/owner/tenants/draft", {
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        plan: form.plan,
        isActive: true,
      });
      setForm({ name: "", email: "", phone: "", plan: "starter" });
      setShowCreate(false);
    }, `Tenant "${form.name}" created.`);
  }

  function approveRequest(id: string, company: string) {
    doAction(`approve-${id}`, async () => {
      await api.post(`/owner/approval-requests/${id}/approve`, {});
    }, `${company} approved and onboarded.`);
  }

  function rejectRequest(id: string, company: string) {
    doAction(`reject-${id}`, async () => {
      await api.post(`/owner/approval-requests/${id}/reject`, { reason: "Rejected by owner" });
    }, `${company} request rejected.`);
  }

  function activateTenant(id: string, name: string) {
    doAction(`activate-${id}`, async () => {
      await api.post(`/owner/tenants/${id}/activate`, {});
    }, `${name} activated.`);
  }

  function suspendTenant(id: string, name: string) {
    doAction(`suspend-${id}`, async () => {
      await api.patch(`/owner/tenants/${id}/action`, { action: "suspend" });
    }, `${name} suspended.`);
  }

  function setPlan(id: string, name: string, plan: string) {
    doAction(`plan-${id}`, async () => {
      await api.patch("/owner/plans", { tenantId: id, plan });
    }, `${name} → ${plan} plan updated.`);
  }

  function deleteTenant(id: string, name: string) {
    const typed = window.prompt(
      `⚠️ PERMANENTLY DELETE "${name}" and ALL its data (users, waybills, invoices…)?\n` +
      `This cannot be undone.\n\nType the tenant name to confirm:`,
    );
    if (typed == null) return;
    if (typed.trim() !== name) { setError("Name did not match — deletion cancelled."); return; }
    doAction(`delete-${id}`, async () => {
      await api.delete(`/owner/tenants/${id}`);
    }, `${name} deleted.`);
  }

  async function viewAs(id: string, name: string) {
    setBusy(`view-${id}`);
    setError("");
    try {
      const res = await api.post(`/owner/impersonate/${id}`, {});
      const token = unwrap<{ access_token?: string }>(res)?.access_token;
      if (!token) throw new Error("No impersonation token returned");
      startImpersonation(token, name);
      window.location.assign("/dashboard");
    } catch (err) {
      setError(errorMessageOf(err) || "Impersonation failed.");
      setBusy("");
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter((t) =>
      [t.name, t.tradingName, t.email, t.plan].filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [tenants, query]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-7 shadow-xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
              <Building2 className="h-3.5 w-3.5" /> Tenant Manager
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-white">All Tenants</h1>
            <p className="mt-2 text-slate-300">Approve requests, create tenants, manage plans, and impersonate any tenant.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => setShowCreate((v) => !v)}
              className="inline-flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2.5 text-sm font-bold text-emerald-200 hover:bg-emerald-500/20">
              <Plus className="h-4 w-4" /> Create Tenant
            </button>
            <button onClick={load}
              className="inline-flex items-center gap-2 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-2.5 text-sm font-bold text-cyan-200">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            <button onClick={() => navigate("/owner/dashboard")}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10">
              ← Dashboard
            </button>
          </div>
        </div>
        {error ? <div className="mt-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
        {success ? <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{success}</div> : null}
      </div>

      {/* Create Tenant panel */}
      {showCreate ? (
        <div className="rounded-[28px] border border-emerald-400/20 bg-emerald-500/5 p-6 shadow-xl">
          <div className="text-lg font-black text-white mb-4">New Tenant</div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Company Name *", key: "name", ph: "Budget Couriers" },
              { label: "Email", key: "email", ph: "ops@budgetcouriers.com" },
              { label: "Phone", key: "phone", ph: "+27 ..." },
            ].map(({ label, key, ph }) => (
              <div key={key}>
                <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">{label}</label>
                <input
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={ph}
                  className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#071224] px-4 py-2.5 text-sm text-white outline-none focus:border-blue-400"
                />
              </div>
            ))}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50" htmlFor="field-plan-1">Plan</label>
              <select id="field-plan-1" value={form.plan} onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))}
                className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#071224] px-4 py-2.5 text-sm text-white outline-none focus:border-blue-400">
                <option value="starter">Starter (Free)</option>
                <option value="professional">Professional — 3 drivers (R5,999)</option>
                <option value="professional_10">Professional — 10 drivers (R9,999)</option>
                <option value="professional_25">Professional — 25 drivers (R19,999)</option>
                <option value="professional_50">Professional — 50 drivers (R29,999)</option>
                <option value="enterprise">Enterprise (Custom)</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button disabled={busy === "create"} onClick={createTenant}
              className="rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-400 px-5 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-60">
              {busy === "create" ? "Creating…" : "Create Tenant"}
            </button>
            <button onClick={() => setShowCreate(false)}
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-white">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {/* Pending Approval Requests */}
      {approvals.length > 0 ? (
        <div className="rounded-[28px] border border-amber-400/20 bg-amber-500/5 p-6 shadow-xl">
          <div className="text-lg font-black text-amber-200 mb-1">
            ⏳ {approvals.length} Pending Approval Request{approvals.length > 1 ? "s" : ""}
          </div>
          <p className="text-sm text-slate-400 mb-4">New companies waiting to be onboarded — approve to create their account.</p>
          <div className="space-y-3">
            {approvals.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div>
                  <div className="font-bold text-white">{r.company}</div>
                  <div className="text-sm text-slate-400">{r.fullName} · {r.email}{r.phone ? ` · ${r.phone}` : ""}</div>
                  <div className="text-xs text-white/40">{new Date(r.createdAt).toLocaleString("en-ZA")}</div>
                </div>
                <div className="flex gap-2">
                  <button disabled={busy === `approve-${r.id}`} onClick={() => approveRequest(r.id, r.company)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-200 disabled:opacity-60 hover:bg-emerald-500/20">
                    <CheckCircle className="h-3.5 w-3.5" /> {busy === `approve-${r.id}` ? "Approving…" : "Approve"}
                  </button>
                  <button disabled={busy === `reject-${r.id}`} onClick={() => rejectRequest(r.id, r.company)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-200 disabled:opacity-60 hover:bg-rose-500/20">
                    <XCircle className="h-3.5 w-3.5" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Search + Table */}
      <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, plan…"
              className="w-full rounded-2xl border border-white/10 bg-[#071224] pl-9 pr-4 py-2.5 text-sm text-white outline-none focus:border-blue-400" />
          </div>
          <span className="text-sm text-slate-400">{filtered.length} tenant{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[11px] uppercase tracking-[0.16em] text-white/50">
                <th className="px-3 py-3">Tenant</th>
                <th className="px-3 py-3">Email</th>
                <th className="px-3 py-3">Plan</th>
                <th className="px-3 py-3">Users</th>
                <th className="px-3 py-3">Waybills</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Joined</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-400">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-400">No tenants found.</td></tr>
              ) : filtered.map((t) => (
                <tr key={t.id}
                  className="cursor-pointer border-b border-white/5 hover:bg-white/[0.03]"
                  onClick={() => navigate(`/owner/tenants/${t.id}`)}>
                  <td className="px-3 py-3 font-semibold text-white">{t.name}</td>
                  <td className="px-3 py-3 text-slate-300">{t.email || "—"}</td>
                  <td className="px-3 py-3">{planBadge(t.plan)}</td>
                  <td className="px-3 py-3 text-slate-300">{t._count?.users ?? "—"}</td>
                  <td className="px-3 py-3 text-slate-300">{t._count?.waybills ?? "—"}</td>
                  <td className="px-3 py-3">
                    {/* Status badge — Trial / Active / Suspended */}
                    {(() => {
                      if (!t.isActive) {
                        return (
                          <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-bold text-rose-200">
                            Suspended
                          </span>
                        );
                      }
                      if (t.trialEndsAt) {
                        const daysLeft = Math.ceil(
                          (new Date(t.trialEndsAt).getTime() - Date.now()) / 86400000
                        );
                        if (daysLeft > 0) {
                          return (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-bold text-amber-200">
                              Trial
                              <span className="text-amber-300/70">{daysLeft}d</span>
                            </span>
                          );
                        }
                        // Trial expired — still active but needs upgrade
                        return (
                          <span className="rounded-full border border-orange-400/30 bg-orange-500/10 px-2.5 py-0.5 text-[11px] font-bold text-orange-200">
                            Trial expired
                          </span>
                        );
                      }
                      return (
                        <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-200">
                          Active
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-3 text-slate-400 whitespace-nowrap text-xs">
                    {new Date(t.createdAt).toLocaleDateString("en-ZA")}
                  </td>
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                      {/* View as */}
                      <button disabled={busy === `view-${t.id}`} onClick={() => viewAs(t.id, t.name)}
                        className="inline-flex items-center gap-1 rounded-xl border border-amber-400/20 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-bold text-amber-200 hover:bg-amber-500/20 disabled:opacity-60">
                        <Eye className="h-3 w-3" /> View as
                      </button>
                      {/* Activate / Suspend */}
                      {t.isActive ? (
                        <button disabled={busy === `suspend-${t.id}`} onClick={() => suspendTenant(t.id, t.name)}
                          className="inline-flex items-center gap-1 rounded-xl border border-rose-400/20 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-bold text-rose-200 hover:bg-rose-500/20 disabled:opacity-60">
                          <UserX className="h-3 w-3" /> Suspend
                        </button>
                      ) : (
                        <button disabled={busy === `activate-${t.id}`} onClick={() => activateTenant(t.id, t.name)}
                          className="inline-flex items-center gap-1 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-bold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-60">
                          <CheckCircle className="h-3 w-3" /> Activate
                        </button>
                      )}
                      {/* Change plan — pick any tier for this tenant */}
                      <select
                        disabled={busy === `plan-${t.id}`}
                        value={(t.plan || "starter").toLowerCase()}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => { e.stopPropagation(); setPlan(t.id, t.name, e.target.value); }}
                        className="rounded-xl border border-blue-400/20 bg-blue-500/10 px-2.5 py-1.5 text-[11px] font-bold text-blue-200 outline-none hover:bg-blue-500/20 disabled:opacity-60"
                        title="Change this tenant's plan"
                      >
                        <option value="starter">Starter</option>
                        <option value="professional">Pro · 3 drivers</option>
                        <option value="professional_10">Pro · 10 drivers</option>
                        <option value="professional_25">Pro · 25 drivers</option>
                        <option value="professional_50">Pro · 50 drivers</option>
                        <option value="enterprise">Enterprise</option>
                      </select>
                      {/* Delete */}
                      <button disabled={busy === `delete-${t.id}`} onClick={(e) => { e.stopPropagation(); deleteTenant(t.id, t.name); }}
                        className="inline-flex items-center gap-1 rounded-xl border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-bold text-rose-300 hover:bg-rose-500/20 disabled:opacity-60">
                        <Trash2 className="h-3 w-3" /> {busy === `delete-${t.id}` ? "…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
