import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, Eye, Plus, CheckCircle, UserX, TrendingUp } from "lucide-react";
import { api } from "../../api/client";
import { startImpersonation } from "../../lib/impersonation";

type TenantAnalytics = {
  currency: string;
  tenant: {
    id: string; name: string; tradingName?: string | null; email?: string | null;
    phone?: string | null; plan: string; isActive: boolean; createdAt: string;
    country?: string | null; city?: string | null; slaBreachMinutes?: number; slaWarningMinutes?: number;
    priceOverrideZar?: number | null; featureOverrides?: Record<string, boolean>;
  };
  usage: { users: number; waybillsTotal: number; waybills30: number; collections: number; drivers: number; invoices: number };
  revenue: { mrr: number; collectedTotal: number; collected30: number };
  operations: { delivered: number; failed: number; returned: number; deliverySuccess: number; exceptionRate: number; onTimeRate: number };
  trend: Array<{ month: string; waybills: number }>;
  recentWaybills: Array<{ id: string; trackingNumber: string; status: string; createdAt: string }>;
  auditTrail: Array<{ id: string; action: string; actorEmail?: string | null; createdAt: string; metadata?: any }>;
  health: { score: number; risk: string };
};

function money(v: number | null | undefined, c = "ZAR") {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${c} ${Number(v).toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;
}
function num(v: number | undefined, d = 0) {
  if (v == null || !Number.isFinite(v)) return "0";
  return Number(v).toLocaleString("en-ZA", { maximumFractionDigits: d });
}

function Stat(props: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
      <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/50">{props.label}</div>
      <div className="mt-1.5 text-2xl font-black text-white">{props.value}</div>
      {props.sub ? <div className="mt-1 text-xs text-slate-400">{props.sub}</div> : null}
    </div>
  );
}

export default function OwnerTenantDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [d, setD] = useState<TenantAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState("");
  const [showPlan, setShowPlan] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newPlan, setNewPlan] = useState("professional");
  const [plans, setPlans] = useState<Array<{ id: string; name: string; price: number; currency?: string; interval?: string | null }>>([]);
  const [catalog, setCatalog] = useState<Array<{ key: string; label: string; includedIn: { starter: boolean; professional: boolean; enterprise: boolean } }>>([]);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [customPrice, setCustomPrice] = useState<string>(""); // blank = use plan price
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "" });

  // Seed the subscription editor from the loaded tenant.
  function openSubscription() {
    if (d) {
      setNewPlan((d.tenant.plan || "starter").toLowerCase());
      setOverrides({ ...(d.tenant.featureOverrides ?? {}) });
      setCustomPrice(d.tenant.priceOverrideZar != null ? String(d.tenant.priceOverrideZar) : "");
    }
    setShowPlan((v) => !v);
  }

  async function load() {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const res: any = await api.get(`/owner/tenants/${id}/analytics`);
      setD((res?.data ?? res) as TenantAnalytics);
    } catch (err: any) {
      setError(err?.message || "Failed to load tenant analytics.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  // Plan price book (single source of truth = GET /owner/plans → plan-entitlements).
  useEffect(() => {
    api.get("/owner/plans")
      .then((r: any) => setPlans((r?.data ?? r) as any[]))
      .catch(() => setPlans([]));
    api.get("/owner/feature-catalog")
      .then((r: any) => setCatalog((r?.data ?? r) as any[]))
      .catch(() => setCatalog([]));
  }, []);

  const planPrice = (planId?: string | null): number => {
    const p = plans.find((x) => x.id === (planId || "").toLowerCase());
    return p?.price ?? 0;
  };
  const planLabel = (planId?: string | null): string => {
    const p = plans.find((x) => x.id === (planId || "").toLowerCase());
    return p?.name ?? (planId ? planId[0].toUpperCase() + planId.slice(1) : "—");
  };

  async function doAction(key: string, fn: () => Promise<void>, msg: string) {
    setBusy(key); setError(""); setSuccess("");
    try { await fn(); setSuccess(msg); void load(); }
    catch (err: any) { setError(err?.message || "Action failed."); }
    finally { setBusy(""); }
  }

  async function viewAs() {
    if (!d) return;
    doAction("view", async () => {
      const res: any = await api.post(`/owner/impersonate/${d.tenant.id}`, {});
      const token = (res?.data ?? res)?.access_token;
      if (!token) throw new Error("No impersonation token");
      startImpersonation(token, d.tenant.name);
      window.location.href = "/dashboard";
    }, "");
  }

  function activateTenant() {
    if (!d) return;
    doAction("activate", () => api.post(`/owner/tenants/${d.tenant.id}/activate`, {}) as any, `${d.tenant.name} activated.`);
  }

  function suspendTenant() {
    if (!d) return;
    doAction("suspend", () => api.patch(`/owner/tenants/${d.tenant.id}/action`, { action: "suspend" }) as any, `${d.tenant.name} suspended.`);
  }

  function saveSubscription() {
    if (!d) return;
    const priceTrim = customPrice.trim();
    const priceOverrideZar = priceTrim === "" ? null : Math.max(0, Number(priceTrim) || 0);
    doAction("plan", async () => {
      await api.patch("/owner/subscription", {
        tenantId: d.tenant.id,
        plan: newPlan,
        featureOverrides: overrides,
        priceOverrideZar,
      });
      setShowPlan(false);
    }, "Subscription updated.");
  }

  function createUser() {
    if (!d || !newUser.email || !newUser.password) { setError("Email and password required."); return; }
    doAction("user", async () => {
      await api.post(`/owner/tenants/${d.tenant.id}/users`, newUser);
      setNewUser({ name: "", email: "", password: "" });
      setShowCreateUser(false);
    }, "Admin user created.");
  }

  const cur = d?.currency || "ZAR";

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate("/owner/tenants")}
        className="inline-flex items-center gap-2 text-sm font-bold text-slate-300 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Back to tenants
      </button>

      {error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      ) : null}
      {success ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{success}</div>
      ) : null}

      {loading && !d ? (
        <div className="grid place-items-center rounded-[28px] border border-white/10 bg-white/[0.04] py-16 text-white/60">
          Loading tenant…
        </div>
      ) : null}

      {d ? (
        <>
          {/* Header */}
          <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-7 shadow-xl">
            {/* top row: info + actions */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-black tracking-tight text-white">{d.tenant.name}</h1>
                  <span className={`rounded-full border px-3 py-0.5 text-xs font-bold ${d.tenant.isActive ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200" : "border-rose-400/20 bg-rose-500/10 text-rose-200"}`}>
                    {d.tenant.isActive ? "Active" : "Suspended"}
                  </span>
                  <span className="rounded-full border border-white/15 bg-white/5 px-3 py-0.5 text-xs font-bold capitalize text-white/80">{d.tenant.plan}</span>
                </div>
                <div className="mt-2 text-sm text-slate-400">
                  {[d.tenant.email, d.tenant.phone, [d.tenant.city, d.tenant.country].filter(Boolean).join(", ")]
                    .filter(Boolean).join("  ·  ")}
                </div>
                <div className="mt-1 text-xs text-white/40">
                  Customer since {new Date(d.tenant.createdAt).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })}
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="text-right">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-white/50">Health</div>
                  <div className={`text-3xl font-black ${d.health.score >= 70 ? "text-emerald-300" : d.health.score >= 40 ? "text-amber-300" : "text-rose-300"}`}>
                    {d.health.score}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={viewAs} disabled={busy === "view"}
                    className="inline-flex items-center gap-2 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-2.5 text-sm font-bold text-amber-200 hover:bg-amber-500/20 disabled:opacity-60">
                    <Eye className="h-4 w-4" /> View as
                  </button>
                  {d.tenant.isActive ? (
                    <button onClick={suspendTenant} disabled={busy === "suspend"}
                      className="inline-flex items-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-2.5 text-sm font-bold text-rose-200 hover:bg-rose-500/20 disabled:opacity-60">
                      <UserX className="h-4 w-4" /> {busy === "suspend" ? "Suspending…" : "Suspend"}
                    </button>
                  ) : (
                    <button onClick={activateTenant} disabled={busy === "activate"}
                      className="inline-flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2.5 text-sm font-bold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-60">
                      <CheckCircle className="h-4 w-4" /> {busy === "activate" ? "Activating…" : "Activate"}
                    </button>
                  )}
                  <button onClick={openSubscription}
                    className="inline-flex items-center gap-2 rounded-2xl border border-blue-400/20 bg-blue-500/10 px-4 py-2.5 text-sm font-bold text-blue-200 hover:bg-blue-500/20">
                    <TrendingUp className="h-4 w-4" /> Edit Subscription
                  </button>
                  <button onClick={() => setShowCreateUser((v) => !v)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-2.5 text-sm font-bold text-cyan-200 hover:bg-cyan-500/20">
                    <Plus className="h-4 w-4" /> Add Admin
                  </button>
                </div>
              </div>
            </div>

            {/* Inline: edit subscription */}
            {showPlan ? (
              (() => {
                const planList = planPrice(newPlan);
                const eff = customPrice.trim() === "" ? planList : Math.max(0, Number(customPrice) || 0);
                const tier = (newPlan || "starter").toLowerCase() as "starter" | "professional" | "enterprise";
                // Add-ons = features the selected plan tier does NOT already include.
                const addons = catalog.filter((f) => !f.includedIn[tier]);
                const enabledCount = addons.filter((f) => overrides[f.key]).length;
                const toggle = (k: string) => setOverrides((o) => ({ ...o, [k]: !o[k] }));
                return (
                  <div className="mt-5 rounded-2xl border border-blue-400/15 bg-blue-500/5 p-5 space-y-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="text-sm font-black text-blue-100">Edit Subscription</div>
                      <div className="flex items-center gap-2">
                        <button disabled={busy === "plan"} onClick={saveSubscription}
                          className="rounded-xl bg-gradient-to-r from-blue-400 to-indigo-400 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-60">
                          {busy === "plan" ? "Saving…" : "Save subscription"}
                        </button>
                        <button onClick={() => setShowPlan(false)}
                          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-white">Cancel</button>
                      </div>
                    </div>

                    {/* Plan tier */}
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">Plan tier</label>
                      <select value={newPlan} onChange={(e) => setNewPlan(e.target.value)}
                        className="rounded-xl border border-white/10 bg-[#071224] px-3 py-2 text-sm text-white outline-none focus:border-blue-400">
                        <option value="starter">Starter (Free)</option>
                        <option value="professional">Professional</option>
                        <option value="enterprise">Enterprise</option>
                      </select>
                      <span className="text-xs text-white/40">list price {planList > 0 ? `${money(planList, cur)}/mo` : "Free"}</span>
                    </div>

                    {/* Feature add-ons (grant features above the plan tier) */}
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">
                          Feature add-ons {enabledCount > 0 ? <span className="text-blue-300">· {enabledCount} on</span> : null}
                        </label>
                        <span className="text-[11px] text-white/35">granted on top of {planLabel(newPlan)}</span>
                      </div>
                      {addons.length === 0 ? (
                        <p className="mt-2 text-xs text-white/40">This tier already includes every feature — nothing to add.</p>
                      ) : (
                        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {addons.map((f) => {
                            const on = !!overrides[f.key];
                            return (
                              <button key={f.key} type="button" onClick={() => toggle(f.key)}
                                className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs font-bold transition ${
                                  on ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-black/20 text-white/55 hover:bg-white/5"
                                }`}>
                                <span className="truncate">{f.label}</span>
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wider ${on ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 text-white/40"}`}>
                                  {on ? "On" : "Off"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Custom price + effective cost */}
                    <div className="flex flex-wrap items-end gap-4">
                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">Custom price (ZAR/mo)</label>
                        <input type="number" min={0} value={customPrice} onChange={(e) => setCustomPrice(e.target.value)}
                          placeholder={`${planList} (plan price)`}
                          className="mt-1 w-44 rounded-xl border border-white/10 bg-[#071224] px-3 py-2 text-sm text-white outline-none focus:border-blue-400" />
                        <div className="mt-1 text-[10px] text-white/35">Blank = bill at the {planLabel(newPlan)} list price.</div>
                      </div>
                      <div className="rounded-2xl border border-blue-400/20 bg-blue-500/10 px-4 py-2.5">
                        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">Effective billing</div>
                        <div className="text-xl font-black text-blue-100">{eff > 0 ? `${money(eff, cur)}/mo` : "Free"}</div>
                      </div>
                    </div>

                    <p className="text-[11px] leading-snug text-white/40">
                      Add-ons grant the selected features to this tenant on top of their plan (e.g. give a
                      Professional client Freight Forwarding without a full Enterprise upgrade). Set a custom
                      price to bill the negotiated amount — it overrides the list price for MRR. All changes are
                      recorded to the owner audit trail.
                    </p>
                  </div>
                );
              })()
            ) : null}

            {/* Inline: create admin */}
            {showCreateUser ? (
              <div className="mt-5 rounded-2xl border border-cyan-400/10 bg-cyan-500/5 p-4 space-y-3">
                <div className="text-sm font-bold text-cyan-200">Create Admin User</div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[{ key: "name", label: "Name", ph: "Jane Smith" }, { key: "email", label: "Email *", ph: "jane@tenant.com" }, { key: "password", label: "Password *", ph: "••••••••" }].map(({ key, label, ph }) => (
                    <div key={key}>
                      <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">{label}</label>
                      <input type={key === "password" ? "password" : "text"} value={(newUser as any)[key]}
                        onChange={(e) => setNewUser((u) => ({ ...u, [key]: e.target.value }))}
                        placeholder={ph} className="mt-1 w-full rounded-xl border border-white/10 bg-[#071224] px-3 py-2 text-sm text-white outline-none focus:border-blue-400" />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button disabled={busy === "user"} onClick={createUser}
                    className="rounded-xl bg-gradient-to-r from-cyan-400 to-blue-400 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-60">
                    {busy === "user" ? "Creating…" : "Create"}
                  </button>
                  <button onClick={() => setShowCreateUser(false)}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-white">Cancel</button>
                </div>
              </div>
            ) : null}
          </div>

          {/* Usage + revenue */}
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="MRR" value={money(d.revenue.mrr, cur)} sub="/mo" />
            <Stat label="Collected" value={money(d.revenue.collectedTotal, cur)} sub={`${money(d.revenue.collected30, cur)} in 30d`} />
            <Stat label="Users" value={num(d.usage.users)} />
            <Stat label="Waybills" value={num(d.usage.waybillsTotal)} sub={`${num(d.usage.waybills30)} in 30d`} />
            <Stat label="Drivers" value={num(d.usage.drivers)} />
            <Stat label="Invoices" value={num(d.usage.invoices)} />
          </div>

          {/* Ops + trend */}
          <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
              <div className="text-xl font-black text-white">Volume Trend</div>
              <div className="mt-1 text-sm text-slate-400">Waybills per month (last 6 months)</div>
              <div className="mt-5 h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={d.trend}>
                    <defs>
                      <linearGradient id="tv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="month" stroke="rgba(255,255,255,0.4)" fontSize={11} />
                    <YAxis stroke="rgba(255,255,255,0.4)" fontSize={11} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "#0b1628", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff" }} />
                    <Area type="monotone" dataKey="waybills" name="Waybills" stroke="#22d3ee" fill="url(#tv)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
              <div className="text-xl font-black text-white">Delivery Performance</div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Stat label="Delivery Success" value={`${num(d.operations.deliverySuccess, 1)}%`} />
                <Stat label="On-Time" value={`${num(d.operations.onTimeRate, 1)}%`} />
                <Stat label="Exception Rate" value={`${num(d.operations.exceptionRate, 1)}%`} />
                <Stat label="SLA Breach" value={`${num(d.tenant.slaBreachMinutes)}m`} sub="threshold" />
                <Stat label="Delivered" value={num(d.operations.delivered)} />
                <Stat label="Failed / Returned" value={num(d.operations.failed + d.operations.returned)} />
              </div>
            </div>
          </div>

          {/* Recent activity + audit */}
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
              <div className="text-xl font-black text-white">Recent Waybills</div>
              <div className="mt-4 space-y-2">
                {d.recentWaybills.length ? (
                  d.recentWaybills.map((w) => (
                    <div key={w.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-2.5">
                      <div className="font-mono text-sm text-white">{w.trackingNumber}</div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-300">{w.status}</span>
                        <span className="text-xs text-white/40">{new Date(w.createdAt).toLocaleDateString("en-ZA")}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-slate-400">No waybills yet.</div>
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
              <div className="text-xl font-black text-white">Audit Trail</div>
              <div className="mt-4 space-y-2">
                {d.auditTrail.length ? (
                  d.auditTrail.map((e) => (
                    <div key={e.id} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold capitalize text-white">{e.action.replace(/[._]/g, " ")}</span>
                        <span className="text-xs text-white/40">{new Date(e.createdAt).toLocaleString("en-ZA")}</span>
                      </div>
                      {e.actorEmail ? <div className="mt-0.5 text-xs text-slate-400">by {e.actorEmail}</div> : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-slate-400">No audit events for this tenant.</div>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
