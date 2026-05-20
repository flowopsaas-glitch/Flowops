import React, { useEffect, useState } from "react";
import {
  Crown,
  Building2,
  Users,
  ShieldCheck,
  Mail,
  MessageCircle,
  Sparkles,
  RefreshCw,
  ArrowUpRight,
  Brain,
  AlertTriangle,
  TrendingUp
} from "lucide-react";
import { getPlatformOverview } from "../../api/companiesApi";
import { getAIEventStats } from "../../api/aiEventsApi";
import { useNavigate } from "react-router-dom";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type OverviewState = {
  companies: number;
  users: number;
  superAdmins: number;
  companyAdmins: number;
};

type AIStatsState = {
  total: number;
  open: number;
  critical: number;
  high: number;
  resolved: number;
  upgradeIntent: number;
  demoRequests: number;
};

export default function SuperAdminDashboard() {
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<OverviewState>({
    companies: 0,
    users: 0,
    superAdmins: 0,
    companyAdmins: 0
  });
  const [aiStats, setAIStats] = useState<AIStatsState>({
    total: 0,
    open: 0,
    critical: 0,
    high: 0,
    resolved: 0,
    upgradeIntent: 0,
    demoRequests: 0
  });
  const [pageError, setPageError] = useState("");
  const navigate = useNavigate();

  async function loadOverview() {
    setLoading(true);
    setPageError("");

    try {
      const [platformData, aiData] = await Promise.all([
        getPlatformOverview(),
        getAIEventStats()
      ]);

      setOverview(platformData);
      setAIStats(aiData);
    } catch (error: any) {
      setPageError(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to load platform overview."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOverview();
  }, []);

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.14),transparent_30%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8 text-white">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="rounded-[30px] border border-white/10 bg-white/6 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-400/20 bg-fuchsia-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-fuchsia-200">
                <Crown className="h-3.5 w-3.5" />
                FlowOps Ultimate
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
              </h1>

              <p className="mt-2 max-w-4xl text-sm text-white/72">
                Global platform oversight across every courier company, company admin,
                communication hub, AI event, and supervisor-driven platform signal.
              </p>
            </div>

            <button
              type="button"
              onClick={loadOverview}
              disabled={loading}
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold ring-1 ring-white/15 transition",
                loading
                  ? "cursor-not-allowed bg-white/10 text-white/55"
                  : "bg-white/10 text-white hover:bg-white/15"
              )}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {pageError ? (
            <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
              {pageError}
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <StatCard title="Tenant Companies" value={String(overview.companies)} icon={Building2} />
            <StatCard title="Platform Users" value={String(overview.users)} icon={Users} />
            <StatCard title="Company Admins" value={String(overview.companyAdmins)} icon={Crown} />
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Open AI Events" value={String(aiStats.open)} icon={Brain} />
          <StatCard title="Critical AI Events" value={String(aiStats.critical)} icon={AlertTriangle} />
          <StatCard title="Upgrade Intent" value={String(aiStats.upgradeIntent)} icon={TrendingUp} />
          <StatCard title="Demo Requests" value={String(aiStats.demoRequests)} icon={Mail} />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/6 p-5 backdrop-blur-2xl">
            <div className="text-lg font-extrabold text-white">AI Supervisor</div>
            <div className="mt-2 text-sm leading-6 text-white/72">
              AI Supervisor is now connected to a real event architecture. Demo requests,
              upgrade intent, support signals, billing anomalies, and operational risks can
              flow into one intelligence layer across the whole platform.
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <InsightCard
                title="Email Hub Intelligence"
                body="New email items can now generate AI events for demo requests, upgrade intent, support escalation, and operational attention."
                icon={Mail}
              />
              <InsightCard
                title="Platform Signals"
                icon={Brain}
              />
              <InsightCard
                title="Tenant Growth Monitoring"
                body="Upgrade intent from Budget Couriers, GoGet Couriers, and future tenants can become visible as commercial AI events."
                icon={TrendingUp}
              />
              <InsightCard
                title="Future WhatsApp Expansion"
                body="The same AI event model can later power WhatsApp Hub, support escalation, and multi-channel platform intake."
                icon={MessageCircle}
              />
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/6 p-5 backdrop-blur-2xl">
            <div className="text-lg font-extrabold text-white">Quick Platform Actions</div>
            <div className="mt-2 text-sm text-white/72">
              Jump into the most important platform surfaces.
            </div>

            <div className="mt-4 grid gap-3">
              <QuickAction
                label="Manage Companies"
                onClick={() => navigate("/superadmin/companies")}
              />
              <QuickAction
                label="Open Email Hub"
                onClick={() => navigate("/automation/email-hub")}
              />
              <QuickAction
                label="Open AI Control Tower"
                onClick={() => navigate("/ai/control-tower")}
              />
              <QuickAction
                label="Open AI Event Center"
                onClick={() => navigate("/ai/events")}
              />
            </div>

            <div className="mt-5 rounded-[22px] border border-emerald-400/15 bg-emerald-500/10 p-4">
              <div className="text-sm font-extrabold text-emerald-200">
              </div>
              <div className="mt-2 text-sm leading-6 text-emerald-100/90">
                FlowOps is no longer just showing dashboards. It is starting to classify,
                prioritize, and surface platform opportunities and risks automatically.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard(props: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const Icon = props.icon;

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">
            {props.title}
          </div>
          <div className="mt-3 text-3xl font-black text-white">{props.value}</div>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </div>
  );
}

function InsightCard(props: {
  title: string;
  body?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const Icon = props.icon;

  return (
    <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 ring-1 ring-white/10">
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div className="mt-3 text-sm font-extrabold text-white">{props.title}</div>
      <div className="mt-2 text-sm leading-6 text-white/70">{props.body || ""}</div>
    </div>
  );
}

function QuickAction(props: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-left text-white transition hover:bg-white/12"
    >
      <div className="text-sm font-semibold">{props.label}</div>
      <ArrowUpRight className="h-4 w-4 text-white/75" />
    </button>
  );
}
