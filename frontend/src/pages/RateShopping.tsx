import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Gauge,
  Package,
  RefreshCw,
  Settings2,
  Truck,
  Zap,
} from "lucide-react";
import { api } from "../api/client";

// ── Types ─────────────────────────────────────────────────────────────────

type Province = { code: string; name: string };

type RateResult = {
  carrierId: string;
  carrierName: string;
  serviceCode: string;
  serviceLabel: string;
  transitDays: number;
  baseRate: number;
  fuelSurcharge: number;
  markupAmount: number;
  totalRate: number;
  currency: string;
  zone: number;
  isEnabled: boolean;
};

type CarrierConfig = {
  id: string;
  name: string;
  services: string[];
  isEnabled: boolean;
  markupPct: number;
  configId: string | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function money(v: number, cur = "ZAR") {
  return `${cur} ${v.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function unwrap(res: any) {
  return res?.data ?? res;
}

const CARRIER_LOGO: Record<string, string> = {
  aramex: "🟠",
  dhl: "🟡",
  postnet: "🔵",
  courier_it: "🟢",
  ram: "🔴",
};

// ── Components ─────────────────────────────────────────────────────────────

function InputField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">
        {label}
      </label>
      {children}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function RateShopping() {
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [carriers, setCarriers] = useState<CarrierConfig[]>([]);
  const [results, setResults] = useState<RateResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const [error, setError] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [savingCarrier, setSavingCarrier] = useState("");

  // Compare form
  const [weight, setWeight] = useState("1");
  const [fromProv, setFromProv] = useState("GP");
  const [toProv, setToProv] = useState("WC");
  const [parcels, setParcels] = useState("1");
  const [showAll, setShowAll] = useState(false);

  // Load provinces + carrier configs on mount
  useEffect(() => {
    async function init() {
      setConfigLoading(true);
      try {
        const [provRes, carrRes] = await Promise.allSettled([
          api.get("/rate-shopping/provinces"),
          api.get("/rate-shopping/carriers"),
        ]);
        if (provRes.status === "fulfilled") {
          const d = unwrap(provRes.value);
          setProvinces(Array.isArray(d) ? d : []);
        }
        if (carrRes.status === "fulfilled") {
          const d = unwrap(carrRes.value);
          setCarriers(Array.isArray(d) ? d : []);
        }
      } finally {
        setConfigLoading(false);
      }
    }
    void init();
  }, []);

  // Compare rates
  async function compare() {
    setLoading(true);
    setError("");
    setResults(null);
    try {
      const res: any = await api.post("/rate-shopping/compare", {
        weight: parseFloat(weight) || 1,
        fromProvince: fromProv,
        toProvince: toProv,
        parcels: parseInt(parcels) || 1,
      });
      const data = unwrap(res);
      setResults(Array.isArray(data) ? data : []);
      setShowAll(false);
    } catch (err: any) {
      setError(err?.message || "Failed to compare rates.");
    } finally {
      setLoading(false);
    }
  }

  // Update carrier config
  async function updateCarrier(
    carrierId: string,
    patch: { isEnabled?: boolean; markupPct?: number }
  ) {
    setSavingCarrier(carrierId);
    try {
      await api.post(`/rate-shopping/carriers/${carrierId}`, patch);
      setCarriers((prev) =>
        prev.map((c) =>
          c.id === carrierId ? { ...c, ...patch } : c
        )
      );
    } finally {
      setSavingCarrier("");
    }
  }

  // Derive cheapest + fastest from results
  const { cheapest, fastest } = useMemo(() => {
    if (!results?.length) return { cheapest: null, fastest: null };
    const enabled = results.filter((r) => r.isEnabled);
    if (!enabled.length) return { cheapest: null, fastest: null };
    const c = enabled.reduce((a, b) => (a.totalRate < b.totalRate ? a : b));
    const f = enabled.reduce((a, b) => (a.transitDays < b.transitDays ? a : b));
    return { cheapest: c, fastest: f };
  }, [results]);

  const displayed = useMemo(() => {
    if (!results) return [];
    const filtered = showAll ? results : results.filter((r) => r.isEnabled);
    return filtered;
  }, [results, showAll]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-7 shadow-xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-blue-200">
              <Truck className="h-3.5 w-3.5" /> Multi-Carrier Rate Shopping
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-white">
              Compare Shipping Rates
            </h1>
            <p className="mt-2 max-w-3xl text-slate-300">
              Compare rates from Aramex, DHL, PostNet, Courier IT and RAM side-by-side.
              Includes 18.5% fuel surcharge and any configured markup.
            </p>
          </div>
          <button
            onClick={() => setShowConfig((v) => !v)}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10"
          >
            <Settings2 className="h-4 w-4" />
            {showConfig ? "Hide" : "Carrier"} Settings
          </button>
        </div>
        {error ? (
          <div className="mt-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}
      </div>

      {/* Carrier settings */}
      {showConfig && (
        <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
          <div className="text-lg font-black text-white mb-1">Carrier Settings</div>
          <p className="text-sm text-slate-400 mb-5">
            Enable/disable carriers and set a markup percentage added on top of
            the base rate + fuel surcharge.
          </p>
          {configLoading ? (
            <div className="text-slate-400 text-sm">Loading carrier configs…</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {carriers.map((c) => (
                <div
                  key={c.id}
                  className={`rounded-2xl border p-4 transition-colors ${
                    c.isEnabled
                      ? "border-white/15 bg-black/20"
                      : "border-white/5 bg-black/10 opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{CARRIER_LOGO[c.id] ?? "📦"}</span>
                      <div className="font-bold text-sm text-white">{c.name}</div>
                    </div>
                    {/* Enable toggle */}
                    <button
                      disabled={savingCarrier === c.id}
                      onClick={() => updateCarrier(c.id, { isEnabled: !c.isEnabled })}
                      className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-60 ${
                        c.isEnabled ? "bg-emerald-500" : "bg-white/20"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          c.isEnabled ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/40 whitespace-nowrap">
                      Markup %
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={c.markupPct}
                      onBlur={(e) =>
                        updateCarrier(c.id, { markupPct: parseFloat(e.target.value) || 0 })
                      }
                      onChange={(e) =>
                        setCarriers((prev) =>
                          prev.map((x) =>
                            x.id === c.id
                              ? { ...x, markupPct: parseFloat(e.target.value) || 0 }
                              : x
                          )
                        )
                      }
                      className="w-20 rounded-xl border border-white/10 bg-[#071224] px-2 py-1 text-sm text-white outline-none focus:border-blue-400"
                    />
                    <span className="text-sm text-white/40">%</span>
                  </div>
                  <div className="mt-2 text-[10px] text-slate-500">
                    {c.services.length} service{c.services.length > 1 ? "s" : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Compare form */}
      <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <InputField label="Weight (kg)">
            <input
              type="number"
              min="0.1"
              max="30"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-[#071224] px-4 py-3 text-white outline-none focus:border-blue-400"
            />
          </InputField>

          <InputField label="From Province">
            <select
              value={fromProv}
              onChange={(e) => setFromProv(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-[#071224] px-4 py-3 text-white outline-none focus:border-blue-400"
            >
              {provinces.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </InputField>

          <InputField label="To Province">
            <select
              value={toProv}
              onChange={(e) => setToProv(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-[#071224] px-4 py-3 text-white outline-none focus:border-blue-400"
            >
              {provinces.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </InputField>

          <InputField label="Parcels">
            <input
              type="number"
              min="1"
              max="999"
              value={parcels}
              onChange={(e) => setParcels(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-[#071224] px-4 py-3 text-white outline-none focus:border-blue-400"
            />
          </InputField>

          <div className="flex items-end">
            <button
              disabled={loading}
              onClick={compare}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-400 to-indigo-400 px-6 py-3 font-bold text-slate-950 shadow disabled:opacity-60"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Package className="h-4 w-4" />
              )}
              {loading ? "Comparing…" : "Compare Rates"}
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {results !== null && (
        <>
          {/* Summary badges */}
          {cheapest && fastest && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-[24px] border border-emerald-400/20 bg-emerald-500/5 p-5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
                  <CheckCircle className="h-4 w-4" /> Best Value
                </div>
                <div className="mt-2 text-2xl font-black text-white">
                  {money(cheapest.totalRate, cheapest.currency)}
                </div>
                <div className="mt-1 text-sm text-slate-300">{cheapest.serviceLabel}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {cheapest.transitDays} day{cheapest.transitDays > 1 ? "s" : ""} transit · incl. fuel surcharge
                </div>
              </div>
              <div className="rounded-[24px] border border-amber-400/20 bg-amber-500/5 p-5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-amber-300">
                  <Zap className="h-4 w-4" /> Fastest
                </div>
                <div className="mt-2 text-2xl font-black text-white">
                  {money(fastest.totalRate, fastest.currency)}
                </div>
                <div className="mt-1 text-sm text-slate-300">{fastest.serviceLabel}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {fastest.transitDays} day{fastest.transitDays > 1 ? "s" : ""} transit
                </div>
              </div>
            </div>
          )}

          {/* Rate table */}
          <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="text-lg font-black text-white">All Rates</div>
                <div className="text-sm text-slate-400 mt-0.5">
                  {displayed.length} service{displayed.length !== 1 ? "s" : ""} · sorted cheapest first
                </div>
              </div>
              <button
                onClick={() => setShowAll((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white hover:bg-white/10"
              >
                {showAll ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5" /> Enabled only
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5" /> Show all
                  </>
                )}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] uppercase tracking-[0.16em] text-white/50">
                    <th className="px-3 py-3">Carrier & Service</th>
                    <th className="px-3 py-3">Transit</th>
                    <th className="px-3 py-3">Base Rate</th>
                    <th className="px-3 py-3">Fuel (18.5%)</th>
                    {results.some((r) => r.markupAmount > 0) && (
                      <th className="px-3 py-3">Markup</th>
                    )}
                    <th className="px-3 py-3 font-black text-white">Total</th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-10 text-center text-slate-400"
                      >
                        No enabled carriers. Turn on carriers in settings above.
                      </td>
                    </tr>
                  ) : (
                    displayed.map((r, i) => {
                      const isCheapest = r.serviceCode === cheapest?.serviceCode;
                      const isFastest = r.serviceCode === fastest?.serviceCode;
                      return (
                        <tr
                          key={r.serviceCode}
                          className={`border-b border-white/5 transition-colors ${
                            i === 0 ? "bg-emerald-500/5" : "hover:bg-white/[0.02]"
                          } ${!r.isEnabled ? "opacity-40" : ""}`}
                        >
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <span>{CARRIER_LOGO[r.carrierId] ?? "📦"}</span>
                              <div>
                                <div className="font-semibold text-white text-xs">
                                  {r.carrierName}
                                </div>
                                <div className="text-slate-400 text-xs">{r.serviceLabel}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1.5">
                              <Gauge className="h-3.5 w-3.5 text-white/40" />
                              <span className="text-slate-300">
                                {r.transitDays} day{r.transitDays > 1 ? "s" : ""}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-slate-300 tabular-nums">
                            {money(r.baseRate, r.currency)}
                          </td>
                          <td className="px-3 py-3 text-slate-400 tabular-nums">
                            +{money(r.fuelSurcharge, r.currency)}
                          </td>
                          {results.some((x) => x.markupAmount > 0) && (
                            <td className="px-3 py-3 text-slate-400 tabular-nums">
                              {r.markupAmount > 0
                                ? `+${money(r.markupAmount, r.currency)}`
                                : "—"}
                            </td>
                          )}
                          <td className="px-3 py-3">
                            <span className="font-black text-white tabular-nums">
                              {money(r.totalRate, r.currency)}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex gap-1.5 flex-wrap justify-end">
                              {isCheapest && (
                                <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-200">
                                  Best value
                                </span>
                              )}
                              {isFastest && fastest?.serviceCode !== cheapest?.serviceCode && (
                                <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-200">
                                  Fastest
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-xs text-slate-500">
              Rates are indicative. All prices include 18.5% fuel surcharge and any configured
              markup. Zone multiplier applied: ×{displayed[0]?.zone.toFixed(2) ?? "1.00"}.
              Final rates subject to carrier confirmation and volumetric weight.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
