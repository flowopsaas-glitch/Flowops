import { useCallback, useEffect, useState } from "react";
import {
  Activity, AlertTriangle, Bug, CheckCircle2, Cpu, Globe, Loader2,
  RefreshCw, Server, Sparkles, Wand2,
} from "lucide-react";
import api from "../api/client";

// ── Types ────────────────────────────────────────────────────────────────────

interface ErrorGroup {
  id: string;
  fingerprint: string;
  source: "backend" | "frontend";
  level: string;
  message: string;
  stack?: string | null;
  path?: string | null;
  method?: string | null;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolved: boolean;
  aiSeverity?: string | null;
  aiSummary?: string | null;
  aiSuggestion?: string | null;
}

interface Stats {
  openGroups: number;
  totalGroups: number;
  activeLast24h: number;
  bySeverity: { severity: string; count: number }[];
}

const unwrap = (r: any) => r?.data ?? r;

function sevColor(sev?: string | null) {
  switch ((sev || "").toUpperCase()) {
    case "CRITICAL": return "border-rose-500/40 bg-rose-500/10 text-rose-300";
    case "HIGH":     return "border-orange-500/40 bg-orange-500/10 text-orange-300";
    case "MEDIUM":   return "border-amber-500/30 bg-amber-500/10 text-amber-300";
    case "LOW":      return "border-sky-500/30 bg-sky-500/10 text-sky-300";
    default:         return "border-white/15 bg-white/5 text-white/50";
  }
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Observatory() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [errors, setErrors] = useState<ErrorGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = filter === "all" ? "" : `?resolved=${filter === "resolved"}`;
      const [s, e] = await Promise.allSettled([
        api.get("/owner/observatory/stats"),
        api.get(`/owner/observatory/errors${q}`),
      ]);
      if (s.status === "fulfilled") setStats(unwrap(s.value) as Stats);
      if (e.status === "fulfilled") {
        const d = unwrap(e.value);
        setErrors(Array.isArray(d) ? d : []);
      }
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const resolve = async (id: string, resolved: boolean) => {
    setBusyId(id);
    try {
      await api.patch(`/owner/observatory/errors/${id}/resolve`, { resolved });
      await load();
    } catch (e: any) {
      setActionError(e?.message || "Could not update this error. Please try again.");
      setTimeout(() => setActionError(null), 6000);
    }
    finally { setBusyId(null); }
  };

  const retriage = async (id: string) => {
    setBusyId(id);
    try {
      await api.post(`/owner/observatory/errors/${id}/retriage`, {});
      await load();
    } catch (e: any) {
      setActionError(e?.message || "Re-triage failed. Please try again.");
      setTimeout(() => setActionError(null), 6000);
    }
    finally { setBusyId(null); }
  };

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(120,80,200,0.12),transparent_30%),linear-gradient(180deg,#07111f,#0b1530)] p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        {actionError && (
          <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200">
            {actionError}
          </div>
        )}

        {/* Header */}
        <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl shadow-[0_16px_50px_rgba(0,0,0,0.3)]">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-violet-500/20 ring-2 ring-violet-500/30">
                <Activity className="h-7 w-7 text-violet-300" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">CLAW Observatory</p>
                <h1 className="text-2xl font-black text-white">Error Intelligence</h1>
                <p className="text-xs text-white/40 mt-0.5">Self-hosted · AI-triaged · grouped by fingerprint</p>
              </div>
            </div>
            <button
              onClick={() => void load()}
              className="flex items-center gap-2 rounded-2xl border border-violet-500/30 bg-violet-500/15 px-4 py-2.5 text-sm font-bold text-violet-300 hover:bg-violet-500/25 transition"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>

          {/* Stats */}
          {stats && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Open groups" value={stats.openGroups} tone="text-rose-300" />
              <Stat label="Active (24h)" value={stats.activeLast24h} tone="text-amber-300" />
              <Stat label="Total groups" value={stats.totalGroups} tone="text-white" />
              <Stat
                label="Critical/High"
                value={stats.bySeverity.filter(s => ["CRITICAL", "HIGH"].includes(s.severity)).reduce((a, b) => a + b.count, 0)}
                tone="text-orange-300"
              />
            </div>
          )}
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40 font-bold uppercase tracking-wide">Show:</span>
          {(["open", "resolved", "all"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-[11px] font-bold border transition ${
                filter === f
                  ? "border-violet-500/40 bg-violet-500/15 text-violet-300"
                  : "border-white/10 bg-white/5 text-white/40 hover:bg-white/10"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Error groups */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-white/30" />
          </div>
        ) : errors.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[24px] border border-dashed border-white/10 py-16 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500/40" />
            <p className="text-sm font-bold text-white/40">No {filter !== "all" ? filter : ""} errors</p>
            <p className="text-xs text-white/25">When something breaks, CLAW captures, groups and triages it here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {errors.map(err => (
              <div key={err.id} className="rounded-[20px] border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                      err.source === "backend" ? "border-sky-500/30 bg-sky-500/10 text-sky-300" : "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300"
                    }`}>
                      {err.source === "backend" ? <Server className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                      {err.source}
                    </span>
                    {err.aiSeverity && (
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${sevColor(err.aiSeverity)}`}>
                        {err.aiSeverity}
                      </span>
                    )}
                    <span className="rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] font-bold text-white/60">
                      ×{err.count}
                    </span>
                    {err.resolved && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" /> resolved
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-white/25">last {timeAgo(err.lastSeenAt)}</span>
                </div>

                <div className="mt-2 flex items-start gap-2">
                  <Bug className="h-4 w-4 text-rose-400/70 mt-0.5 shrink-0" />
                  <p className="text-sm font-semibold text-white/85 break-words">{err.message}</p>
                </div>
                {(err.path || err.method) && (
                  <p className="mt-1 text-[11px] text-white/35 font-mono">{err.method} {err.path}</p>
                )}

                {/* CLAW AI triage */}
                {(err.aiSummary || err.aiSuggestion) && (
                  <div className="mt-3 rounded-2xl border border-violet-500/15 bg-violet-500/[0.06] p-3 space-y-1.5">
                    {err.aiSummary && (
                      <div className="flex gap-2">
                        <Cpu className="h-3.5 w-3.5 text-violet-300 mt-0.5 shrink-0" />
                        <p className="text-xs text-white/70"><span className="font-bold text-violet-300">CLAW: </span>{err.aiSummary}</p>
                      </div>
                    )}
                    {err.aiSuggestion && (
                      <div className="flex gap-2">
                        <Sparkles className="h-3.5 w-3.5 text-emerald-300 mt-0.5 shrink-0" />
                        <p className="text-xs text-white/70"><span className="font-bold text-emerald-300">Suggested fix: </span>{err.aiSuggestion}</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-3 flex items-center gap-2">
                  {!err.resolved ? (
                    <button
                      onClick={() => resolve(err.id, true)}
                      disabled={busyId === err.id}
                      className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/20 transition disabled:opacity-40"
                    >
                      {busyId === err.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Resolve
                    </button>
                  ) : (
                    <button
                      onClick={() => resolve(err.id, false)}
                      disabled={busyId === err.id}
                      className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-white/50 hover:bg-white/10 transition disabled:opacity-40"
                    >
                      Reopen
                    </button>
                  )}
                  <button
                    onClick={() => retriage(err.id)}
                    disabled={busyId === err.id}
                    title="Re-run CLAW AI triage"
                    className="flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1.5 text-[11px] font-bold text-violet-300 hover:bg-violet-500/20 transition disabled:opacity-40"
                  >
                    <Wand2 className="h-3.5 w-3.5" /> Re-triage
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-[20px] border border-white/5 bg-black/20 p-4 text-[11px] text-white/25 leading-relaxed">
          <AlertTriangle className="h-3.5 w-3.5 inline mr-1.5 text-white/20" />
          Self-hosted error intelligence — backend 5xx + frontend crashes are captured here, grouped by fingerprint,
          and triaged by CLAW (needs <code className="text-white/35">GROQ_API_KEY</code> for AI severity + fix suggestions).
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
      <div className={`text-2xl font-black ${tone}`}>{value}</div>
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40 mt-1">{label}</div>
    </div>
  );
}
