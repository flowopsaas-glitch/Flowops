import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, Bot, CheckCircle2, Clock, Crown, Gauge, Loader2,
  PlayCircle, RefreshCw, ScanLine, Sparkles, Zap,
} from "lucide-react";
import {
  getAutopilotConfig, setAutopilotConfig, getAutopilotSignals, runAutopilot,
  getAutopilotLog, type AutopilotConfig, type OpsSignal, type AutopilotRun,
  type AutopilotLogEntry, type Severity,
} from "../../api/autopilotApi";
import { useToast } from "../../components/toast-context";

const SEV: Record<Severity, string> = {
  critical: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  high:     "border-orange-500/40 bg-orange-500/10 text-orange-300",
  medium:   "border-amber-500/30 bg-amber-500/10 text-amber-300",
  low:      "border-sky-500/30 bg-sky-500/10 text-sky-300",
};

const KIND_LABEL: Record<string, string> = {
  SLA_BREACH: "SLA breach",
  SLA_PRE_BREACH: "SLA pre-breach",
  STALLED_DELIVERY: "Stalled delivery",
  COD_MISMATCH: "COD mismatch",
  UNASSIGNED_COLLECTION: "Unassigned pickup",
};

export default function AutopilotConsole() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [config, setConfig] = useState<AutopilotConfig | null>(null);
  const [signals, setSignals] = useState<OpsSignal[]>([]);
  const [log, setLog] = useState<AutopilotLogEntry[]>([]);
  const [lastRun, setLastRun] = useState<AutopilotRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"scan" | "run" | "save" | null>(null);

  const load = () => (async () => {
    const cfg = await getAutopilotConfig();
    setConfig(cfg);
    if (cfg.available) {
      const [sig, lg] = await Promise.all([
        getAutopilotSignals().catch(() => []),
        getAutopilotLog().catch(() => []),
      ]);
      setSignals(sig);
      setLog(lg);
    }

  })().catch(() => {
    /* config endpoint still returns availability=false on non-enterprise */

  }).finally(() => {
    setLoading(false);

  });

  useEffect(() => { void load(); }, []);

  const toggleEnabled = async () => {
    if (!config) return;
    setBusy("save");
    try {
      const next = await setAutopilotConfig({ enabled: !config.enabled });
      setConfig(next);
      showToast(next.enabled ? "Autopilot enabled" : "Autopilot paused", "success");
    } catch (e) {
      showToast(e?.message ?? "Could not update Autopilot", "error");
    } finally { setBusy(null); }
  };

  const changeAggression = async (aggression: string) => {
    setBusy("save");
    try {
      const next = await setAutopilotConfig({ aggression });
      setConfig(next);
      showToast(`Aggression set to ${aggression}`, "success");
    } catch (e) {
      showToast(e?.message ?? "Could not update aggression", "error");
    } finally { setBusy(null); }
  };

  const doScan = async () => {
    setBusy("scan");
    try {
      setSignals(await getAutopilotSignals());
      setLastRun(null);
      showToast("Scan complete", "success");
    } catch (e) {
      showToast(e?.message ?? "Scan failed", "error");
    } finally { setBusy(null); }
  };

  const doRun = async () => {
    setBusy("run");
    try {
      const res = await runAutopilot(true);
      setLastRun(res);
      setSignals(res.signals);
      setLog(await getAutopilotLog().catch(() => log));
      showToast(`Autopilot executed ${res.executed} of ${res.totalSignals} signals`, "success");
    } catch (e) {
      showToast(e?.message ?? "Run failed", "error");
    } finally { setBusy(null); }
  };

  if (loading) {
    return (
      <div className="min-h-full grid place-items-center bg-[#0b1530]">
        <Loader2 className="h-7 w-7 animate-spin text-white/40" />
      </div>
    );
  }

  // ── Upsell (non-Enterprise) ──
  if (!config?.available) {
    return (
      <div className="min-h-full bg-[linear-gradient(180deg,#07111f,#0b1530)] p-8">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-violet-500/30 bg-violet-500/8 p-8 text-center shadow-[0_18px_60px_rgba(0,0,0,0.3)]">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-500/30">
            <Bot className="h-7 w-7 text-violet-300" />
          </div>
          <h1 className="mt-4 text-2xl font-black text-white">CLAW Autopilot for Operations</h1>
          <p className="mt-2 text-sm text-white/60">
            Let FlowOps run your ops autonomously — auto-assign stalled pickups, escalate SLA
            pre-breaches, and flag COD mismatches before they cost you. Available on the
            <span className="font-bold text-violet-300"> Enterprise</span> plan.
          </p>
          <button
            onClick={() => navigate("/billing/plans")}
            className="mt-5 inline-flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/20 px-5 py-2.5 text-sm font-black text-violet-200 hover:bg-violet-500/30 transition"
          >
            <Crown className="h-4 w-4" /> See Enterprise plan
          </button>
        </div>
      </div>
    );
  }

  const critical = signals.filter((s) => s.severity === "critical").length;

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(120,80,200,0.12),transparent_30%),linear-gradient(180deg,#07111f,#0b1530)] p-6 sm:p-8 overflow-y-auto">
      <div className="mx-auto max-w-[1100px] space-y-6">

        {/* Header */}
        <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 backdrop-blur-2xl shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-500/30">
                <Bot className="h-6 w-6 text-violet-300" />
              </div>
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-violet-500/15 px-3 py-1 text-[11px] font-bold text-violet-200 ring-1 ring-violet-500/25">
                  <Sparkles className="h-3 w-3" /> Enterprise · Autonomous Ops
                </div>
                <h1 className="mt-2 text-2xl font-black text-white">CLAW Autopilot</h1>
                <p className="text-sm text-white/50">
                  Detects operational risk and takes safe, confidence-gated actions automatically.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={doScan}
                disabled={busy !== null}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/8 px-4 py-2.5 text-sm font-bold text-white/75 hover:bg-white/15 transition disabled:opacity-50"
              >
                {busy === "scan" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                Scan now
              </button>
              <button
                onClick={doRun}
                disabled={busy !== null}
                className="flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/20 px-4 py-2.5 text-sm font-black text-violet-200 hover:bg-violet-500/30 transition disabled:opacity-50"
              >
                {busy === "run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                Run Autopilot
              </button>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-[22px] border border-white/10 bg-white/6 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-violet-300" />
                <span className="text-sm font-black text-white">Autonomy</span>
              </div>
              <button
                onClick={toggleEnabled}
                disabled={busy === "save"}
                className={`relative h-7 w-12 rounded-full transition ${config.enabled ? "bg-violet-500/70" : "bg-white/15"}`}
              >
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${config.enabled ? "left-6" : "left-1"}`} />
              </button>
            </div>
            <p className="mt-2 text-xs text-white/50">
              {config.enabled
                ? "Autopilot runs hourly and auto-executes eligible actions."
                : "Paused — detection only, no automatic actions."}
            </p>
          </div>

          <div className="rounded-[22px] border border-white/10 bg-white/6 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Gauge className="h-4 w-4 text-violet-300" />
              <span className="text-sm font-black text-white">Aggression</span>
              <span className="ml-auto text-[10px] text-white/30">global default: {config.globalAggression}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(["LOW", "MEDIUM", "HIGH"] as const).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => changeAggression(lvl)}
                  disabled={busy === "save"}
                  className={`rounded-xl border px-2 py-2 text-xs font-bold transition ${
                    config.aggression === lvl
                      ? "border-violet-500/40 bg-violet-500/20 text-violet-200"
                      : "border-white/10 bg-white/5 text-white/50 hover:bg-white/10"
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-white/40">
              Higher aggression auto-acts on lower-confidence signals.
            </p>
          </div>
        </div>

        {/* Last run summary */}
        {lastRun && (
          <div className="rounded-[20px] border border-emerald-500/25 bg-emerald-500/8 px-5 py-4 flex items-center gap-3 flex-wrap">
            <CheckCircle2 className="h-5 w-5 text-emerald-300" />
            <p className="text-sm font-bold text-emerald-200">
              Executed {lastRun.executed} of {lastRun.totalSignals} signals
              <span className="text-emerald-300/60 font-normal"> · {lastRun.recommendedOnly} left as recommendations</span>
            </p>
          </div>
        )}

        {/* Signals */}
        <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.3)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-black text-white flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-300" />
              Operational signals
              {critical > 0 && (
                <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                  {critical} critical
                </span>
              )}
            </h2>
            <span className="text-xs text-white/40">{signals.length} total</span>
          </div>

          {signals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 rounded-2xl border border-dashed border-white/10 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400/40 mb-2" />
              <p className="text-sm text-white/40">All clear — no operational risks detected.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {signals.map((s, i) => (
                <div key={`${s.entity.id}-${i}`} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${SEV[s.severity]}`}>
                        {KIND_LABEL[s.kind] ?? s.kind}
                      </span>
                      <span className="text-[11px] text-white/35">
                        {Math.round(s.confidence * 100)}% confidence
                      </span>
                      {s.executed && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" /> auto-actioned
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-white/30 font-mono">{s.entity.ref}</span>
                  </div>
                  <p className="mt-2 text-sm text-white/80">{s.summary}</p>
                  <p className="mt-1 text-xs text-white/45">
                    <span className="text-white/35">Recommended:</span> {s.recommendedAction}
                  </p>
                  {s.executionResult && (
                    <p className="mt-1 text-xs font-semibold text-emerald-300/80">{s.executionResult}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Activity log */}
        <div className="rounded-[28px] border border-white/10 bg-white/6 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-black text-white flex items-center gap-2">
              <Clock className="h-4 w-4 text-white/40" /> Recent autopilot activity
            </h2>
            <button onClick={() => void load()} className="text-white/40 hover:text-white transition">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          {log.length === 0 ? (
            <p className="text-sm text-white/30 py-6 text-center">No autopilot actions yet.</p>
          ) : (
            <div className="space-y-1.5">
              {log.map((e) => (
                <div key={e.id} className="flex items-start gap-3 rounded-xl border border-white/6 bg-black/20 px-3 py-2">
                  <Bot className="h-4 w-4 text-violet-300/70 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white/80 truncate">{e.title}</p>
                    <p className="text-[11px] text-white/45 truncate">{e.body}</p>
                  </div>
                  <span className="text-[10px] text-white/25 flex-shrink-0">
                    {new Date(e.createdAt).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
