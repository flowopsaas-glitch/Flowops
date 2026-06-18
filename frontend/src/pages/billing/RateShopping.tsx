import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck, ChevronDown, ChevronUp, Gauge, Loader2, Package,
  RefreshCw, Sparkles, Truck, Zap,
} from "lucide-react";
import { api } from "../../api/client";

type CarrierConfig = { enabled: boolean; markupPct: number };

type CarrierRate = {
  carrier:     string;
  service:     string;
  serviceCode: string;
  base:        number;
  fuelSurcharge: number;
  vat:         number;
  total:       number;
  transitDays: string;
  currency:    string;
  source:      "live" | "table";
  bestValue?:  boolean;
  fastest?:    boolean;
};

type RateResult = {
  rates:         CarrierRate[];
  requestedAt:   string;
  fromAddress:   string;
  toAddress:     string;
  weightKg:      number;
  parcels:       number;
};

function money(v?: number | null) {
  return `ZAR ${(v ?? 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const CARRIER_COLORS: Record<string, string> = {
  "Aramex SA":    "border-red-400/30 bg-red-500/8",
  "DHL Express":  "border-yellow-400/30 bg-yellow-500/8",
  "PostNet":      "border-purple-400/30 bg-purple-500/8",
  "Courier IT":   "border-blue-400/30 bg-blue-500/8",
  "RAM Couriers": "border-orange-400/30 bg-orange-500/8",
};

export default function RateShopping() {
  const [carriers, setCarriers]     = useState<string[]>([]);
  const [configs, setConfigs]       = useState<Record<string, CarrierConfig>>({});
  const [from, setFrom]             = useState("");
  const [to, setTo]                 = useState("");
  const [weight, setWeight]         = useState("");
  const [parcels, setParcels]       = useState("1");
  const [result, setResult]         = useState<RateResult | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    api.get("/rate-shopping/carriers").then((raw: any) => {
      const list: string[] = Array.isArray(raw?.data ?? raw) ? (raw?.data ?? raw) : [];
      setCarriers(list);
      const defaults: Record<string, CarrierConfig> = {};
      list.forEach((c) => (defaults[c] = { enabled: true, markupPct: 0 }));
      setConfigs(defaults);
    });
  }, []);

  const compare = useCallback(async () => {
    if (!from.trim() || !to.trim() || !weight) {
      setError("All fields are required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const raw: any = await api.post("/rate-shopping/compare", {
        fromAddress: from.trim(),
        toAddress:   to.trim(),
        weightKg:    parseFloat(weight),
        parcels:     parseInt(parcels, 10) || 1,
        carrierConfigs: configs,
      });
      setResult(raw?.data ?? raw);
    } catch (err: any) {
      setError(err?.message || "Failed to fetch rates.");
    } finally {
      setLoading(false);
    }
  }, [from, to, weight, parcels, configs]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-7 shadow-xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-xs font-bold text-sky-300">
              <Gauge className="h-3.5 w-3.5" /> Rate Shopping
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white">Multi-Carrier Rates</h1>
            <p className="mt-1 text-sm text-slate-400">
              Compare live + table rates from Aramex SA, DHL Express, PostNet, Courier IT, RAM Couriers.
            </p>
          </div>
          <button
            onClick={() => setShowConfig((v) => !v)}
            className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white/70 hover:bg-white/10"
          >
            {showConfig ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            Carrier Settings
          </button>
        </div>
      </div>

      {/* Carrier config */}
      {showConfig && carriers.length > 0 && (
        <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5 space-y-3">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-white/50 mb-3">
            Carrier Settings — enable/disable + markup %
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {carriers.map((c) => {
              const cfg = configs[c] ?? { enabled: true, markupPct: 0 };
              return (
                <div key={c} className={`rounded-2xl border p-4 transition-all ${cfg.enabled ? (CARRIER_COLORS[c] ?? "border-white/10 bg-white/5") : "border-white/5 bg-white/[0.02] opacity-50"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-white">{c}</span>
                    <button
                      onClick={() => setConfigs((p) => ({ ...p, [c]: { ...cfg, enabled: !cfg.enabled } }))}
                      className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase transition ${cfg.enabled ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/5 text-white/40"}`}
                    >
                      {cfg.enabled ? "On" : "Off"}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-white/40 whitespace-nowrap">Markup %</label>
                    <input
                      type="number" min="0" max="100" step="0.5"
                      value={cfg.markupPct}
                      onChange={(e) => setConfigs((p) => ({ ...p, [c]: { ...cfg, markupPct: parseFloat(e.target.value) || 0 } }))}
                      className="w-full rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-sm text-white outline-none"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Input form */}
      <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">From Address *</label>
            <input
              value={from} onChange={(e) => setFrom(e.target.value)}
              placeholder="22 Rissik St, Johannesburg"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#071224] px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">To Address *</label>
            <input
              value={to} onChange={(e) => setTo(e.target.value)}
              placeholder="45 Long St, Cape Town"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#071224] px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">Weight (kg) *</label>
            <div className="relative mt-1.5">
              <Package className="absolute left-3 top-2.5 h-4 w-4 text-white/30" />
              <input
                value={weight} onChange={(e) => setWeight(e.target.value)}
                type="number" min="0.1" step="0.1" placeholder="2.5"
                className="w-full rounded-xl border border-white/10 bg-[#071224] pl-9 pr-3 py-2.5 text-sm text-white outline-none focus:border-sky-400"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">Parcels</label>
            <input
              value={parcels} onChange={(e) => setParcels(e.target.value)}
              type="number" min="1" step="1"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#071224] px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400"
            />
          </div>
          <div className="sm:col-span-2 flex items-end">
            <button
              onClick={compare} disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-400 to-blue-500 py-3 text-sm font-bold text-slate-950 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {loading ? "Fetching rates…" : "Compare Rates"}
            </button>
          </div>
        </div>
        {error && (
          <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <Truck className="h-4 w-4" />
            {result.fromAddress} → {result.toAddress} · {result.weightKg} kg · {result.parcels} parcel{result.parcels !== 1 ? "s" : ""}
          </div>

          {result.rates.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-white/10 py-16 text-center text-white/30">
              No rates available — all carriers disabled or error.
            </div>
          ) : (
            result.rates.map((rate) => (
              <div
                key={rate.serviceCode}
                className={`rounded-[24px] border p-5 transition-all ${
                  rate.bestValue
                    ? "border-emerald-400/30 bg-emerald-500/8 shadow-[0_0_30px_rgba(52,211,153,0.06)]"
                    : rate.fastest
                    ? "border-sky-400/30 bg-sky-500/8"
                    : "border-white/10 bg-white/[0.05]"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-white text-base">{rate.carrier}</span>
                      <span className="text-sm text-slate-400">{rate.service}</span>
                      {rate.bestValue && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-black text-emerald-300">
                          <BadgeCheck className="h-3 w-3" /> Best Value
                        </span>
                      )}
                      {rate.fastest && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-500/15 px-2 py-0.5 text-[10px] font-black text-sky-300">
                          <Sparkles className="h-3 w-3" /> Fastest
                        </span>
                      )}
                      {rate.source === "live" && (
                        <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold text-violet-300">
                          Live
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      Transit: {rate.transitDays}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-2xl font-black text-white">{money(rate.total)}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Base {money(rate.base)} + Fuel {money(rate.fuelSurcharge)} + VAT {money(rate.vat)}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
