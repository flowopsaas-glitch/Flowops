/**
 * CompetitiveIntelligencePage
 *
 * Shows the Claw AI's weekly competitive sweep results — competitor moves,
 * threat analysis, and recommended counter-actions — all powered by
 * Tavily web search + Cloudflare/Groq AI analysis.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, ArrowRight, Bot, Check, CheckCircle2, ChevronDown, ChevronUp,
  Clock, Copy, ExternalLink, Github, Globe, Hammer, HeartPulse, Lightbulb, ListChecks, Loader2, RefreshCw, Sparkles, Target,
  TrendingUp, X, Zap,
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
  counterMoveScore?: number;
}

interface IntegrationCheck {
  key: string;
  name: string;
  category: string;
  configured: boolean;
  status: "ok" | "misconfigured" | "failing";
  detail: string;
  latencyMs: number;
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

// ── Build Plan Panel (CLAW Build Planner output) ───────────────────────────

function BuildPlanPanel({ plan, onCopy, copied, onCreateIssue, creatingIssue, issueUrl }: {
  plan: any;
  onCopy: () => void;
  copied: boolean;
  onCreateIssue: () => void;
  creatingIssue: boolean;
  issueUrl?: string;
}) {
  const Section = ({ label, items }: { label: string; items?: string[] }) =>
    items && items.length ? (
      <div>
        <p className="text-[10px] font-black uppercase tracking-wider text-white/35">{label}</p>
        <ul className="mt-1 space-y-0.5">
          {items.map((it, i) => (
            <li key={i} className="text-[11px] text-white/60 leading-relaxed">• {it}</li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <div className="mt-3 rounded-[14px] border border-sky-500/20 bg-sky-500/[0.05] p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Hammer className="h-4 w-4 text-sky-300" />
        <span className="text-sm font-black text-sky-200">{plan.title || "Build plan"}</span>
        {plan.entitlementTier && (
          <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-violet-300">
            {plan.entitlementTier}
          </span>
        )}
        {plan.effort && (
          <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white/50">
            Effort {plan.effort}
          </span>
        )}
      </div>
      {plan.summary && <p className="text-xs text-white/70 leading-relaxed">{plan.summary}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Section label="Data model" items={plan.dataModelChanges} />
        <Section label="Backend" items={plan.backendChanges} />
        <Section label="Endpoints" items={plan.newEndpoints} />
        <Section label="Frontend" items={plan.frontendChanges} />
        <Section label="Acceptance criteria" items={plan.acceptanceCriteria} />
        <Section label="Risks" items={plan.risks} />
        <Section label="Steps" items={plan.implementationSteps} />
      </div>
      {plan.suggestedBranch && (
        <p className="text-[11px] text-white/40">
          Branch <code className="text-white/60">{plan.suggestedBranch}</code>
          {plan.navPlacement ? <> · Nav: <span className="text-white/60">{plan.navPlacement}</span></> : null}
        </p>
      )}
      {plan.agentPrompt && (
        <div className="rounded-[12px] border border-white/10 bg-black/30 p-2.5">
          <div className="flex items-center gap-2 mb-1">
            <Bot className="h-3.5 w-3.5 text-emerald-300" />
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-200">
              Coding-agent prompt — paste into Kiro to build it
            </span>
            <button
              onClick={onCopy}
              className="ml-auto flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-bold text-white/60 hover:text-white hover:bg-white/10 transition"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-300" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-[11px] text-white/55 leading-relaxed whitespace-pre-wrap">{plan.agentPrompt}</p>
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap pt-0.5">
        {issueUrl ? (
          <a
            href={issueUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/20 transition"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> View GitHub issue
          </a>
        ) : (
          <button
            onClick={onCreateIssue}
            disabled={creatingIssue}
            className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-white/70 hover:bg-white/10 hover:text-white transition disabled:opacity-40"
          >
            {creatingIssue ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Github className="h-3.5 w-3.5" />}
            Create GitHub issue
          </button>
        )}
        <span className="text-[10px] text-white/30">Opens a tracked task in your repo — implement via PR, never auto-shipped.</span>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CompetitiveIntelligencePage() {
  const [report,    setReport]    = useState<Report | null>(null);
  const [history,   setHistory]   = useState<IntelEvent[]>([]);
  const [actions,   setActions]   = useState<IntelEvent[]>([]);
  const [actingId,  setActingId]  = useState<string | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [sweeping,  setSweeping]  = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [integrations, setIntegrations] = useState<IntegrationCheck[] | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [filter,    setFilter]    = useState<ThreatLevel | "ALL">("ALL");

  // CLAW Build Planner state
  const [plans,      setPlans]      = useState<Record<string, any>>({});
  const [planningId, setPlanningId] = useState<string | null>(null);
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);
  const [copiedId,   setCopiedId]   = useState<string | null>(null);
  const [issues,     setIssues]     = useState<Record<string, string>>({});
  const [issuingId,  setIssuingId]  = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [latestRes, histRes, actRes] = await Promise.allSettled([
        api.get("/owner/intel/latest"),
        api.get("/owner/intel/insights?limit=10"),
        api.get("/owner/intel/actions"),
      ]);
      if (latestRes.status === "fulfilled") {
        const d = (latestRes.value as any)?.data ?? latestRes.value;
        setReport(d as Report);
      }
      if (histRes.status === "fulfilled") {
        const d = (histRes.value as any)?.data ?? histRes.value;
        setHistory(Array.isArray(d) ? d : []);
      }
      if (actRes.status === "fulfilled") {
        const d = (actRes.value as any)?.data ?? actRes.value;
        setActions(Array.isArray(d) ? d : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const setActionStatus = async (id: string, status: "resolved" | "dismissed") => {
    setActingId(id);
    // Optimistic: drop it from the open list immediately.
    setActions(prev => prev.filter(a => a.id !== id));
    try {
      await api.patch(`/owner/intel/actions/${id}`, { status });
    } catch {
      // Re-sync on failure so we don't lose the item silently.
      void load();
    } finally {
      setActingId(null);
    }
  };

  const generatePlan = async (id: string) => {
    // Toggle the panel if we already have a plan for this item.
    if (plans[id]) { setOpenPlanId(prev => (prev === id ? null : id)); return; }
    setPlanningId(id);
    try {
      const res: any = await api.post(`/owner/intel/actions/${id}/build-plan`, {});
      const d = res?.data ?? res;
      setPlans(prev => ({ ...prev, [id]: d }));
      setOpenPlanId(id);
    } catch { /* toast handled globally */ }
    finally { setPlanningId(null); }
  };

  const copyAgentPrompt = async (id: string) => {
    const prompt = plans[id]?.agentPrompt;
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedId(id);
      setTimeout(() => setCopiedId(c => (c === id ? null : c)), 2000);
    } catch { /* clipboard may be blocked — ignore */ }
  };

  const createIssue = async (id: string) => {
    setIssuingId(id);
    try {
      const res: any = await api.post(`/owner/intel/actions/${id}/create-issue`, {});
      const d = res?.data ?? res;
      if (d?.url) setIssues(prev => ({ ...prev, [id]: d.url }));
    } catch { /* toast handled globally (e.g. GitHub not configured) */ }
    finally { setIssuingId(null); }
  };

  const runSweep = async () => {    setSweeping(true);
    try {
      const res = await api.post("/owner/intel/sweep", {});
      const d = (res as any)?.data ?? res;
      setReport(d as Report);
      await load();
    } catch { /* toast handled globally */ }
    finally { setSweeping(false); }
  };

  const runSuggestUpgrades = async () => {
    setSuggesting(true);
    try {
      await api.post("/owner/intel/suggest-upgrades", {});
      await load(); // new upgrade ideas land in the Action items queue
    } catch { /* toast handled globally */ }
    finally { setSuggesting(false); }
  };

  const runHealthCheck = async () => {
    setCheckingHealth(true);
    try {
      const res: any = await api.get("/owner/health/integrations");
      const d = res?.data ?? res;
      setIntegrations(Array.isArray(d?.checks) ? d.checks : []);
      await load(); // any failing integration also shows up in Action items
    } catch { /* toast handled globally */ }
    finally { setCheckingHealth(false); }
  };

  const insights = report?.insights ?? [];

  const visibleInsights = insights.filter(i =>
    filter === "ALL" || i.threatLevel === filter
  );

  const counts = {
    CRITICAL: insights.filter(i => i.threatLevel === "CRITICAL").length,
    HIGH:     insights.filter(i => i.threatLevel === "HIGH").length,
    MEDIUM:   insights.filter(i => i.threatLevel === "MEDIUM").length,
    LOW:      insights.filter(i => i.threatLevel === "LOW").length,
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

            <div className="flex items-center gap-2">
              <button
                onClick={runSuggestUpgrades}
                disabled={suggesting || sweeping}
                title="Ask CLAW for platform upgrade ideas → queued into Action items"
                className="flex items-center gap-2 rounded-2xl border border-violet-500/30 bg-violet-500/15 px-4 py-2.5 text-sm font-bold text-violet-300 hover:bg-violet-500/25 transition disabled:opacity-40"
              >
                {suggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />}
                {suggesting ? "Thinking…" : "Suggest Upgrades"}
              </button>
              <button
                onClick={runSweep}
                disabled={sweeping || suggesting}
                className="flex items-center gap-2 rounded-2xl border border-sky-500/30 bg-sky-500/15 px-5 py-2.5 text-sm font-bold text-sky-300 hover:bg-sky-500/25 transition disabled:opacity-40"
              >
                {sweeping ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {sweeping ? "Running sweep…" : "Run Intel Sweep"}
              </button>
            </div>
          </div>

          {/* Summary */}
          {report?.summary && (
            <div className="mt-4 rounded-[16px] border border-sky-500/15 bg-sky-500/8 p-4 flex gap-3">
              <Sparkles className="h-5 w-5 text-sky-400 shrink-0 mt-0.5" />
              <p className="text-sm text-white/70 leading-relaxed">{report.summary}</p>
            </div>
          )}
        </div>

        {/* Integration health — CLAW Sentinel pings every external service */}
        <section className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 shadow-[0_16px_50px_rgba(0,0,0,0.25)]">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <HeartPulse className="h-5 w-5 text-sky-300" />
            <h2 className="text-sm font-black uppercase tracking-[0.18em] text-sky-200">
              Integration Health
            </h2>
            <span className="text-[11px] text-white/35">CLAW Sentinel · live external-service checks</span>
            <button
              onClick={runHealthCheck}
              disabled={checkingHealth}
              className="ml-auto flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/15 px-3 py-1.5 text-xs font-bold text-sky-300 hover:bg-sky-500/25 transition disabled:opacity-40"
            >
              {checkingHealth ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {checkingHealth ? "Checking…" : "Check now"}
            </button>
          </div>

          {integrations === null ? (
            <p className="text-xs text-white/30 py-4 text-center">
              Click "Check now" to ping Groq, Tavily, Paystack, SendGrid, WhatsApp and the database.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {integrations.map((c) => {
                const dot =
                  c.status === "ok" ? "bg-emerald-400" :
                  c.status === "failing" ? "bg-rose-400" : "bg-amber-400";
                const ring =
                  c.status === "ok" ? "border-emerald-500/20" :
                  c.status === "failing" ? "border-rose-500/30" : "border-amber-500/25";
                return (
                  <div key={c.key} className={`rounded-2xl border ${ring} bg-black/20 p-3`}>
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${dot} ${c.status !== "ok" ? "animate-pulse" : ""}`} />
                      <span className="text-sm font-bold text-white/85">{c.name}</span>
                      <span className="ml-auto text-[10px] uppercase tracking-wider text-white/30">{c.status}</span>
                      {c.latencyMs > 0 && <span className="text-[10px] text-white/25">{c.latencyMs}ms</span>}
                    </div>
                    <p className="mt-1 text-[11px] text-white/45 leading-relaxed">{c.detail}</p>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Action items — every recommendation, tracked until you act on it */}
        {actions.length > 0 && (
          <section className="rounded-[28px] border border-emerald-500/20 bg-emerald-500/[0.06] p-5 shadow-[0_16px_50px_rgba(0,0,0,0.25)]">
            <div className="flex items-center gap-2 mb-3">
              <ListChecks className="h-5 w-5 text-emerald-300" />
              <h2 className="text-sm font-black uppercase tracking-[0.18em] text-emerald-200">
                Action items ({actions.length})
              </h2>
              <span className="ml-auto text-[11px] text-white/35">CLAW ranks by Counter-Move Score &amp; remembers every decision</span>
            </div>
            <div className="space-y-2">
              {actions.map(a => {
                const score = a.counterMoveScore ?? 0;
                const scoreCls =
                  score >= 85 ? "border-red-500/30 bg-red-500/10 text-red-300" :
                  score >= 65 ? "border-orange-500/30 bg-orange-500/10 text-orange-300" :
                  score >= 40 ? "border-amber-500/30 bg-amber-500/10 text-amber-300" :
                  "border-sky-500/30 bg-sky-500/10 text-sky-300";
                return (
                <div
                  key={a.id}
                  className="rounded-[16px] border border-white/8 bg-black/20 p-3"
                >
                  <div className="flex items-start gap-3">
                  <div
                    title="FlowOps Counter-Move Score — urgency ranked by threat severity + freshness"
                    className={`shrink-0 grid place-items-center h-10 w-10 rounded-xl border text-sm font-black ${scoreCls}`}
                  >
                    {score}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                        a.type === "PLATFORM_UPGRADE"
                          ? "border-violet-500/30 bg-violet-500/10 text-violet-300"
                          : "border-orange-500/30 bg-orange-500/10 text-orange-300"
                      }`}>
                        {a.type === "PLATFORM_UPGRADE" ? "Upgrade" : "Threat"}
                      </span>
                      <p className="text-sm font-bold text-white/85">{a.title}</p>
                    </div>
                    {a.body && <p className="text-xs text-white/50 mt-0.5 leading-relaxed">{a.body}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => generatePlan(a.id)}
                      disabled={planningId === a.id}
                      title="CLAW Build Planner — turn this into a buildable spec + coding-agent prompt"
                      className="flex items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5 text-[11px] font-bold text-sky-300 hover:bg-sky-500/20 transition disabled:opacity-40"
                    >
                      {planningId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hammer className="h-3.5 w-3.5" />}
                      {plans[a.id] ? (openPlanId === a.id ? "Hide plan" : "Show plan") : "Plan build"}
                    </button>
                    <button
                      onClick={() => setActionStatus(a.id, "resolved")}
                      disabled={actingId === a.id}
                      title="Mark done — CLAW records the win"
                      className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/20 transition disabled:opacity-40"
                    >
                      {actingId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Done
                    </button>
                    <button
                      onClick={() => setActionStatus(a.id, "dismissed")}
                      disabled={actingId === a.id}
                      title="Dismiss — CLAW remembers you passed on this"
                      className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-white/50 hover:bg-white/10 hover:text-white transition disabled:opacity-40"
                    >
                      <X className="h-3.5 w-3.5" />
                      Dismiss
                    </button>
                  </div>
                  </div>
                  {openPlanId === a.id && plans[a.id] && (
                    <BuildPlanPanel
                      plan={plans[a.id]}
                      onCopy={() => copyAgentPrompt(a.id)}
                      copied={copiedId === a.id}
                      onCreateIssue={() => createIssue(a.id)}
                      creatingIssue={issuingId === a.id}
                      issueUrl={issues[a.id] || plans[a.id]?.githubIssueUrl}
                    />
                  )}
                </div>
                );
              })}
            </div>
          </section>
        )}

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
