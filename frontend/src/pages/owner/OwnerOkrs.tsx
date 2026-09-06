import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Target, Plus, Trash2, Loader2, TrendingUp, RefreshCw, X, ChevronDown, ChevronRight, Save,
} from "lucide-react";
import { api } from "../../api/client";

// ── Types ──────────────────────────────────────────────────────────────────
type Unit = "NUMBER" | "PERCENT" | "CURRENCY";
type Status = "ON_TRACK" | "AT_RISK" | "BEHIND" | "ACHIEVED" | "CANCELLED";

type KeyResult = {
  id: string;
  title: string;
  unit: Unit;
  startValue: number;
  targetValue: number;
  currentValue: number;
  status: Status;
  progress: number;
};

type Objective = {
  id: string;
  title: string;
  description?: string | null;
  quarter: string;
  owner?: string | null;
  status: Status;
  keyResults: KeyResult[];
  progress: number;
  suggestedStatus: Status;
};

type OkrResponse = {
  objectives: Objective[];
  quarters: string[];
  summary: { count: number; overallProgress: number };
};

function unwrap(r: any): any { return r?.data ?? r; }

const STATUS_STYLE: Record<Status, string> = {
  ON_TRACK: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
  AT_RISK: "border-amber-400/30 bg-amber-500/10 text-amber-300",
  BEHIND: "border-rose-400/30 bg-rose-500/10 text-rose-300",
  ACHIEVED: "border-sky-400/30 bg-sky-500/10 text-sky-300",
  CANCELLED: "border-white/15 bg-white/5 text-white/40",
};
const STATUS_LABEL: Record<Status, string> = {
  ON_TRACK: "On track", AT_RISK: "At risk", BEHIND: "Behind", ACHIEVED: "Achieved", CANCELLED: "Cancelled",
};

function fmtVal(v: number, unit: Unit) {
  if (unit === "PERCENT") return `${v}%`;
  if (unit === "CURRENCY") return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(v);
  return new Intl.NumberFormat("en-ZA").format(v);
}

function ProgressBar({ pct }: { pct: number }) {
  const color = pct >= 100 ? "bg-sky-400" : pct >= 70 ? "bg-emerald-400" : pct >= 40 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

// Default quarter e.g. "2026-Q4"
function currentQuarter(): string {
  const d = new Date();
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

export default function OwnerOkrs() {
  const [data, setData] = useState<OkrResponse | null>(null);
  const [quarter, setQuarter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showNewObj, setShowNewObj] = useState(false);
  const [newObj, setNewObj] = useState({ title: "", quarter: currentQuarter(), owner: "" });
  const [krDraft, setKrDraft] = useState<Record<string, { title: string; unit: Unit; targetValue: string; startValue: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r: any = await api.get(`/owner/okrs${quarter ? `?quarter=${encodeURIComponent(quarter)}` : ""}`);
      setData(unwrap(r));
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? "Could not load OKRs.");
    } finally {
      setLoading(false);
    }
  }, [quarter]);

  useEffect(() => { void load(); }, [load]);

  const toggle = (id: string) => setExpanded((p) => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const createObjective = async () => {
    if (!newObj.title.trim() || !newObj.quarter.trim()) return;
    setBusy(true); setError(null);
    try {
      await api.post("/owner/okrs", { title: newObj.title.trim(), quarter: newObj.quarter.trim(), owner: newObj.owner.trim() || undefined });
      setNewObj({ title: "", quarter: newObj.quarter, owner: "" });
      setShowNewObj(false);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? "Could not create objective.");
    } finally { setBusy(false); }
  };

  const deleteObjective = async (id: string) => {
    if (!window.confirm("Delete this objective and its key results?")) return;
    setBusy(true);
    try { await api.delete(`/owner/okrs/${id}`); await load(); }
    catch (e: any) { setError(e?.response?.data?.message ?? e?.message ?? "Could not delete."); }
    finally { setBusy(false); }
  };

  const setObjStatus = async (id: string, status: Status) => {
    setBusy(true);
    try { await api.patch(`/owner/okrs/${id}`, { status }); await load(); }
    catch (e: any) { setError(e?.response?.data?.message ?? e?.message); }
    finally { setBusy(false); }
  };

  const addKr = async (objId: string) => {
    const d = krDraft[objId];
    if (!d?.title?.trim() || d?.targetValue === "" || d?.targetValue == null) return;
    setBusy(true); setError(null);
    try {
      await api.post(`/owner/okrs/${objId}/key-results`, {
        title: d.title.trim(),
        unit: d.unit,
        startValue: d.startValue === "" ? 0 : Number(d.startValue),
        targetValue: Number(d.targetValue),
      });
      setKrDraft((p) => ({ ...p, [objId]: { title: "", unit: "NUMBER", targetValue: "", startValue: "" } }));
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? "Could not add key result.");
    } finally { setBusy(false); }
  };

  const updateKrValue = async (krId: string, currentValue: number) => {
    setBusy(true);
    try { await api.patch(`/owner/okrs/key-results/${krId}`, { currentValue }); await load(); }
    catch (e: any) { setError(e?.response?.data?.message ?? e?.message); }
    finally { setBusy(false); }
  };

  const deleteKr = async (krId: string) => {
    setBusy(true);
    try { await api.delete(`/owner/okrs/key-results/${krId}`); await load(); }
    catch (e: any) { setError(e?.response?.data?.message ?? e?.message); }
    finally { setBusy(false); }
  };

  const objectives = data?.objectives ?? [];
  const overall = data?.summary.overallProgress ?? 0;

  const draftFor = (id: string) => krDraft[id] ?? { title: "", unit: "NUMBER" as Unit, targetValue: "", startValue: "" };

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of objectives) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [objectives]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-violet-500/15 ring-1 ring-violet-500/25">
            <Target className="h-6 w-6 text-violet-300" />
          </div>
          <div>
            <h1 className="text-2xl font-black">Objectives &amp; Key Results</h1>
            <p className="text-sm text-white/50">FlowOps' strategic cockpit — track quarterly objectives with measurable results.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={quarter}
            onChange={(e) => setQuarter(e.target.value)}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50"
          >
            <option value="">All quarters</option>
            {(data?.quarters ?? []).map((q) => <option key={q} value={q}>{q}</option>)}
            {!(data?.quarters ?? []).includes(currentQuarter()) && <option value={currentQuarter()}>{currentQuarter()}</option>}
          </select>
          <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white/70 hover:bg-white/10">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => setShowNewObj(true)} className="inline-flex items-center gap-2 rounded-xl bg-violet-500/90 px-4 py-2 text-sm font-black text-white hover:bg-violet-400">
            <Plus className="h-4 w-4" /> New objective
          </button>
        </div>
      </div>

      {/* Overall roll-up */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-violet-500/8 to-transparent p-6">
        <div className="flex items-center justify-between mb-3">
          <span className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-white/60">
            <TrendingUp className="h-4 w-4 text-violet-300" /> Portfolio progress
          </span>
          <span className="text-2xl font-black text-white">{overall}%</span>
        </div>
        <ProgressBar pct={overall} />
        <div className="mt-3 flex flex-wrap gap-2">
          {(Object.keys(statusCounts) as Status[]).map((s) => (
            <span key={s} className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${STATUS_STYLE[s]}`}>
              {statusCounts[s]} {STATUS_LABEL[s]}
            </span>
          ))}
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200">{error}</div>}

      {/* Objectives */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-white/30" /></div>
      ) : objectives.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 py-14 text-center text-sm text-white/35">
          No objectives yet. Click “New objective” to start.
        </div>
      ) : (
        <div className="space-y-4">
          {objectives.map((o) => {
            const open = expanded.has(o.id);
            const d = draftFor(o.id);
            return (
              <div key={o.id} className="rounded-2xl border border-white/10 bg-white/5">
                <div className="flex items-start gap-4 p-5">
                  <button onClick={() => toggle(o.id)} className="mt-1 text-white/40 hover:text-white">
                    {open ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-black text-white">{o.title}</h3>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white/50">{o.quarter}</span>
                      <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${STATUS_STYLE[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                      {o.owner && <span className="text-xs text-white/40">· {o.owner}</span>}
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex-1"><ProgressBar pct={o.progress} /></div>
                      <span className="text-sm font-black text-white w-12 text-right">{o.progress}%</span>
                    </div>
                    <p className="mt-1 text-[11px] text-white/35">{o.keyResults.length} key result{o.keyResults.length !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={o.status}
                      onChange={(e) => setObjStatus(o.id, e.target.value as Status)}
                      className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white outline-none"
                    >
                      {(Object.keys(STATUS_LABEL) as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                    <button onClick={() => deleteObjective(o.id)} className="rounded-lg p-2 text-white/40 hover:bg-rose-500/10 hover:text-rose-300">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="border-t border-white/8 p-5 space-y-3">
                    {o.keyResults.map((kr) => (
                      <div key={kr.id} className="rounded-xl border border-white/8 bg-black/20 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-white">{kr.title}</span>
                          <button onClick={() => deleteKr(kr.id)} className="rounded p-1 text-white/30 hover:text-rose-300"><X className="h-4 w-4" /></button>
                        </div>
                        <div className="mt-3 flex items-center gap-3">
                          <div className="flex-1"><ProgressBar pct={kr.progress} /></div>
                          <span className="text-xs font-black text-white w-10 text-right">{kr.progress}%</span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/50">
                          <span>Start {fmtVal(kr.startValue, kr.unit)}</span>
                          <span>→ Target {fmtVal(kr.targetValue, kr.unit)}</span>
                          <div className="ml-auto flex items-center gap-2">
                            <span className="text-white/60">Current:</span>
                            <input
                              type="number"
                              defaultValue={kr.currentValue}
                              onBlur={(e) => { const v = Number(e.target.value); if (v !== kr.currentValue) void updateKrValue(kr.id, v); }}
                              className="w-28 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-white outline-none focus:border-violet-500/50"
                            />
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Add key result */}
                    <div className="rounded-xl border border-dashed border-white/12 p-3">
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]">
                        <input
                          value={d.title}
                          onChange={(e) => setKrDraft((p) => ({ ...p, [o.id]: { ...d, title: e.target.value } }))}
                          placeholder="New key result (e.g. Sign 3 rail customers)"
                          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-violet-500/50"
                        />
                        <select
                          value={d.unit}
                          onChange={(e) => setKrDraft((p) => ({ ...p, [o.id]: { ...d, unit: e.target.value as Unit } }))}
                          className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-white outline-none"
                        >
                          <option value="NUMBER">#</option>
                          <option value="PERCENT">%</option>
                          <option value="CURRENCY">R</option>
                        </select>
                        <input
                          type="number" value={d.startValue}
                          onChange={(e) => setKrDraft((p) => ({ ...p, [o.id]: { ...d, startValue: e.target.value } }))}
                          placeholder="Start" className="w-20 rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-white placeholder-white/25 outline-none"
                        />
                        <input
                          type="number" value={d.targetValue}
                          onChange={(e) => setKrDraft((p) => ({ ...p, [o.id]: { ...d, targetValue: e.target.value } }))}
                          placeholder="Target" className="w-20 rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-white placeholder-white/25 outline-none"
                        />
                        <button onClick={() => addKr(o.id)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-violet-500/80 px-3 py-2 text-sm font-bold text-white hover:bg-violet-400 disabled:opacity-50">
                          <Plus className="h-4 w-4" /> Add
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* New objective modal */}
      {showNewObj && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => !busy && setShowNewObj(false)}>
          <div className="w-full max-w-md rounded-2xl border border-white/12 bg-[#0b1226] p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-white mb-4">New objective</h3>
            <label className="block text-[11px] font-black uppercase tracking-wider text-white/45 mb-1">Objective</label>
            <input
              value={newObj.title}
              onChange={(e) => setNewObj((p) => ({ ...p, title: e.target.value }))}
              placeholder="e.g. Land FlowOps' first rail customer"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-violet-500/50 mb-3"
            />
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-white/45 mb-1">Quarter</label>
                <input value={newObj.quarter} onChange={(e) => setNewObj((p) => ({ ...p, quarter: e.target.value }))} placeholder="2026-Q4" className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500/50" />
              </div>
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-white/45 mb-1">Owner (optional)</label>
                <input value={newObj.owner} onChange={(e) => setNewObj((p) => ({ ...p, owner: e.target.value }))} placeholder="Kader" className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-violet-500/50" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowNewObj(false)} disabled={busy} className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-bold text-white/60 hover:bg-white/10 disabled:opacity-50">Cancel</button>
              <button onClick={createObjective} disabled={busy || !newObj.title.trim()} className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-violet-500/90 py-2.5 text-sm font-black text-white hover:bg-violet-400 disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
