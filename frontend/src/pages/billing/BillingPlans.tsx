import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Sparkles,
  Zap,
} from "lucide-react";
import { api } from "../../api/client";

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
};

// ── Plan definitions ───────────────────────────────────────────────────────

const PLANS = [
  {
    key: "starter",
    name: "Starter",
    price: "Free",
    color: "border-slate-500/30 bg-slate-500/8",
    badge: "text-slate-300 bg-slate-500/15 border-slate-500/30",
    features: [
      "Up to 100 waybills/month",
      "3 driver accounts",
      "Basic dashboard",
      "Email support",
    ],
  },
  {
    key: "professional",
    name: "Professional",
    price: "R 14,999 / mo",
    color: "border-sky-500/30 bg-sky-500/8",
    badge: "text-sky-300 bg-sky-500/15 border-sky-500/30",
    highlighted: true,
    features: [
      "Unlimited waybills",
      "25 driver accounts",
      "AI Control Tower",
      "Route optimisation",
      "WhatsApp & Email hub",
      "COD reconciliation",
      "Webhook & API access",
      "Priority support",
    ],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "Custom",
    color: "border-violet-500/30 bg-violet-500/8",
    badge: "text-violet-300 bg-violet-500/15 border-violet-500/30",
    features: [
      "Everything in Pro",
      "Unlimited drivers",
      "Custom SLA targets",
      "Dedicated onboarding",
      "Multi-branch support",
      "Custom integrations",
      "SLA breach automation",
      "White-label portal",
    ],
  },
];

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

export default function BillingPlans() {
  const navigate = useNavigate();
  const [company, setCompany] = useState<Company | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [cRaw, iRaw] = await Promise.all([
          api.get("/companies/my-company"),
          api.get("/invoices/supervisor"),
        ]);
        const c = unwrap(cRaw);
        const iList: any = unwrap(iRaw);
        setCompany(c);
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
    })();
  }, []);

  const currentPlanKey = String(company?.plan ?? "starter").toLowerCase();
  const currentPlan = PLANS.find(p => p.key === currentPlanKey) ?? PLANS[0];

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
              {currentPlan.features.map(f => (
                <div key={f} className="flex items-center gap-1.5 rounded-xl border border-white/8 bg-black/20 px-3 py-1.5 text-xs text-white/65">
                  <CheckCircle2 className="h-3 w-3 text-emerald-400/70 flex-shrink-0" />
                  {f}
                </div>
              ))}
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
                    {plan.features.map(f => (
                      <div key={f} className="flex items-center gap-2 text-xs text-white/65">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/70 flex-shrink-0" />
                        {f}
                      </div>
                    ))}
                  </div>
                  {!isCurrent && (
                    <button
                      onClick={() =>
                        plan.key === "enterprise"
                          ? window.open("mailto:sales@flowops.io", "_blank")
                          : navigate("/paystack-subscribe")
                      }
                      className={`w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition ${
                        plan.highlighted
                          ? "bg-sky-500/20 border border-sky-500/30 text-sky-300 hover:bg-sky-500/30"
                          : "bg-white/8 border border-white/10 text-white/70 hover:bg-white/15 hover:text-white"
                      }`}
                    >
                      {plan.key === "enterprise" ? (
                        <>Contact Sales <ExternalLink className="h-3.5 w-3.5" /></>
                      ) : (
                        <>Upgrade <ArrowRight className="h-3.5 w-3.5" /></>
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
    </div>
  );
}
