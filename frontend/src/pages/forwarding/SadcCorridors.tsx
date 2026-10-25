import { useEffect, useMemo, useState } from "react";
import { Loader2, MapPin, Truck, AlertTriangle, Clock, Route, Anchor, RefreshCw, Scale,
  type LucideIcon,
} from "lucide-react";
import * as fwd from "../../api/forwardingApi";
import BackButton from "../../components/BackButton";

const CONGESTION_CLS: Record<string, string> = {
  LOW: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  MEDIUM: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  HIGH: "border-orange-500/30 bg-orange-500/10 text-orange-300",
  CRITICAL: "border-rose-500/30 bg-rose-500/10 text-rose-300",
};
const RISK_CLS: Record<string, string> = {
  LOW: "text-emerald-300",
  MEDIUM: "text-amber-300",
  HIGH: "text-rose-300",
};

export default function SadcCorridors() {
  const [tab, setTab] = useState<"corridors" | "borders" | "compare">("corridors");
  const [borders, setBorders] = useState<fwd.BorderPost[]>([]);
  const [corridors, setCorridors] = useState<fwd.TradeCorridor[]>([]);
  const [loading, setLoading] = useState(true);

  // Walvis-vs-Durban comparison
  const [dest, setDest] = useState("Lusaka");
  const [cmp, setCmp] = useState<fwd.WalvisVsDurban | null>(null);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [b, c] = await Promise.all([fwd.getBorderPosts(), fwd.getCorridors()]);
        if (alive) { setBorders(b); setCorridors(c); }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const runCompare = async () => {
    if (!dest.trim()) return;
    setComparing(true);
    try { setCmp(await fwd.walvisVsDurban(dest.trim())); }
    catch { setCmp(null); }
    finally { setComparing(false); }
  };

  const worstBorders = useMemo(
    () => [...borders].sort((a, b) => b.avgWaitHours - a.avgWaitHours),
    [borders],
  );

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(20,120,160,0.12),transparent_30%),linear-gradient(180deg,#07111f,#0b1530)] p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <BackButton to="/forwarding" />
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <Route className="h-5 w-5 text-cyan-300" /> SADC Corridor Intelligence
          </h1>
        </div>
        <p className="text-sm text-white/50 -mt-2">
          Border wait times, trade corridors and port routing across Southern Africa.
          Figures are typical operational averages — use them to plan, not as live gate readings.
        </p>

        {/* Tabs */}
        <div className="flex gap-1 rounded-2xl border border-white/10 bg-black/30 p-1 w-fit">
          {[
            { k: "corridors", label: "Corridors", icon: Route },
            { k: "borders", label: "Border posts", icon: MapPin },
            { k: "compare", label: "Walvis vs Durban", icon: Scale },
          ].map((t) => (
            <button key={t.k} onClick={() => setTab(t.k as typeof tab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition ${tab === t.k ? "bg-cyan-500 text-slate-950" : "text-white/50 hover:text-white"}`}>
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid place-items-center py-20"><Loader2 className="h-6 w-6 animate-spin text-white/40" /></div>
        ) : tab === "corridors" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {corridors.map((c) => (
              <div key={c.code} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-black text-white">{c.name}</div>
                    <div className="text-[11px] text-white/45 mt-0.5">{c.origin} → {c.destination}</div>
                  </div>
                  <span className={`text-[10px] font-black uppercase ${RISK_CLS[c.riskLevel]}`}>{c.riskLevel} risk</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <Stat icon={Route} label="Distance" value={`${c.distanceKm.toLocaleString()} km`} />
                  <Stat icon={Clock} label="Transit" value={`~${c.avgTransitDays} days`} />
                  <Stat icon={Truck} label="Fuel est." value={`$${c.fuelCostEstimate.toLocaleString()}`} />
                  <Stat icon={Anchor} label="Tolls est." value={`$${c.tollCostEstimate.toLocaleString()}`} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.countries.map((cc) => (
                    <span key={cc} className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-white/60">{cc}</span>
                  ))}
                </div>
                {c.keyRisks?.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {c.keyRisks.map((r, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-[11px] text-white/50">
                        <AlertTriangle className="h-3 w-3 mt-0.5 text-amber-400/70 shrink-0" /> {r}
                      </div>
                    ))}
                  </div>
                )}
                {c.alternativePort && (
                  <div className="mt-2 text-[10px] text-white/35 italic">Alt: {c.alternativePort}</div>
                )}
              </div>
            ))}
          </div>
        ) : tab === "borders" ? (
          <div className="space-y-2">
            {worstBorders.map((b) => (
              <div key={b.code} className="rounded-2xl border border-white/10 bg-white/5 p-4 flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-white">{b.name}</span>
                    <span className="text-[10px] font-bold text-white/40">{b.countries[0]} ↔ {b.countries[1]}</span>
                    {b.is24Hour && <span className="text-[10px] text-emerald-300/70">24/7</span>}
                  </div>
                  <div className="text-[11px] text-white/45 mt-1">{b.notes}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {b.requiredDocs.map((d) => (
                      <span key={d} className="rounded-md border border-white/8 bg-black/20 px-1.5 py-0.5 text-[9px] font-bold text-white/40">{d}</span>
                    ))}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${CONGESTION_CLS[b.congestionLevel]}`}>{b.congestionLevel}</span>
                  <div className="mt-2 text-xs text-white/70 font-bold">~{b.avgWaitHours}h avg</div>
                  <div className="text-[10px] text-white/35">peak {b.peakWaitHours}h</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Walvis vs Durban */
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-end gap-2 flex-wrap mb-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-white/40 mb-1" htmlFor="field-destination-1">Destination</label>
                <input id="field-destination-1"
                  value={dest} onChange={(e) => setDest(e.target.value)}
                  placeholder="e.g. Lusaka, Gaborone, Harare, Lubumbashi"
                  className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/25 w-64"
                  onKeyDown={(e) => e.key === "Enter" && runCompare()}
                />
              </div>
              <button onClick={runCompare} disabled={comparing}
                className="flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-black text-slate-950 hover:bg-cyan-400 disabled:opacity-40">
                {comparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Compare
              </button>
            </div>

            {cmp && (
              <>
                <div className="grid sm:grid-cols-2 gap-3">
                  {[
                    { name: "Walvis Bay (SADC Gateway)", d: cmp.walvisBay, accent: "border-emerald-500/25 bg-emerald-500/6" },
                    { name: "Durban", d: cmp.durban, accent: "border-white/10 bg-white/5" },
                  ].map((r) => (
                    <div key={r.name} className={`rounded-2xl border ${r.accent} p-4`}>
                      <div className="text-sm font-black text-white mb-2">{r.name}</div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <Stat icon={Clock} label="Total days" value={`${r.d.totalDays}`} />
                        <Stat icon={Truck} label="Cost est." value={`$${r.d.cost.toLocaleString()}`} />
                        <Stat icon={Anchor} label="Port wait" value={`${r.d.portWait}d`} />
                        <Stat icon={MapPin} label="Border wait" value={`${r.d.borderWait}h`} />
                      </div>
                      <div className={`mt-2 text-[11px] font-black ${RISK_CLS[r.d.risk] ?? "text-white/50"}`}>{r.d.risk} risk</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-2xl border border-cyan-500/25 bg-cyan-500/8 px-4 py-3 text-sm font-bold text-cyan-200">
                  {cmp.recommendation}
                  {cmp.savingsDays > 0 && <span className="text-white/60 font-normal"> · saves ~{cmp.savingsDays} days, ${cmp.savingsCost.toLocaleString()}</span>}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-white/70">
      <Icon className="h-3 w-3 text-white/30" />
      <span className="text-white/40">{label}:</span>
      <span className="font-bold text-white/85">{value}</span>
    </div>
  );
}
