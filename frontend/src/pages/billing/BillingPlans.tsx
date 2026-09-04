import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  CreditCard,
  FileText,
  Loader2,
  Package,
  RefreshCw,
  Sparkles,
  Truck,
  Users,
  Zap,
} from "lucide-react";
import { api } from "../../api/client";
import { getEntitlements, type Entitlements, type UsageMeter } from "../../api/billingApi";
import { PLAN_CATALOG } from "../../lib/planCatalog";

// ── Types ──────────────────────────────────────────────────────────────────

type Invoice = {
  id: string;
  invoiceNumber: string;
  clientName: string;
  total: number;
  status: "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED";
  dueDate?: string | null;
  createdAt?: string;
};

type Company = {
  id: string;
  name: string;
  plan?: string | null;
  isActive?: boolean;
  currency?: string | null;
  trialEndsAt?: string | null;
};

// ── Plan definitions ───────────────────────────────────────────────────────
// Content (names, prices, feature bullets) comes from the shared plan catalog
// so the in-app cards and the marketing Pricing page never drift. Only the
// in-app visual styling lives here.

const PLAN_STYLE: Record<string, { color: string; badge: string; highlighted?: boolean }> = {
  starter:      { color: "border-slate-500/30 bg-slate-500/8",  badge: "text-slate-300 bg-slate-500/15 border-slate-500/30" },
  professional: { color: "border-sky-500/30 bg-sky-500/8",      badge: "text-sky-300 bg-sky-500/15 border-sky-500/30", highlighted: true },
  enterprise:   { color: "border-violet-500/30 bg-violet-500/8", badge: "text-violet-300 bg-violet-500/15 border-violet-500/30" },
};

const PLANS = PLAN_CATALOG.map((p) => ({
  key: p.key,
  name: p.name,
  price: p.period ? `${p.price} ${p.period}` : p.price,
  features: Array.isArray(p.features) ? p.features : [],
  ...PLAN_STYLE[p.key],
}));

// ── Requestable tiers (owner-approved upgrade, no payment provider) ─────────
// The backend REQUESTABLE_PLANS + PLAN_ENTITLEMENTS are the source of truth;
// this list mirrors them for the in-app tier picker.
type UpgradeRequest = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requestedPlan: string;
  currentPlan: string;
  decisionNote?: string | null;
  createdAt: string;
};

const REQUESTABLE_TIERS: { key: string; name: string; price: string }[] = [
  { key: "professional",    name: "Professional — 3 drivers",  price: "R5,999/mo" },
  { key: "professional_10", name: "Professional — 10 drivers", price: "R9,999/mo" },
  { key: "professional_25", name: "Professional — 25 drivers", price: "R19,999/mo" },
  { key: "professional_50", name: "Professional — 50 drivers", price: "R29,999/mo" },
  { key: "enterprise",      name: "Enterprise",                price: "Custom" },
];

const PLAN_LABEL: Record<string, string> =
  Object.fromEntries(REQUESTABLE_TIERS.map((t) => [t.key, t.name]));

// ── Helpers ────────────────────────────────────────────────────────────────

function unwrap(r: any): any { return r?.data ?? r; }

function fmt(amount: number, currency = "ZAR") {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency }).format(amount);
}

function shortDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "2-digit" });
}

const STATUS_STYLE: Record<string, string> = {
  PAID:      "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  SENT:      "border-sky-500/30 bg-sky-500/10 text-sky-300",
  DRAFT:     "border-white/15 bg-white/6 text-white/50",
  OVERDUE:   "border-rose-500/30 bg-rose-500/10 text-rose-300",
  CANCELLED: "border-white/10 bg-white/4 text-white/30",
};

// ── Component ──────────────────────────────────────────────────────────────

function UsageCard({
  label,
  sub,
  icon: Icon,
  meter,
}: {
  label: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  meter: UsageMeter;
}) {
  const pct = meter.unlimited
    ? 0
    : meter.limit === 0
    ? 100
    : Math.min(100, Math.round((meter.used / meter.limit) * 100));
  const near = !meter.unlimited && pct >= 80 && !meter.atLimit;
  const barColor = meter.atLimit
    ? "bg-rose-400"
    : near
    ? "bg-amber-400"
    : "bg-sky-400";

  return (
    <div
      className={`rounded-2xl border p-4 ${
        meter.atLimit
          ? "border-rose-500/30 bg-rose-500/8"
          : near
          ? "border-amber-500/25 bg-amber-500/8"
          : "border-white/8 bg-black/20"
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-white/40" />
        <span className="text-[11px] font-black uppercase tracking-wider text-white/45">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-black text-white">{meter.used}</span>
        <span className="text-sm font-bold text-white/40">
          {meter.unlimited ? "/ ∞" : `/ ${meter.limit}`}
        </span>
        {sub && <span className="ml-auto text-[10px] text-white/30">{sub}</span>}
      </div>
      {meter.unlimited ? (
        <p className="mt-2 text-[11px] font-bold text-emerald-300/80">Unlimited</p>
      ) : (
        <>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/8">
            <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
          </div>
          <p className={`mt-1.5 text-[11px] font-semibold ${meter.atLimit ? "text-rose-300" : "text-white/40"}`}>
            {meter.atLimit
              ? "Limit reached"
              : `${meter.remaining} remaining`}
          </p>
        </>
      )}
    </div>
  );
}

export default function BillingPlans() {
  const navigate = useNavigate();
  const [company, setCompany] = useState<Company | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<UpgradeRequest[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string>("");
  const [requestNote, setRequestNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const loadRequests = async () => {
    try {
      const r: any = await api.get("/billing/upgrade-requests");
      const list = unwrap(r);
      setRequests(Array.isArray(list) ? list : []);
    } catch { /* non-fatal */ }
  };

  useEffect(() => {
    void (async () => {
      try {
        const [cRaw, iRaw, entRaw] = await Promise.all([
          api.get("/companies/my-company"),
          api.get("/invoices/supervisor"),
          getEntitlements().catch(() => null),
        ]);
        const c = unwrap(cRaw);
        const iList: any = unwrap(iRaw);
        setCompany(c);
        if (entRaw) setEntitlements(entRaw);
        const arr: Invoice[] = Array.isArray(iList)
          ? iList
          : Array.isArray(iList?.data)
          ? iList.data
          : [];
        setInvoices(arr.slice(0, 6));
      } catch {
        // gracefully show what we have
      } finally {
        setLoading(false);
      }
      void loadRequests();
    })();
  }, []);

  const pendingRequest = requests.find((r) => r.status === "PENDING") ?? null;

  const currentPlanKey = String(company?.plan ?? "starter").toLowerCase();
  const currentPlan = PLANS.find(p => p.key === currentPlanKey) ?? PLANS[0];

  // Trial countdown
  const trialDaysLeft = company?.trialEndsAt
    ? Math.ceil((new Date(company.trialEndsAt).getTime() - Date.now()) / 86400000)
    : null;
  const onTrial = trialDaysLeft !== null && trialDaysLeft > 0;

  // Open the tier picker. `preselect` lets a card jump straight to its tier.
  const handleUpgrade = (plan: { key: string }) => {
    if (plan.key === "starter") return; // no downgrade to free post-trial
    if (pendingRequest) {
      setNotice({ kind: "err", text: "You already have an upgrade request awaiting approval." });
      return;
    }
    // Default the picker to a sensible tier for the card that was clicked.
    setSelectedTier(plan.key === "enterprise" ? "enterprise" : plan.key === "professional" ? "professional_10" : plan.key);
    setRequestNote("");
    setNotice(null);
    setPickerOpen(true);
  };

  const submitUpgradeRequest = async () => {
    if (!selectedTier) return;
    setSubmitting(true);
    setNotice(null);
    try {
      await api.post("/billing/upgrade-requests", {
        requestedPlan: selectedTier,
        note: requestNote.trim() || undefined,
      });
      setPickerOpen(false);
      setNotice({
        kind: "ok",
        text: `Upgrade request sent to FlowOps for approval. You'll be notified once it's reviewed.`,
      });
      await loadRequests();
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message ?? "Could not send the request. Please try again.";
      setNotice({ kind: "err", text: String(msg) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(30,80,140,0.14),transparent_28%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8 overflow-y-auto">
      <div className="mx-auto max-w-[1100px] space-y-6">

        {/* ── Header ── */}
        <div className="rounded-[30px] border border-white/10 bg-white/6 p-6 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/85 ring-1 ring-white/15">
                <CreditCard className="h-3.5 w-3.5 text-sky-400" />
                Billing &amp; Plans
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-white">
                Subscription &amp; Billing
              </h1>
              <p className="mt-1 text-sm text-white/50">
                Manage your plan, view invoice history, and upgrade at any time.
              </p>
            </div>
            <button
              onClick={() => navigate("/invoices")}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/60 hover:bg-white/10 hover:text-white transition"
            >
              <FileText className="h-4 w-4" />
              All Invoices
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Upgrade request status ── */}
        {notice && (
          <div
            className={`rounded-[18px] border px-5 py-3 text-sm font-semibold ${
              notice.kind === "ok"
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                : "border-rose-400/30 bg-rose-500/10 text-rose-200"
            }`}
          >
            {notice.text}
          </div>
        )}

        {pendingRequest && (
          <div className="rounded-[18px] border border-sky-400/30 bg-sky-500/10 px-5 py-4 flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-sky-300 animate-spin shrink-0" />
            <div>
              <p className="text-sm font-black text-sky-200">
                Upgrade request pending approval — {PLAN_LABEL[pendingRequest.requestedPlan] ?? pendingRequest.requestedPlan}
              </p>
              <p className="text-xs text-sky-300/60 mt-0.5">
                Requested {shortDate(pendingRequest.createdAt)}. FlowOps will review and activate it shortly.
              </p>
            </div>
          </div>
        )}

        {!pendingRequest && requests[0]?.status === "REJECTED" && (
          <div className="rounded-[18px] border border-white/12 bg-white/5 px-5 py-3 text-sm text-white/60">
            Your last upgrade request ({PLAN_LABEL[requests[0].requestedPlan] ?? requests[0].requestedPlan}) was not approved.
            {requests[0].decisionNote ? ` Reason: ${requests[0].decisionNote}` : ""} You can submit a new request below.
          </div>
        )}

        {/* ── Trial banner ── */}
        {onTrial && (
          <div className="rounded-[20px] border border-amber-400/30 bg-amber-500/10 px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-amber-300 shrink-0" />
              <div>
                <p className="text-sm font-black text-amber-200">
                  14-day Pro trial — <span className="text-amber-300">{trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} remaining</span>
                </p>
                <p className="text-xs text-amber-300/60 mt-0.5">
                  After the trial your account will be locked. Upgrade to Professional or Enterprise to keep access.
                </p>
              </div>
            </div>
            <button
              onClick={() => handleUpgrade({ key: "professional" })}
              disabled={!!pendingRequest}
              className="shrink-0 rounded-xl border border-amber-400/30 bg-amber-500/20 px-4 py-2 text-xs font-black text-amber-200 hover:bg-amber-500/30 transition disabled:opacity-50"
            >
              {pendingRequest ? "Request pending…" : "Upgrade to Pro →"}
            </button>
          </div>
        )}

        {/* ── Trial EXPIRED banner (account locked) ── */}
        {!onTrial && entitlements?.trialExpired && (
          <div className="rounded-[20px] border-2 border-rose-500/40 bg-rose-500/10 px-5 py-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-rose-400 shrink-0" />
              <div>
                <p className="text-base font-black text-rose-200">
                  Your trial has expired — account is locked
                </p>
                <p className="text-sm text-rose-300/70 mt-1">
                  Upgrade to Professional or Enterprise to restore full access.
                  All your data is safe and waiting.
                </p>
              </div>
            </div>
            <button
              onClick={() => handleUpgrade({ key: "professional" })}
              disabled={!!pendingRequest}
              className="shrink-0 rounded-xl bg-rose-500 px-5 py-3 text-sm font-black text-white hover:bg-rose-600 transition shadow-lg shadow-rose-500/20 disabled:opacity-50"
            >
              {pendingRequest ? "Request pending…" : "Upgrade Now — Restore Access"}
            </button>
          </div>
        )}

        {/* ── Current plan card ── */}
        {loading ? (
          <div className="animate-pulse h-32 rounded-[28px] bg-white/5" />
        ) : (
          <div className={`rounded-[28px] border ${currentPlan.color} p-6 shadow-[0_18px_60px_rgba(0,0,0,0.3)]`}>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">
                  <BadgeCheck className="h-6 w-6 text-white/80" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-white/45 mb-1">
                    Current Plan
                  </p>
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-black text-white">{currentPlan.name}</h2>
                    <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${currentPlan.badge}`}>
                      {company?.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-white/50">{currentPlan.price}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => navigate("/billing-batches")}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/8 px-4 py-2.5 text-sm font-bold text-white/70 hover:bg-white/15 hover:text-white transition"
                >
                  <FileText className="h-4 w-4" />
                  Billing Batches
                </button>
                <button
                  onClick={() => navigate("/rate-cards")}
                  className="flex items-center gap-2 rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-2.5 text-sm font-bold text-sky-300 hover:bg-sky-500/20 transition"
                >
                  <Zap className="h-4 w-4" />
                  Rate Cards
                </button>
              </div>
            </div>

            {/* Included features */}
            <div className="mt-5 flex flex-wrap gap-2">
              {(currentPlan.features || []).map(f => (
                <div key={f} className="flex items-center gap-1.5 rounded-xl border border-white/8 bg-black/20 px-3 py-1.5 text-xs text-white/65">
                  <CheckCircle2 className="h-3 w-3 text-emerald-400/70 flex-shrink-0" />
                  {f}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Usage this month ── */}
        {!loading && entitlements && (
          <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.3)]">
            <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-sky-500/15 ring-1 ring-sky-500/20">
                  <Zap className="h-4 w-4 text-sky-400" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Usage this month</h3>
                  <p className="text-[11px] text-white/40">
                    Live against your {entitlements.planName} plan limits
                    {entitlements.onTrial && (
                      <span className="text-amber-300/80"> · Pro trial active</span>
                    )}
                  </p>
                </div>
              </div>
              {Object.values(entitlements.usage).some((m) => m.atLimit) && (
                <span className="flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-[11px] font-bold text-rose-300">
                  <AlertTriangle className="h-3.5 w-3.5" /> Limit reached — upgrade to add more
                </span>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <UsageCard label="Waybills" sub="this month" icon={Package} meter={entitlements.usage.waybillsThisMonth} />
              <UsageCard label="Drivers" sub="active" icon={Truck} meter={entitlements.usage.drivers} />
              <UsageCard label="Team members" sub="active" icon={Users} meter={entitlements.usage.users} />
              <UsageCard label="Branches" sub="" icon={Building2} meter={entitlements.usage.branches} />
            </div>
          </div>
        )}

        {/* ── Plan comparison ── */}
        <div>
          <h2 className="mb-3 px-1 text-xs font-black uppercase tracking-[0.18em] text-white/40">
            Available Plans
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {PLANS.map(plan => {
              const isCurrent = plan.key === currentPlanKey;
              return (
                <div
                  key={plan.key}
                  className={`rounded-[24px] border p-5 flex flex-col ${plan.color} ${
                    plan.highlighted ? "shadow-[0_0_40px_rgba(56,189,248,0.15)]" : ""
                  } ${isCurrent ? "ring-2 ring-sky-400/30" : ""}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-black text-white">{plan.name}</h3>
                    {isCurrent && (
                      <span className="rounded-full bg-sky-500/20 border border-sky-500/30 px-2 py-0.5 text-[10px] font-bold text-sky-300 uppercase tracking-wider">
                        Current
                      </span>
                    )}
                    {plan.highlighted && !isCurrent && (
                      <span className="rounded-full bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1">
                        <Sparkles className="h-3 w-3" /> Popular
                      </span>
                    )}
                  </div>
                  <p className="text-xl font-black text-white mb-4">{plan.price}</p>
                  <div className="flex-1 space-y-2 mb-5">
                    {(plan.features || []).map(f => (
                      <div key={f} className="flex items-center gap-2 text-xs text-white/65">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/70 flex-shrink-0" />
                        {f}
                      </div>
                    ))}
                  </div>
                  {!isCurrent && plan.key !== "starter" && (
                    <button
                      disabled={!!pendingRequest}
                      onClick={() => handleUpgrade(plan)}
                      title={pendingRequest ? "You already have a request awaiting approval" : undefined}
                      className={`w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition ${
                        plan.highlighted
                          ? "bg-sky-500/20 border border-sky-500/30 text-sky-300 hover:bg-sky-500/30"
                          : "bg-white/8 border border-white/10 text-white/70 hover:bg-white/15 hover:text-white"
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      {plan.key === "enterprise" ? (
                        <>Request Enterprise <ArrowRight className="h-3.5 w-3.5" /></>
                      ) : (
                        <>Request Upgrade <ArrowRight className="h-3.5 w-3.5" /></>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Recent invoices ── */}
        <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.3)]">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/20">
                <FileText className="h-4 w-4 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white">Recent Invoices</h3>
                <p className="text-[11px] text-white/40">Last 6 billing documents</p>
              </div>
            </div>
            <button
              onClick={() => navigate("/invoices")}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-white/50 hover:text-white hover:bg-white/10 transition"
            >
              View All <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-white/30" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 rounded-2xl border border-dashed border-white/10 text-center">
              <FileText className="h-8 w-8 text-white/15 mb-3" />
              <p className="text-sm text-white/30">No invoices yet</p>
              <p className="text-xs text-white/20 mt-1">Invoices appear here once generated</p>
            </div>
          ) : (
            <div className="space-y-2">
              {invoices.map(inv => (
                <div
                  key={inv.id}
                  onClick={() => navigate("/invoices")}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-white/6 bg-black/20 px-4 py-3 cursor-pointer hover:border-white/15 hover:bg-white/5 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-4 w-4 text-white/30 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white truncate">
                        {inv.invoiceNumber}
                      </div>
                      <div className="text-[11px] text-white/40 truncate">
                        {inv.clientName}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLE[inv.status] ?? STATUS_STYLE.DRAFT}`}>
                      {inv.status}
                    </span>
                    <div className="text-right">
                      <div className="text-sm font-black text-white">
                        {fmt(inv.total, company?.currency ?? "ZAR")}
                      </div>
                      <div className="text-[10px] text-white/30">
                        {inv.dueDate ? `Due ${shortDate(inv.dueDate)}` : shortDate(inv.createdAt)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* ── Tier picker modal (request upgrade → owner approval) ── */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => !submitting && setPickerOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-[24px] border border-white/12 bg-[#0b1226] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-1">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500/15 ring-1 ring-sky-500/25">
                <Sparkles className="h-5 w-5 text-sky-300" />
              </div>
              <h3 className="text-lg font-black text-white">Request a plan upgrade</h3>
            </div>
            <p className="text-xs text-white/50 mb-4">
              Pick the tier you'd like. FlowOps reviews and activates it — no card required here.
            </p>

            <label className="block text-[11px] font-black uppercase tracking-wider text-white/45 mb-2">
              Target tier
            </label>
            <div className="space-y-2 mb-4">
              {REQUESTABLE_TIERS.filter((t) => t.key !== currentPlanKey).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setSelectedTier(t.key)}
                  className={`w-full flex items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                    selectedTier === t.key
                      ? "border-sky-400/50 bg-sky-500/15"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <span className="text-sm font-bold text-white">{t.name}</span>
                  <span className="text-xs text-white/50">{t.price}</span>
                </button>
              ))}
            </div>

            <label className="block text-[11px] font-black uppercase tracking-wider text-white/45 mb-2">
              Note (optional)
            </label>
            <textarea
              value={requestNote}
              onChange={(e) => setRequestNote(e.target.value)}
              rows={3}
              placeholder="Anything the FlowOps team should know…"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-sky-500/50 resize-none"
            />

            {notice?.kind === "err" && (
              <p className="mt-3 text-xs font-semibold text-rose-300">{notice.text}</p>
            )}

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setPickerOpen(false)}
                disabled={submitting}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-bold text-white/60 hover:bg-white/10 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submitUpgradeRequest}
                disabled={submitting || !selectedTier}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-sky-500/90 py-2.5 text-sm font-black text-white hover:bg-sky-400 disabled:opacity-50 disabled:cursor-wait"
              >
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <>Send request <ArrowRight className="h-4 w-4" /></>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
