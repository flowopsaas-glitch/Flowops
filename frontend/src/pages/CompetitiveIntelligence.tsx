/**
 * CompetitiveIntelligencePage
 *
 * Shows the Claw AI's weekly competitive sweep results — competitor moves,
 * threat analysis, and recommended counter-actions — all powered by
 * Tavily web search + Cloudflare/Groq AI analysis.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronUp,
  Clock, ExternalLink, Globe, Loader2, RefreshCw, Sparkles, Target,
  TrendingUp, Zap,
} from "lucide-react";
import api from "../api/client";

// ── Types ────────────────────────────────────────────────────────────────────

type ThreatLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface Insight {
  competitor:     string;
  finding:        string;
  threatLevel:    ThreatLevel;
  recommendation: string;
  source?:        string;
}

interface Report {
  runAt:      string;
  insights:   Insight[];
  summary:    string;
  topAction:  string;
  rawResults: number;
}

interface IntelEvent {
  id:        string;
  type:      string;
  title:     string;
  body:      string;
  severity:  string;
  resolved:  boolean;
  metadata?: string;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function threatColor(level: ThreatLevel) {
  if (level === "CRITICAL") return "border-red-500/25 bg-red-500/10 text-red-300";
  if (level === "HIGH")     return "border-orange-500/25 bg-orange-500/10 text-orange-300";
  if (level === "MEDIUM")   return "border-amber-500/25 bg-amber-500/10 text-amber-300";
  return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24)    return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Insight Card ──────────────────────────────────────────────────────────────

function InsightCard({ insight }: { insight: Insight }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-[20px] border p-4 transition ${threatColor(insight.threatLevel)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${threatColor(insight.threatLevel)}`}>
              {insight.threatLevel}
            </span>
            <span className="text-xs font-bold text-white/80">{insight.competitor}</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-white leading-snug">{insight.finding}</p>
        </div>
        <button onClick={() => setOpen(v => !v)} className="shrink-0 mt-1 text-white/40 hover:text-white transition">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <div className="mt-3 border-t border-white/10 pt-3 space-y-2">
          <div className="flex gap-2">
            <Target className="h-4 w-4 shrink-0 text-sky-400 mt-0.5" />
            <p className="text-xs text-white/70 leading-relaxed">
              <span className="font-bold text-sky-300">Recommended action: </span>
              {insight.recommendation}
            </p>
          </div>
          {insight.source && (
            <div className="flex gap-2 items-center">
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-white/30" />
              <span className="text-[11px] text-white/30 truncate">{insight.source}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CompetitiveIntelligencePage() {
  const [report,    setReport]    = useState<Report | null>(null);
  const [history,   setHistory]   = useState<IntelEvent[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [sweeping,  setSweeping]  = useState(false);
  const [filter,    setFilter]    = useState<ThreatLevel | "ALL">("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [latestRes, histRes] = await Promise.allSettled([
        api.get("/ai/intel/latest"),
        api.get("/ai/intel/insights?limit=10"),
      ]);
      if (latestRes.status === "fulfilled") {
        const d = (latestRes.value as any)?.data ?? latestRes.value;
        setReport(d as Report);
      }
      if (histRes.status === "fulfilled") {
        const d = (histRes.value as any)?.data ?? histRes.value;
        setHistory(Array.isArray(d) ? d : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const runSweep = async () => {
    setSweeping(true);
    try {
      const res = await api.post("/ai/intel/sweep", {});
      const d = (res as any)?.data ?? res;
      setReport(d as Report);
      await load();
    } catch { /* toast handled globally */ }
    finally { setSweeping(false); }
  };

  const visibleInsights = report?.insights.filter(i =>
    filter === "ALL" || i.threatLevel === filter
  ) ?? [];

  const counts = {
    CRITICAL: report?.insights.filter(i => i.threatLevel === "CRITICAL").length ?? 0,
    HIGH:     report?.insights.filter(i => i.threatLevel === "HIGH").length     ?? 0,
    MEDIUM:   report?.insights.filter(i => i.threatLevel === "MEDIUM").length   ?? 0,
    LOW:      report?.insights.filter(i => i.threatLevel === "LOW").length      ?? 0,
  };

  // ── Skeleton ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-full p-4 sm:p-6 space-y-4 animate-pulse">
        <div className="h-32 rounded-[28px] bg-white/5" />
        <div className="grid grid-cols-4 gap-3">
          {[0,1,2,3].map(i => <div key={i} className="h-20 rounded-[20px] bg-white/5" />)}
        </div>
        {[0,1,2].map(i => <div key={i} className="h-24 rounded-[20px] bg-white/5" />)}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(30,80,140,0.12),transparent_30%),linear-gradient(180deg,#07111f,#0b1530)] p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-5">

        {/* Header */}
        <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 shadow-[0_16px_50px_rgba(0,0,0,0.3)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-sky-500/20 ring-2 ring-sky-500/30">
                <Globe className="h-7 w-7 text-sky-300" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">Claw Intelligence</p>
                <h1 className="text-2xl font-black text-white">Competitive Intel</h1>
                {report && (
                  <p className="text-xs text-white/40 mt-0.5 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Last sweep {timeAgo(report.runAt)} · {report.rawResults} sources analysed
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={runSweep}
              disabled={sweeping}
              className="flex items-center gap-2 rounded-2xl border border-sky-500/30 bg-sky-500/15 px-5 py-2.5 text-sm font-bold text-sky-300 hover:bg-sky-500/25 transition disabled:opacity-40"
            >
              {sweeping ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {sweeping ? "Running sweep…" : "Run Intel Sweep"}
            </button>
          </div>

          {/* Summary */}
          {report?.summary && (
            <div className="mt-4 rounded-[16px] border border-sky-500/15 bg-sky-500/8 p-4 flex gap-3">
              <Sparkles className="h-5 w-5 text-sky-400 shrink-0 mt-0.5" />
              <p className="text-sm text-white/70 leading-relaxed">{report.summary}</p>
            </div>
          )}
        </div>

        {/* No data state */}
        {!report && (
          <div className="flex flex-col items-center justify-center gap-4 rounded-[28px] border border-dashed border-white/10 py-16 text-center">
            <Globe className="h-14 w-14 text-white/10" />
            <div>
              <p className="text-sm font-bold text-white/40">No intelligence data yet</p>
              <p className="text-xs text-white/25 mt-1">Click "Run Intel Sweep" to analyse your competitive landscape</p>
            </div>
            <p className="text-[11px] text-white/20 max-w-sm">
              Add <code className="text-white/30">TAVILY_API_KEY</code> to your .env for live web search.
              Without it the Claw uses AI knowledge base.
            </p>
          </div>
        )}

        {report && (
          <>
            {/* Top action */}
            {report.topAction && (
              <div className="rounded-[20px] border border-amber-500/25 bg-amber-500/8 p-4 flex items-start gap-3">
                <Zap className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-amber-300">Top Recommended Action</p>
                  <p className="mt-1 text-sm text-white/70">{report.topAction}</p>
                </div>
              </div>
            )}

            {/* Threat counts */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(["CRITICAL","HIGH","MEDIUM","LOW"] as ThreatLevel[]).map(level => (
                <button
                  key={level}
                  onClick={() => setFilter(filter === level ? "ALL" : level)}
                  className={`rounded-[20px] border p-4 text-left transition ${
                    filter === level ? threatColor(level) : "border-white/8 bg-white/[0.03] hover:bg-white/[0.06]"
                  }`}
                >
                  <div className={`text-2xl font-black ${filter === level ? "" : "text-white"}`}>
                    {counts[level]}
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40 mt-1">{level}</div>
                </button>
              ))}
            </div>

            {/* Filter chips */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-white/40 font-bold uppercase tracking-wide">Filter:</span>
              {(["ALL","CRITICAL","HIGH","MEDIUM","LOW"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold border transition ${
                    filter === f
                      ? "border-sky-500/40 bg-sky-500/15 text-sky-300"
                      : "border-white/10 bg-white/5 text-white/40 hover:bg-white/10"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Insights list */}
            <section>
              <h2 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-white/60">
                Competitive Findings ({visibleInsights.length})
              </h2>
              {visibleInsights.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-white/8 py-10">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500/30" />
                  <p className="text-sm text-white/25">No {filter !== "ALL" ? filter : ""} threats found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleInsights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
                </div>
              )}
            </section>

            {/* History */}
            {history.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-white/60">
                  Intelligence History
                </h2>
                <div className="space-y-2">
                  {history.map(evt => (
                    <div
                      key={evt.id}
                      className="flex items-start gap-3 rounded-[16px] border border-white/8 bg-white/[0.03] p-3"
                    >
                      <div className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                        evt.severity === "critical" ? "bg-red-400"   :
                        evt.severity === "warning"  ? "bg-orange-400":
                        "bg-sky-400"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white/70 truncate">{evt.title}</p>
                        <p className="text-[11px] text-white/30 mt-0.5">{evt.body?.slice(0, 100)}</p>
                      </div>
                      <span className="text-[10px] text-white/25 shrink-0">{timeAgo(evt.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Setup hint */}
            <div className="rounded-[20px] border border-white/5 bg-black/20 p-4 text-[11px] text-white/25 leading-relaxed">
              <TrendingUp className="h-3.5 w-3.5 inline mr-1.5 text-white/20" />
              Sweeps run automatically every <strong className="text-white/35">Monday at 08:00</strong>.
              Add <code className="text-white/35">TAVILY_API_KEY</code> to .env for live web search.
              Add <code className="text-white/35">CLOUDFLARE_ACCOUNT_ID</code> + <code className="text-white/35">CLOUDFLARE_API_TOKEN</code> or <code className="text-white/35">GROQ_API_KEY</code> for AI analysis.
            </div>

          </>
        )}
      </div>
    </div>
  );
}
