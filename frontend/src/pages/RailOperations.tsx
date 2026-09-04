import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Train,
  Container as ContainerIcon,
  Gauge,
  Clock,
  MapPin,
  RefreshCw,
  Search,
  AlertTriangle,
  ArrowRight,
  Layers,
  Route as RouteIcon,
  Timer,
  TrendingUp,
  Boxes,
  CircleDot,
  Loader2,
  X,
} from "lucide-react";
import {
  getRailOverview,
  listConsignments,
  getConsignment,
  advanceConsignment,
  type RailOverview,
  type RailConsignment,
  type RailStatus,
} from "../api/railApi";
import { useToast } from "../components/ToastProvider";

// ── Lifecycle ────────────────────────────────────────────────────────────────
const LIFECYCLE: RailStatus[] = [
  "PLANNED",
  "WAGONS_ALLOCATED",
  "LOADING",
  "DEPARTED",
  "IN_TRANSIT",
  "AT_INTERCHANGE",
  "ARRIVED",
  "OFFLOADED",
  "COMPLETED",
];

const STATUS_LABEL: Record<RailStatus, string> = {
  PLANNED: "Planned",
  WAGONS_ALLOCATED: "Wagons Allocated",
  LOADING: "Loading",
  DEPARTED: "Departed",
  IN_TRANSIT: "In Transit",
  AT_INTERCHANGE: "At Interchange",
  ARRIVED: "Arrived",
  OFFLOADED: "Offloaded",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const STATUS_COLOR: Record<RailStatus, string> = {
  PLANNED: "text-slate-400 bg-slate-500/10 border-slate-500/30",
  WAGONS_ALLOCATED: "text-sky-400 bg-sky-500/10 border-sky-500/30",
  LOADING: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  DEPARTED: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
  IN_TRANSIT: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  AT_INTERCHANGE: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  ARRIVED: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  OFFLOADED: "text-violet-400 bg-violet-500/10 border-violet-500/30",
  COMPLETED: "text-green-400 bg-green-500/10 border-green-500/30",
  CANCELLED: "text-red-400 bg-red-500/10 border-red-500/30",
};

const LEG_COLOR: Record<string, string> = {
  ROAD: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  RAIL: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  PORT: "text-sky-300 bg-sky-500/10 border-sky-500/30",
};

const fmtT = (n?: number | null) =>
  n == null ? "—" : `${Math.round(n).toLocaleString()} t`;
const fmtH = (n?: number | null) => (n == null ? "—" : `${n} h`);
const fmtPct = (n?: number | null) => (n == null ? "—" : `${n}%`);

// ── KPI card ─────────────────────────────────────────────────────────────────
function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  accent = "text-emerald-400",
}: {
  icon: any;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          {label}
        </span>
        <Icon className={`h-4 w-4 ${accent}`} />
      </div>
      <div className="mt-3 text-3xl font-black text-white">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export default function RailOperations() {
  const { showToast } = useToast();
  const [overview, setOverview] = useState<RailOverview | null>(null);
  const [rows, setRows] = useState<RailConsignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selected, setSelected] = useState<RailConsignment | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, list] = await Promise.all([
        getRailOverview(),
        listConsignments({ q: q || undefined, status: statusFilter || undefined }),
      ]);
      setOverview(ov);
      setRows(list);
    } catch (e: any) {
      showToast(`Could not load rail data: ${String(e?.message ?? e)}`, "error");
    } finally {
      setLoading(false);
    }
  }, [q, statusFilter, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const openConsignment = async (id: string) => {
    try {
      const full = await getConsignment(id);
      setSelected(full);
    } catch (e: any) {
      showToast(`Could not open consignment: ${String(e?.message ?? e)}`, "error");
    }
  };

  const nextStatus = (s: RailStatus): RailStatus | null => {
    const i = LIFECYCLE.indexOf(s);
    return i >= 0 && i < LIFECYCLE.length - 1 ? LIFECYCLE[i + 1] : null;
  };

  const advance = async () => {
    if (!selected) return;
    const next = nextStatus(selected.status);
    if (!next) return;
    setAdvancing(true);
    try {
      await advanceConsignment(selected.id, next);
      const full = await getConsignment(selected.id);
      setSelected(full);
      await load();
      showToast(`Advanced to ${STATUS_LABEL[next]}`, "success");
    } catch (e: any) {
      showToast(`Could not advance: ${String(e?.message ?? e)}`, "error");
    } finally {
      setAdvancing(false);
    }
  };

  const m = overview?.metrics;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-500/15 border border-emerald-500/30">
            <Train className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Rail & Intermodal Operations</h1>
            <p className="text-sm text-slate-400">
              Consignment lifecycle · wagon register · road↔rail↔port coordination
            </p>
          </div>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.07]"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Kpi icon={Layers} label="Active" value={m?.activeConsignments ?? "—"} sub="consignments" />
        <Kpi icon={Train} label="In Transit" value={m?.inTransit ?? "—"} sub={`${m?.wagonsInTransit ?? 0} wagons`} accent="text-cyan-400" />
        <Kpi icon={CircleDot} label="At Interchange" value={m?.atInterchange ?? "—"} sub="handoff points" accent="text-orange-400" />
        <Kpi icon={Boxes} label="Tonnage Moved" value={fmtT(m?.tonnageMoved)} sub={`of ${fmtT(m?.tonnagePlanned)} planned`} accent="text-violet-400" />
        <Kpi icon={Gauge} label="On-Time" value={fmtPct(m?.onTimePct)} sub="vs planned arrival" accent="text-green-400" />
        <Kpi icon={Timer} label="Avg Dwell" value={fmtH(m?.avgInterchangeDwellHours)} sub="at interchange" accent="text-amber-400" />
      </div>

      {/* Corridor breakdown */}
      {overview && overview.byCorridor.length > 0 && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <div className="mb-4 flex items-center gap-2">
            <RouteIcon className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-300">Corridor Breakdown</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {overview.byCorridor.map((c) => (
              <div key={c.corridor} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{c.corridor}</span>
                  <span className="text-xs text-slate-400">{c.consignments} consignments</span>
                </div>
                <div className="mt-2 text-lg font-black text-emerald-400">{fmtT(c.tonnage)}</div>
              </div>
            ))}
          </div>
          {m && m.avgTransitHours != null && (
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              Average corridor transit: <span className="font-semibold text-slate-200">{fmtH(m.avgTransitHours)}</span>
              {m.atRisk > 0 && (
                <span className="ml-3 inline-flex items-center gap-1 text-orange-400">
                  <AlertTriangle className="h-3.5 w-3.5" /> {m.atRisk} at risk
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search consignment, client, commodity, operator…"
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500/50"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50"
        >
          <option value="">All statuses</option>
          {LIFECYCLE.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
      </div>

      {/* Consignment list */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/[0.03] text-[11px] uppercase tracking-widest text-slate-400">
            <tr>
              <th className="px-4 py-3">Consignment</th>
              <th className="px-4 py-3">Commodity</th>
              <th className="px-4 py-3">Corridor</th>
              <th className="px-4 py-3">Tonnage</th>
              <th className="px-4 py-3">Wagons</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                <Loader2 className="mx-auto h-6 w-6 animate-spin" />
              </td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No rail consignments yet.</td></tr>
            )}
            {!loading && rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => openConsignment(r.id)}
                className="cursor-pointer hover:bg-white/[0.03]"
              >
                <td className="px-4 py-3 font-mono font-semibold text-emerald-400">{r.consignmentNumber}</td>
                <td className="px-4 py-3 text-slate-200">{r.commodity}</td>
                <td className="px-4 py-3 text-slate-400">{r.corridor ?? "—"}</td>
                <td className="px-4 py-3 text-slate-200">{fmtT(r.tonnage)}</td>
                <td className="px-4 py-3 text-slate-400">{r._count?.wagons ?? r.wagons?.length ?? 0}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${STATUS_COLOR[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setSelected(null)}>
          <div
            className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-[#0b0f14] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between">
              <div>
                <div className="font-mono text-lg font-black text-emerald-400">{selected.consignmentNumber}</div>
                <div className="text-sm text-slate-400">{selected.commodity} · {selected.corridor ?? "—"}</div>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-lg p-2 text-slate-400 hover:bg-white/10">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Status + advance */}
            <div className="mb-6 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_COLOR[selected.status]}`}>
                {STATUS_LABEL[selected.status]}
              </span>
              {nextStatus(selected.status) && (
                <button
                  onClick={advance}
                  disabled={advancing}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/90 px-4 py-2 text-sm font-bold text-black hover:bg-emerald-400 disabled:opacity-50"
                >
                  {advancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  Advance to {STATUS_LABEL[nextStatus(selected.status)!]}
                </button>
              )}
            </div>

            {/* Facts */}
            <div className="mb-6 grid grid-cols-2 gap-3 text-sm">
              <Fact label="Client" value={selected.clientName} />
              <Fact label="Rail Operator" value={selected.railOperator} />
              <Fact label="Origin" value={selected.originSiding} />
              <Fact label="Destination" value={selected.destinationSiding} />
              <Fact label="Interchange" value={selected.interchangePoint} />
              <Fact label="Service Ref" value={selected.serviceRef} />
              <Fact label="Tonnage" value={fmtT(selected.tonnage)} />
              <Fact label="Wagons" value={String(selected.wagons?.length ?? 0)} />
            </div>

            {/* Intermodal journey */}
            {selected.legs && selected.legs.length > 0 && (
              <div className="mb-6">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-300">
                  <RouteIcon className="h-4 w-4 text-emerald-400" /> Intermodal Journey
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  {selected.legs.map((leg, i) => (
                    <div key={leg.id} className="flex items-center gap-2">
                      <div className={`rounded-xl border px-3 py-2 ${LEG_COLOR[leg.mode] ?? "text-slate-300 bg-white/5 border-white/10"}`}>
                        <div className="text-[11px] font-bold uppercase">{leg.mode}</div>
                        <div className="text-xs text-slate-400">{leg.fromLocation} → {leg.toLocation}</div>
                        {leg.dwellHours != null && (
                          <div className="mt-0.5 text-[11px] text-amber-400">dwell {leg.dwellHours}h</div>
                        )}
                      </div>
                      {i < selected.legs!.length - 1 && <ArrowRight className="h-4 w-4 text-slate-600" />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Wagons */}
            {selected.wagons && selected.wagons.length > 0 && (
              <div className="mb-6">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-300">
                  <ContainerIcon className="h-4 w-4 text-emerald-400" /> Wagon Register ({selected.wagons.length})
                </h3>
                <div className="overflow-hidden rounded-xl border border-white/10">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white/[0.03] text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Wagon</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Loaded</th>
                        <th className="px-3 py-2">Location</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {selected.wagons.map((w) => (
                        <tr key={w.id}>
                          <td className="px-3 py-2 font-mono text-slate-200">{w.wagonNumber}</td>
                          <td className="px-3 py-2 text-slate-400">{w.type}</td>
                          <td className="px-3 py-2 text-slate-200">{fmtT(w.loadedTonnes)}</td>
                          <td className="px-3 py-2 text-slate-400">{w.lastKnownSiding ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Timeline */}
            {selected.events && selected.events.length > 0 && (
              <div>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-300">
                  <Clock className="h-4 w-4 text-emerald-400" /> Event Timeline
                </h3>
                <div className="space-y-3 border-l border-white/10 pl-4">
                  {selected.events.map((ev) => (
                    <div key={ev.id} className="relative">
                      <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      <div className="text-sm font-semibold text-white">{STATUS_LABEL[ev.status]}</div>
                      <div className="text-xs text-slate-500">
                        {new Date(ev.reachedAt).toLocaleString()} {ev.location ? `· ${ev.location}` : ""}
                      </div>
                      {ev.note && <div className="text-xs text-slate-400">{ev.note}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm text-slate-200">{value || "—"}</div>
    </div>
  );
}
