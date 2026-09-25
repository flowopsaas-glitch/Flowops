import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, Copy, Check, Loader2, Plus, Package } from "lucide-react";
import { api } from "../../api/client";

// ── Types ──────────────────────────────────────────────────────────────────
type AddonCatalogItem = {
  key: string;
  label: string;
  priceZar: number;
  includedIn: { starter: boolean; professional: boolean; enterprise: boolean };
};

type Quote = {
  companyName: string | null;
  currency: string;
  interval: "month" | "year";
  plan: { id: string; name: string; priceZar: number };
  addons: { key: string; label: string; priceZar: number; note?: string }[];
  totals: {
    basePriceZar: number;
    addonsZar: number;
    listTotalZar: number;
    customPriceZar: number | null;
    finalMonthlyZar: number;
    finalForIntervalZar: number;
    discountVsListZar: number;
  };
  generatedAt: string;
};

const PLAN_OPTIONS = [
  { id: "starter", name: "Starter (Free)" },
  { id: "professional", name: "Professional — 3 drivers (R5,999)" },
  { id: "professional_10", name: "Professional — 10 drivers (R9,999)" },
  { id: "professional_25", name: "Professional — 25 drivers (R19,999)" },
  { id: "professional_50", name: "Professional — 50 drivers (R29,999)" },
  { id: "enterprise", name: "Enterprise (R100,000)" },
];

function unwrap(r: any): any {
  return r?.data ?? r;
}
const zar = (n: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(n);

export default function OwnerQuoteMachine() {
  const [catalog, setCatalog] = useState<AddonCatalogItem[]>([]);
  const [plan, setPlan] = useState("professional_10");
  const [selected, setSelected] = useState<Set<string>>(new Set(["rail"]));
  const [customPrice, setCustomPrice] = useState<string>("");
  const [companyName, setCompanyName] = useState("");
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r: any = await api.get("/owner/addon-catalog");
        const list = unwrap(r);
        setCatalog(Array.isArray(list) ? list : []);
      } catch { /* non-fatal */ }
    })();
  }, []);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const calculate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r: any = await api.post("/owner/quote", {
        plan,
        addons: Array.from(selected),
        customPriceZar: customPrice.trim() === "" ? null : Number(customPrice),
        companyName: companyName.trim() || null,
        billingInterval: interval,
      });
      setQuote(unwrap(r));
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? "Could not build the quote.");
    } finally {
      setLoading(false);
    }
  }, [plan, selected, customPrice, companyName, interval]);

  // Auto-calculate whenever inputs change.
  useEffect(() => { void calculate(); }, [calculate]);

  const quoteText = useMemo(() => {
    if (!quote) return "";
    const lines: string[] = [];
    lines.push(`FlowOps Quote${quote.companyName ? ` — ${quote.companyName}` : ""}`);
    lines.push("");
    lines.push(`Base plan: ${quote.plan.name} — ${zar(quote.plan.priceZar)}/mo`);
    if (quote.addons.length) {
      lines.push("Add-ons:");
      for (const a of quote.addons) {
        lines.push(`  • ${a.label} — ${a.priceZar === 0 ? (a.note ?? "included") : `${zar(a.priceZar)}/mo`}`);
      }
    }
    lines.push("");
    lines.push(`List total: ${zar(quote.totals.listTotalZar)}/mo`);
    if (quote.totals.customPriceZar != null) {
      lines.push(`Negotiated price: ${zar(quote.totals.finalMonthlyZar)}/mo`);
      if (quote.totals.discountVsListZar > 0) lines.push(`(saving ${zar(quote.totals.discountVsListZar)}/mo vs list)`);
    }
    if (quote.interval === "year") {
      lines.push(`Billed annually: ${zar(quote.totals.finalForIntervalZar)}/yr`);
    }
    lines.push("");
    lines.push("All prices in ZAR. Add-ons are available on any base plan.");
    return lines.join("\n");
  }, [quote]);

  const copyQuote = async () => {
    try {
      await navigator.clipboard.writeText(quoteText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/25">
          <Calculator className="h-6 w-6 text-emerald-300" />
        </div>
        <div>
          <h1 className="text-2xl font-black">Quote Machine</h1>
          <p className="text-sm text-white/50">Build a plan + add-ons quote for a prospect. Add-ons stack on any base plan; set a custom price to negotiate.</p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200">{error}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Builder ── */}
        <div className="space-y-5 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-white/45 mb-2">Prospect / company (optional)</label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Mishoma Holdings"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-emerald-500/50"
            />
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-white/45 mb-2">Base plan</label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50"
            >
              {PLAN_OPTIONS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-white/45 mb-2">Add-ons</label>
            <div className="space-y-2">
              {catalog.map((a) => {
                const bundled = plan.startsWith("professional") ? a.includedIn.professional : plan === "enterprise" ? a.includedIn.enterprise : a.includedIn.starter;
                const on = selected.has(a.key);
                return (
                  <button
                    key={a.key}
                    onClick={() => toggle(a.key)}
                    className={`w-full flex items-center justify-between rounded-xl border px-4 py-2.5 text-left transition ${
                      on ? "border-emerald-400/50 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-white">
                      {on ? <Check className="h-4 w-4 text-emerald-300" /> : <Plus className="h-4 w-4 text-white/40" />}
                      {a.label}
                    </span>
                    <span className="text-xs text-white/50">
                      {bundled ? <span className="text-emerald-300/70">included in plan</span> : `${zar(a.priceZar)}/mo`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-white/45 mb-2">Custom price (optional)</label>
              <input
                type="number"
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                placeholder="Negotiated ZAR/mo"
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-emerald-500/50"
              />
            </div>
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-white/45 mb-2">Billing</label>
              <select
                value={interval}
                onChange={(e) => setInterval(e.target.value as "month" | "year")}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50"
              >
                <option value="month">Monthly</option>
                <option value="year">Annual (×12)</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Quote summary ── */}
        <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-emerald-500/8 to-transparent p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-white/60">
              <Package className="h-4 w-4 text-emerald-300" /> Quote
            </h2>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-white/40" />}
          </div>

          {quote ? (
            <div className="space-y-3">
              {quote.companyName && <p className="text-lg font-black text-white">{quote.companyName}</p>}

              <div className="flex items-center justify-between text-sm">
                <span className="text-white/70">{quote.plan.name}</span>
                <span className="font-semibold text-white">{zar(quote.plan.priceZar)}/mo</span>
              </div>

              {quote.addons.map((a) => (
                <div key={a.key} className="flex items-center justify-between text-sm">
                  <span className="text-white/60">+ {a.label}{a.note ? <span className="text-emerald-300/60 text-xs"> ({a.note})</span> : ""}</span>
                  <span className="text-white/80">{a.priceZar === 0 ? "—" : `${zar(a.priceZar)}/mo`}</span>
                </div>
              ))}

              <div className="my-2 border-t border-white/10" />

              <div className="flex items-center justify-between text-sm">
                <span className="text-white/50">List total</span>
                <span className={`font-semibold ${quote.totals.customPriceZar != null ? "text-white/40 line-through" : "text-white"}`}>
                  {zar(quote.totals.listTotalZar)}/mo
                </span>
              </div>

              {quote.totals.customPriceZar != null && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-emerald-300">Negotiated</span>
                  <span className="font-black text-emerald-300">{zar(quote.totals.finalMonthlyZar)}/mo</span>
                </div>
              )}

              {quote.totals.discountVsListZar > 0 && (
                <p className="text-xs text-emerald-300/70">Saving {zar(quote.totals.discountVsListZar)}/mo vs list price</p>
              )}

              <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 mt-2">
                <p className="text-[11px] font-black uppercase tracking-wider text-emerald-200/70">
                  {quote.interval === "year" ? "Total billed annually" : "Total monthly"}
                </p>
                <p className="text-3xl font-black text-white mt-1">{zar(quote.totals.finalForIntervalZar)}</p>
                <p className="text-xs text-white/40">{quote.interval === "year" ? "per year" : "per month"} · ZAR</p>
              </div>

              <button
                onClick={copyQuote}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/5 py-2.5 text-sm font-bold text-white/80 hover:bg-white/10"
              >
                {copied ? <><Check className="h-4 w-4 text-emerald-300" /> Copied</> : <><Copy className="h-4 w-4" /> Copy quote text</>}
              </button>
            </div>
          ) : (
            <p className="text-sm text-white/40">Select a plan and add-ons to build a quote.</p>
          )}
        </div>
      </div>
    </div>
  );
}
