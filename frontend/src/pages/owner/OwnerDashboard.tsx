import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  Crown,
  LogOut,
  Shield,
  Sparkles,
  Users,
  Wallet
} from "lucide-react";
import { api, clearToken, ApiError, get } from '../../api/client';

type PlatformOverview = {
  companies: number;
  users: number;
  superAdmins: number;
  companyAdmins: number;
  activeCompanies: number;
  inactiveCompanies: number;
  demoTenants: number;
  planBreakdown: Record<string, number>;
};

function cn(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(" ");
}

export default function OwnerDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<PlatformOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setLoading(true);
      setError("");
      const result = await get<PlatformOverview>("/companies/platform/overview");
      setData(result);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load owner dashboard.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function signOut() {
    clearToken();
    navigate("/owner/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-[#050913] text-white p-6 md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-cyan-100">
                <Crown className="h-3.5 w-3.5" />
                FlowOps Hidden Owner Layer
              </div>

              <h1 className="mt-4 text-4xl font-black tracking-tight">
                Owner Dashboard
              </h1>

              <p className="mt-2 max-w-3xl text-sm text-slate-300 md:text-base">
                Hidden platform control for tenants, demo subscriptions, pricing, and platform-wide visibility.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate("/owner/tenants")}
                className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 font-bold text-white hover:bg-white/[0.1]"
              >
                Manage Tenants
              </button>

              <button
                type="button"
                onClick={signOut}
                className="inline-flex items-center gap-2 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 font-bold text-red-100 hover:bg-red-500/20"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-red-200">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.04] p-10 text-slate-300">
            Loading owner dashboard...
          </div>
        ) : data ? (
          <>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard title="Tenants" value={String(data.companies)} icon={Building2} />
              <StatCard title="Users" value={String(data.users)} icon={Users} />
              <StatCard title="Demo Tenants" value={String(data.demoTenants)} icon={Sparkles} />
              <StatCard title="Active Tenants" value={String(data.activeCompanies)} icon={Shield} />
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                <div className="text-lg font-extrabold text-white">
                  Platform Summary
                </div>
                <div className="mt-1 text-sm text-slate-400">
                  Hidden FlowOps-wide view across all tenants.
                </div>

                <div className="mt-4 grid gap-3">
                  <MetricRow label="Companies" value={String(data.companies)} />
                  <MetricRow label="Users" value={String(data.users)} />
                  <MetricRow label="Company Admins" value={String(data.companyAdmins)} />
                  <MetricRow label="Inactive Tenants" value={String(data.inactiveCompanies)} />
                  <MetricRow label="Owner Accounts" value={String(data.superAdmins)} />
                </div>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                <div className="flex items-center gap-2 text-lg font-extrabold text-white">
                  <Wallet className="h-5 w-5 text-cyan-200" />
                  Plan Breakdown
                </div>
                <div className="mt-1 text-sm text-slate-400">
                  Subscription distribution across tenants.
                </div>

                <div className="mt-4 grid gap-3">
                  {Object.entries(data.planBreakdown).map(([plan, count]) => (
                    <MetricRow key={plan} label={plan} value={String(count)} />
                  ))}

                  {Object.keys(data.planBreakdown).length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400">
                      No plans found.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </>
        ) : null}
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
    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-500">
          {props.title}
        </div>
        <Icon className="h-4 w-4 text-cyan-200" />
      </div>
      <div className="mt-3 text-3xl font-black text-white">{props.value}</div>
    </div>
  );
}

function MetricRow(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <div className="text-sm font-semibold text-slate-300">{props.label}</div>
      <div className="text-sm font-extrabold text-white">{props.value}</div>
    </div>
  );
}
