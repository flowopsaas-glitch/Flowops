import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Award,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  RefreshCw,
  Route,
  Sparkles,
  Truck,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { api } from "../../api/client";

// ── Types ──────────────────────────────────────────────────────────────────

type OpsSummary = {
  today: {
    collected: number;
    inProgress: number;
    pending: number;
    failed: number;
    deliveredWaybills: number;
    failedWaybills: number;
    activeShipments: number;
  };
  drivers: {
    available: number;
    onRoute: number;
    offline: number;
  };
  unassigned: Array<{
    id: string;
    clientName?: string | null;
    pickupAddress?: string | null;
    createdAt: string;
  }>;
  exceptions: Array<{
    id: string;
    trackingNumber: string;
    status: string;
    updatedAt: string;
    recipientName?: string | null;
    recipientAddress?: string | null;
  }>;
  leaderboard: Array<{
    driverId?: string | null;
    jobsToday: number;
    name?: string | null;
    vehicleType?: string | null;
    status?: string | null;
  }>;
  trend: Array<{ date: string; count: number }>;
};

type ExceptionSla = {
  slaHours: number;
  openCount: number;
  breached: number;
  withinSla: number;
  breachRatePct: number;
  oldestHours: number;
  buckets: { lt4: number; h4_12: number; h12_24: number; gt24: number };
  watch: Array<{
    id: string;
    trackingNumber: string;
    status: string;
    recipientName?: string | null;
    recipientAddress?: string | null;
    riskLevel?: string | null;
    ageHours: number;
    breached: boolean;
  }>;
  note: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function unwrap(raw: any): OpsSummary | null {
  return (raw?.data ?? raw) as OpsSummary | null;
}

function relTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function shortDate(iso: string): string {
  return iso.slice(5, 10).replace("-", "/");
}

const MEDAL: Record<number, string> = { 0: "🥇", 1: "🥈", 2: "🥉" };

// ── Stat card ──────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  color,
  icon: Icon,
  subtitle,
}: {
  label: string;
  value: number | string;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
  subtitle?: string;
}) {
  return (
    <div
      className={`rounded-[22px] border bg-white/4 p-5 flex flex-col gap-2 shadow-[0_8px_30px_rgba(0,0,0,0.22)] ${color}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.22em] text-white/45">
          {label}
        </span>
        <Icon className="h-4 w-4 opacity-50" />
      </div>
      <div className="text-3xl font-black text-white leading-none">{value}</div>
      {subtitle && (
        <div className="text-[11px] text-white/40 font-medium">{subtitle}</div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function OperationsDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<OpsSummary | null>(null);
  const [sla, setSla] = useState<ExceptionSla | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const raw: any = await api.get("/operations/summary");
      setData(unwrap(raw));
      api.get("/operations/exception-sla").then((r: any) => setSla(r?.data ?? r)).catch(() => setSla(null));
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e?.message || "Failed to load operations data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  // Auto-refresh every 60 s
  useEffect(() => {
    const t = setInterval(() => void load("refresh"), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const driverTotal = useMemo(
    () =>
      (data?.drivers.available ?? 0) +
      (data?.drivers.onRoute ?? 0) +
      (data?.drivers.offline ?? 0),
    [data]
  );

  const utilisation = useMemo(
    () =>
      driverTotal > 0
        ? Math.round(((data?.drivers.onRoute ?? 0) / driverTotal) * 100)
        : 0,
    [data, driverTotal]
  );

  const deliveryRate = useMemo(() => {
    if (!data) return 0;
    const total =
      data.today.deliveredWaybills + data.today.failedWaybills;
    return total > 0
      ? Math.round((data.today.deliveredWaybills / total) * 100)
      : 0;
  }, [data]);

  // ── Skeleton ──
  if (loading) {
    return (
      <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(30,80,140,0.14),transparent_28%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8">
        <div className="mx-auto max-w-[1400px] space-y-6 animate-pulse">
          <div className="h-28 rounded-[30px] bg-white/5" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-28 rounded-[22px] bg-white/5" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-64 rounded-[28px] bg-white/5" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(30,80,140,0.14),transparent_28%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8 overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6">
        {/* ── Header ── */}
        <div className="rounded-[30px] border border-white/10 bg-white/6 p-6 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/85 ring-1 ring-white/15">
                <Activity className="h-3.5 w-3.5 text-sky-400" />
                Operations Command Centre
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-white">
                Ops Dashboard
              </h1>
              <p className="mt-1 text-sm text-white/50">
                Today's live operations — drivers · collections · deliveries ·
                exceptions
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-white/30 font-medium">
                Updated {relTime(lastRefresh.toISOString())}
              </span>
              <button
                onClick={() => void load("refresh")}
                disabled={refreshing}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/60 hover:bg-white/10 hover:text-white transition disabled:opacity-40"
              >
                <RefreshCw
                  className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                />
                Refresh
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {error}
            </div>
          )}
        </div>

        {/* ── Quick actions ── */}
        <div className="flex flex-wrap gap-3">
          {[
            { label: "Collections", to: "/collections", icon: Truck, color: "border-cyan-500/20 bg-cyan-500/8 text-cyan-300 hover:bg-cyan-500/15" },
            { label: "Driver Dispatch", to: "/driver-dispatch", icon: Route, color: "border-violet-500/20 bg-violet-500/8 text-violet-300 hover:bg-violet-500/15" },
            { label: "Manifests", to: "/manifests", icon: Activity, color: "border-amber-500/20 bg-amber-500/8 text-amber-300 hover:bg-amber-500/15" },
            { label: "High Risk Queue", to: "/high-risk-queue", icon: AlertTriangle, color: "border-rose-500/20 bg-rose-500/8 text-rose-300 hover:bg-rose-500/15" },
          ].map((q) => {
            const Icon = q.icon;
            return (
              <button
                key={q.to}
                onClick={() => navigate(q.to)}
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition ${q.color}`}
              >
                <Icon className="h-4 w-4" />
                {q.label}
                <ChevronRight className="h-3.5 w-3.5 opacity-50" />
              </button>
            );
          })}
        </div>

        {/* ── KPI grid ── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Pending Collections"
            value={data?.today.pending ?? 0}
            icon={Clock}
            color="border-amber-500/20"
            subtitle="awaiting dispatch"
          />
          <Stat
            label="In Progress"
            value={data?.today.inProgress ?? 0}
            icon={Truck}
            color="border-cyan-500/20"
            subtitle="drivers en-route"
          />
          <Stat
            label="Collected Today"
            value={data?.today.collected ?? 0}
            icon={CheckCircle2}
            color="border-emerald-500/20"
            subtitle="completed today"
          />
          <Stat
            label="Failed Today"
            value={data?.today.failed ?? 0}
            icon={XCircle}
            color="border-rose-500/20"
            subtitle="needs attention"
          />
          <Stat
            label="Waybills Delivered"
            value={data?.today.deliveredWaybills ?? 0}
            icon={CheckCircle2}
            color="border-emerald-500/10"
            subtitle="from start of today"
          />
          <Stat
            label="Delivery Success"
            value={`${deliveryRate}%`}
            icon={Activity}
            color="border-sky-500/20"
            subtitle={`${data?.today.failedWaybills ?? 0} failures today`}
          />
          <Stat
            label="Active Shipments"
            value={data?.today.activeShipments ?? 0}
            icon={Zap}
            color="border-violet-500/20"
            subtitle="in transit right now"
          />
          <Stat
            label="Fleet Utilisation"
            value={`${utilisation}%`}
            icon={Users}
            color="border-white/10"
            subtitle={`${data?.drivers.onRoute ?? 0} / ${driverTotal} drivers active`}
          />
        </div>

        {/* ── Driver availability strip ── */}
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              label: "Available",
              value: data?.drivers.available ?? 0,
              dot: "bg-emerald-400",
              bg: "border-emerald-500/20 bg-emerald-500/6",
              text: "text-emerald-300",
              sub: "Ready for assignment",
            },
            {
              label: "On Route",
              value: data?.drivers.onRoute ?? 0,
              dot: "bg-cyan-400 animate-pulse",
              bg: "border-cyan-500/20 bg-cyan-500/6",
              text: "text-cyan-300",
              sub: "Currently dispatched",
            },
            {
              label: "Offline",
              value: data?.drivers.offline ?? 0,
              dot: "bg-white/25",
              bg: "border-white/10 bg-white/3",
              text: "text-white/50",
              sub: "Not active",
            },
          ].map((d) => (
            <div
              key={d.label}
              className={`rounded-[22px] border ${d.bg} flex items-center gap-5 px-6 py-4`}
            >
              <div className="relative flex-shrink-0">
                <div
                  className={`h-12 w-12 rounded-full border-2 ${d.bg} flex items-center justify-center`}
                >
                  <span
                    className={`text-2xl font-black ${d.text}`}
                  >
                    {d.value}
                  </span>
                </div>
                <div
                  className={`absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full ${d.dot}`}
                />
              </div>
              <div>
                <div className={`text-base font-black ${d.text}`}>
                  {d.label}
                </div>
                <div className="text-xs text-white/40">{d.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── 3-column: trend | leaderboard | exceptions ── */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* 7-day trend */}
          <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.3)]">
            <div className="flex items-center gap-3 mb-5">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-sky-500/15 ring-1 ring-sky-500/20">
                <Activity className="h-4 w-4 text-sky-400" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white">
                  7-Day Delivery Trend
                </h3>
                <p className="text-[11px] text-white/40">Waybills delivered per day</p>
              </div>
            </div>
            {data?.trend && data.trend.length > 0 ? (
              <ResponsiveContainer width="100%" height={140}>
                <BarChart
                  data={data.trend}
                  margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                >
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "rgba(255,255,255,0.35)" }}
                    tickFormatter={shortDate}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0b1530",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 12,
                      fontSize: 12,
                      color: "#fff",
                    }}
                    formatter={(v: any) => [v, "Delivered"]}
                    labelFormatter={shortDate}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {data.trend.map((entry, idx) => (
                      <Cell
                        key={idx}
                        fill={
                          idx === data.trend.length - 1
                            ? "rgba(56,189,248,0.7)"
                            : "rgba(56,189,248,0.25)"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[140px] items-center justify-center rounded-2xl border border-dashed border-white/10 text-sm text-white/25">
                No delivery data yet
              </div>
            )}
          </div>

          {/* Driver leaderboard */}
          <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.3)]">
            <div className="flex items-center gap-3 mb-5">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/20">
                <Award className="h-4 w-4 text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white">
                  Driver Leaderboard
                </h3>
                <p className="text-[11px] text-white/40">Jobs completed today</p>
              </div>
            </div>
            <div className="space-y-2">
              {data?.leaderboard && data.leaderboard.length > 0 ? (
                data.leaderboard.map((d, i) => (
                  <div
                    key={d.driverId ?? i}
                    className="flex items-center justify-between rounded-2xl border border-white/6 bg-black/20 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-base w-5 text-center">
                        {MEDAL[i] ?? `${i + 1}`}
                      </span>
                      <div>
                        <div className="text-sm font-bold text-white">
                          {d.name ?? "Unknown"}
                        </div>
                        <div className="text-[11px] text-white/35 capitalize">
                          {d.vehicleType ?? "vehicle"} ·{" "}
                          <span
                            className={
                              d.status === "AVAILABLE"
                                ? "text-emerald-400"
                                : d.status === "ON_ROUTE"
                                ? "text-cyan-400"
                                : "text-white/30"
                            }
                          >
                            {d.status?.toLowerCase() ?? "unknown"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-black text-white">
                        {d.jobsToday}
                      </div>
                      <div className="text-[10px] text-white/35 uppercase tracking-wider">
                        jobs
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex h-28 items-center justify-center rounded-2xl border border-dashed border-white/10 text-sm text-white/25">
                  No activity yet today
                </div>
              )}
            </div>
          </div>

          {/* Exception feed */}
          <div className="rounded-[28px] border border-rose-500/15 bg-rose-500/4 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.3)]">
            <div className="flex items-center gap-3 mb-5">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-rose-500/15 ring-1 ring-rose-500/20">
                <AlertTriangle className="h-4 w-4 text-rose-400" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white">
                  Exception Feed
                </h3>
                <p className="text-[11px] text-white/40">
                  Failed / returned in last 24h
                </p>
              </div>
            </div>
            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {data?.exceptions && data.exceptions.length > 0 ? (
                data.exceptions.map((ex) => (
                  <div
                    key={ex.id}
                    className="rounded-2xl border border-rose-500/15 bg-black/25 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-black text-rose-300 font-mono">
                        {ex.trackingNumber}
                      </span>
                      <span
                        className={`text-[10px] font-bold rounded-full px-2 py-0.5 border ${
                          ex.status === "FAILED_DELIVERY"
                            ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                            : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                        }`}
                      >
                        {ex.status === "FAILED_DELIVERY"
                          ? "Failed"
                          : "Returned"}
                      </span>
                    </div>
                    <div className="text-[11px] text-white/55">
                      {ex.recipientName ?? ex.recipientAddress ?? "—"}
                    </div>
                    <div className="mt-1 text-[10px] text-white/30">
                      {relTime(ex.updatedAt)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex h-28 items-center justify-center rounded-2xl border border-dashed border-rose-500/15 text-sm text-rose-200/20">
                  No exceptions in last 24h ✓
                </div>
              )}
            </div>
            {(data?.exceptions?.length ?? 0) > 0 && (
              <button
                onClick={() => navigate("/high-risk-queue")}
                className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/8 px-4 py-2.5 text-sm font-bold text-rose-300 hover:bg-rose-500/15 transition"
              >
                View All Exceptions
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* ── Exception SLA tracker ── */}
        {sla && sla.openCount > 0 && (
          <ExceptionSlaPanel sla={sla} onView={() => navigate("/high-risk-queue")} />
        )}

        {/* ── Unassigned collections ── */}
        {(data?.unassigned?.length ?? 0) > 0 && (
          <div className="rounded-[28px] border border-amber-500/20 bg-amber-500/5 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.3)]">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/20">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">
                    Unassigned Collections
                  </h3>
                  <p className="text-[11px] text-white/40">
                    {data!.unassigned.length} pending — no driver assigned
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate("/collections")}
                className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm font-bold text-amber-300 hover:bg-amber-500/20 transition"
              >
                <Bot className="h-4 w-4" />
                AI Dispatch
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {data!.unassigned.slice(0, 8).map((c) => (
                <div
                  key={c.id}
                  onClick={() =>
                    navigate(`/collections?collectionId=${c.id}`)
                  }
                  className="cursor-pointer rounded-2xl border border-white/8 bg-black/25 px-4 py-3 hover:border-amber-500/30 hover:bg-amber-500/5 transition"
                >
                  <div className="text-xs font-black text-amber-200 mb-1 truncate">
                    {c.clientName ?? "Unknown Client"}
                  </div>
                  <div className="text-[11px] text-white/40 truncate">
                    {c.pickupAddress ?? "No address"}
                  </div>
                  <div className="mt-2 text-[10px] text-white/25">
                    {relTime(c.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── All-good state ── */}
        {(data?.unassigned?.length ?? 0) === 0 &&
          (data?.exceptions?.length ?? 0) === 0 && (
            <div className="rounded-[28px] border border-emerald-500/20 bg-emerald-500/5 p-8 text-center shadow-[0_18px_60px_rgba(0,0,0,0.2)]">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400 mb-3" />
              <h3 className="text-lg font-black text-white mb-1">
                All Clear
              </h3>
              <p className="text-sm text-white/45">
                No unassigned collections and no exceptions. Operations running
                smoothly.
              </p>
            </div>
          )}
      </div>
    </div>
  );
}



// ── Exception SLA tracker ────────────────────────────────────────────────────

function fmtAge(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${Math.round(h)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function ExceptionSlaPanel({ sla, onView }: { sla: ExceptionSla; onView: () => void }) {
  const segs = [
    { v: sla.buckets.lt4, cls: "bg-emerald-400", label: "<4h" },
    { v: sla.buckets.h4_12, cls: "bg-sky-400", label: "4–12h" },
    { v: sla.buckets.h12_24, cls: "bg-amber-400", label: "12–24h" },
    { v: sla.buckets.gt24, cls: "bg-rose-500", label: ">24h" },
  ];
  const bucketTotal = Math.max(1, segs.reduce((s, b) => s + b.v, 0));

  return (
    <div className="rounded-[28px] border border-rose-500/20 bg-rose-500/[0.05] p-6 shadow-[0_18px_60px_rgba(0,0,0,0.3)] fx-reveal">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-rose-500/15 ring-1 ring-rose-500/20">
            <Clock className="h-4 w-4 text-rose-400" />
          </div>
          <div>
            <h3 className="text-sm font-black text-white">Exception SLA Tracker</h3>
            <p className="text-[11px] text-white/40">Open failed / returned waybills aged against a {sla.slaHours}h actioning SLA</p>
          </div>
        </div>
        <button onClick={onView} className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/8 px-4 py-2 text-sm font-bold text-rose-300 hover:bg-rose-500/15 transition">
          Work queue <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="text-2xl font-black text-white">{sla.openCount}</div>
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40 mt-1">Open exceptions</div>
        </div>
        <div className={`rounded-2xl border p-4 ${sla.breached > 0 ? "border-rose-500/30 bg-rose-500/[0.08]" : "border-white/8 bg-white/[0.03]"}`}>
          <div className={`text-2xl font-black ${sla.breached > 0 ? "text-rose-300" : "text-white"}`}>{sla.breached}</div>
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40 mt-1">SLA breached</div>
          <div className="text-[10px] text-white/35 mt-0.5">{sla.breachRatePct}% of open</div>
        </div>
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] p-4">
          <div className="text-2xl font-black text-emerald-300">{sla.withinSla}</div>
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40 mt-1">Within SLA</div>
        </div>
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.06] p-4">
          <div className="text-2xl font-black text-amber-300">{fmtAge(sla.oldestHours)}</div>
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40 mt-1">Oldest open</div>
        </div>
      </div>

      {/* Aging spread */}
      <div className="mt-5">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40 mb-2">Aging spread</p>
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/5">
          {segs.map((s) => s.v > 0 && (
            <div key={s.label} className={s.cls} style={{ width: `${(s.v / bucketTotal) * 100}%` }} title={`${s.label}: ${s.v}`} />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-white/45">
          {segs.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${s.cls}`} /> {s.label} {s.v}</span>
          ))}
        </div>
      </div>

      {/* Oldest-first watch list */}
      <div className="mt-5">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40 mb-2">Oldest unactioned — work these first</p>
        <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
          {sla.watch.map((w) => (
            <div key={w.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-black/25 px-3 py-2">
              <span className="font-mono text-xs font-black text-rose-300 shrink-0">{w.trackingNumber}</span>
              <span className={`text-[9px] font-bold rounded-full px-2 py-0.5 border shrink-0 ${w.status === "FAILED_DELIVERY" ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>
                {w.status === "FAILED_DELIVERY" ? "Failed" : "Returned"}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-white/55">{w.recipientName ?? w.recipientAddress ?? "—"}</span>
              {w.breached
                ? <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[9px] font-bold text-rose-300 shrink-0">breached · {fmtAge(w.ageHours)}</span>
                : <span className="text-[10px] text-white/40 shrink-0">{fmtAge(w.ageHours)}</span>}
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 text-[10px] leading-snug text-white/30">{sla.note}</p>
    </div>
  );
}
