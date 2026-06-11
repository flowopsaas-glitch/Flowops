import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BellRing,
  Bot,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Package,
  Receipt,
  Route,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Truck,
} from "lucide-react";
import AIOpsCopilot from "../components/AIOpsCopilot";
import {
  getSupervisorOverview,
  type SupervisorAlert,
  type SupervisorOverview,
  type SupervisorRecommendation,
} from "../api/aiSupervisorApi";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type AlertSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

function severityPill(severity: AlertSeverity) {
  const base = "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-extrabold border";
  if (severity === "CRITICAL") return `${base} border-red-400/30 bg-red-500/10 text-red-200`;
  if (severity === "HIGH") return `${base} border-orange-400/30 bg-orange-500/10 text-orange-200`;
  if (severity === "MEDIUM") return `${base} border-amber-400/30 bg-amber-500/10 text-amber-200`;
  return `${base} border-emerald-400/30 bg-emerald-500/10 text-emerald-200`;
}

function areaPill(area: SupervisorAlert["area"]) {
  return "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-white/10 text-white/75";
}

function HeroStat(props: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: "up" | "down" | "neutral";
  trendText?: string;
}) {
  const Icon = props.icon;
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/6 p-5 shadow-lg backdrop-blur-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">{props.title}</div>
          <div className="mt-3 text-3xl font-black tracking-tight text-white">{props.value}</div>
          <div className="mt-1 text-xs text-white/70">{props.subtitle}</div>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
      {props.trendText && (
        <div className="mt-4 flex items-center gap-2 text-xs text-white/70">
          {props.trend === "up" ? <TrendingUp className="h-4 w-4 text-emerald-300" /> : props.trend === "down" ? <TrendingDown className="h-4 w-4 text-red-300" /> : <Activity className="h-4 w-4 text-white/60" />}
          <span>{props.trendText}</span>
        </div>
      )}
    </div>
  );
}

function ActionCard(props: { title: string; desc: string; icon: React.ComponentType<{ className?: string }>; tone?: string; onClick: () => void }) {
  const Icon = props.icon;
  const tone = props.tone === "green" ? "from-emerald-400/20 to-emerald-500/5" : props.tone === "purple" ? "from-violet-400/20 to-violet-500/5" : props.tone === "orange" ? "from-amber-400/20 to-amber-500/5" : "from-sky-400/20 to-sky-500/5";
  return (
    <button type="button" onClick={props.onClick} className={cn("rounded-[24px] border border-white/10 bg-white/6 p-4 text-left backdrop-blur-2xl transition hover:bg-white/10 bg-gradient-to-br", tone)}>
      <div className="flex items-start justify-between gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
          <Icon className="h-5 w-5 text-white" />
        </div>
        <ChevronRight className="h-4 w-4 text-white/45" />
      </div>
      <div className="mt-4 text-sm font-bold text-white">{props.title}</div>
      <div className="mt-1 text-xs leading-relaxed text-white/65">{props.desc}</div>
    </button>
  );
}

export default function AIControlTower() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedArea, setSelectedArea] = useState<any>("ALL");
  const [overview, setOverview] = useState<SupervisorOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refreshOverview = async () => {
    try {
      setLoading(true);
      const next = await getSupervisorOverview();
      setOverview(next);
      setError("");
    } catch (err: any) {
      setError(err?.message || "Failed to load AI supervisor.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refreshOverview(); }, []);

  const alerts = overview?.alerts ?? [];
  const recommendations = overview?.recommendations ?? [];
  const filteredAlerts = selectedArea === "ALL" ? alerts : alerts.filter((a) => a.area === selectedArea);

  const summary = useMemo(() => ({
    critical: alerts.filter((a) => a.severity === "CRITICAL").length,
    high: alerts.filter((a) => a.severity === "HIGH").length,
  }), [alerts]);

  const watchRows = [
    { icon: Truck, title: "Pending Collections", value: String(overview?.metrics?.pendingCollections ?? 0), subtitle: "Awaiting closure" },
    { icon: Route, title: "Unassigned Dispatch", value: String(overview?.metrics?.unassignedDispatches ?? 0), subtitle: "Needs assignment" },
    { icon: Package, title: "Missing POD", value: String(overview?.metrics?.waybillsMissingPod ?? 0), subtitle: "Evidence gaps" },
    { icon: Receipt, title: "Draft Invoices", value: String(overview?.metrics?.draftInvoices ?? 0), subtitle: "Billing pending" },
  ];

  return (
    <div className="min-h-full bg-[#07111f] p-6 text-white">
      <div className="mx-auto max-w-[1600px] space-y-5">
        {/* Header Section */}
        <div className="rounded-[30px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <div className="flex flex-col gap-6 xl:flex-row xl:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-white/15">
                <Sparkles className="h-4 w-4" /> {overview?.assistant?.provider || "AI Supervisor"}
              </div>
              <h1 className="mt-4 text-3xl font-black">AI Control Tower</h1>
              <p className="mt-2 text-sm text-white/70">{overview?.scope === 'platform' ? 'Platform Oversight' : 'Tenant Operations'}</p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
              <div className="flex items-center gap-3">
                <Brain className="h-6 w-6" />
                <div>
                  <div className="text-sm font-bold">AI Status</div>
                  <div className="text-xs text-white/60">{overview?.assistant?.note || "Online"}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <HeroStat title="Critical Alerts" value={String(summary.critical)} subtitle="Action required" icon={AlertTriangle} />
            <HeroStat title="Collections" value={String(overview?.metrics?.totalCollections ?? 0)} subtitle="Total Scope" icon={Truck} trend="up" trendText="Live Tracking" />
            <HeroStat title="POD Gaps" value={String(overview?.metrics?.waybillsMissingPod ?? 0)} subtitle="Missing proof" icon={BadgeCheck} />
            <HeroStat title="Dispatch Load" value={String(overview?.metrics?.unassignedDispatches ?? 0)} subtitle="Waiting" icon={Route} />
          </div>
        </div>

        {error && <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl">{error}</div>}

        <div className="grid gap-4 xl:grid-cols-[1fr_0.7fr]">
          <div className="space-y-4">
            <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
              <h3 className="font-bold flex items-center gap-2 mb-4"><ShieldAlert className="h-5 w-5" /> Live Alert Stack</h3>
              <div className="space-y-3">
                {filteredAlerts.map(alert => (
                  <AlertCard key={alert.id} alert={alert} onOpen={navigate} />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
              <h3 className="font-bold flex items-center gap-2 mb-4"><Activity className="h-5 w-5" /> AI Watch Summary</h3>
              <div className="space-y-3">
                {watchRows.map(row => (
                  <WatchRow key={row.title} {...row} />
                ))}
              </div>
            </div>
            <AIOpsCopilot 
                domain="collections" 
                title="Supervisor Copilot" 
                context={overview?.copilotContext ?? {}} 
                onAction={refreshOverview} 
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper Components
function AlertCard({ alert, onOpen }: any) {
  return (
    <div className="p-4 bg-white/5 rounded-2xl border border-white/10 flex justify-between items-center">
      <div>
        <span className={severityPill(alert.severity)}>{alert.severity}</span>
        <div className="font-bold mt-2">{alert.title}</div>
        <div className="text-sm text-white/60">{alert.description}</div>
      </div>
      <button onClick={() => onOpen('/collections')} className="p-2 hover:bg-white/10 rounded-xl transition"><ChevronRight /></button>
    </div>
  );
}

function WatchRow({ icon: Icon, title, value, subtitle }: any) {
  return (
    <div className="flex items-center justify-between p-3 bg-black/20 rounded-xl border border-white/10">
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 text-white/70" />
        <div>
          <div className="text-sm font-bold">{title}</div>
          <div className="text-xs text-white/50">{subtitle}</div>
        </div>
      </div>
      <div className="font-black">{value}</div>
    </div>
  );
}
