import React, { useEffect, useMemo, useState } from "react";
import {
  Search,
  UserCog,
  Truck,
  BadgeCheck,
  AlertTriangle,
  Brain,
  Upload,
  Camera,
  Package,
  Phone,
  Sparkles,
  CheckCircle2,
  RefreshCw
} from "lucide-react";
import { api } from '../api/client';

type DriverStatus = "AVAILABLE" | "BUSY" | "OFFLINE" | "ON_LEAVE";

type DriverApiRow = {
  id: number;
  companyId: number;
  name: string;
  phone?: string | null;
  zone?: string | null;
  homeBase?: string | null;
  vehicleType?: string | null;
  vehicleReg?: string | null;
  maxActiveDispatches: number;
  isActive: boolean;
  availabilityStatus: DriverStatus;
  lastPingAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    dispatchAssignments?: number;
    dispatches?: number;
  };
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function Drivers() {
  const [query, setQuery] = useState("");
  const [drivers, setDrivers] = useState<DriverApiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string>("");

  async function loadDrivers() {
    try {
      setLoading(true);
      setError("");

      const res = await api.get<DriverApiRow[]>("/drivers");
      setDrivers(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to load drivers."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDrivers();
  }, []);

  async function setDriverAvailability(id: number, availabilityStatus: DriverStatus) {
    try {
      setSavingId(id);
      setError("");

      await api.patch(`/drivers/${id}`, {
        availabilityStatus
      });

      await loadDrivers();
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to update driver."
      );
    } finally {
      setSavingId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) return drivers;

    return drivers.filter((driver) => {
      return (
        driver.name.toLowerCase().includes(q) ||
        (driver.phone || "").toLowerCase().includes(q) ||
        (driver.zone || "").toLowerCase().includes(q) ||
        (driver.vehicleReg || "").toLowerCase().includes(q) ||
        (driver.vehicleType || "").toLowerCase().includes(q) ||
        driver.availabilityStatus.toLowerCase().includes(q)
      );
    });
  }, [drivers, query]);

  const summary = useMemo(() => {
    return {
      total: drivers.length,
      available: drivers.filter((d) => d.availabilityStatus === "AVAILABLE").length,
      busy: drivers.filter((d) => d.availabilityStatus === "BUSY").length,
      offline: drivers.filter((d) => d.availabilityStatus === "OFFLINE").length,
      leave: drivers.filter((d) => d.availabilityStatus === "ON_LEAVE").length
    };
  }, [drivers]);

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,#15213d_0%,#0a1122_40%,#050913_100%)] p-6 md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_0_40px_rgba(0,0,0,0.25)] backdrop-blur-xl">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-violet-200">
                <Sparkles className="h-3.5 w-3.5" />
                Driver Intelligence
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-white md:text-4xl">
                Drivers
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300 md:text-base">
                Manage active drivers, collection readiness, POD discipline, and tenant-specific operational control.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <TopStat label="Drivers" value={String(summary.total)} icon={UserCog} />
              <TopStat label="Available" value={String(summary.available)} icon={BadgeCheck} />
              <TopStat label="Busy" value={String(summary.busy)} icon={Truck} />
              <TopStat label="Offline" value={String(summary.offline)} icon={AlertTriangle} />
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_0.95fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-lg font-extrabold text-white">Driver Command Grid</div>
                <div className="mt-1 text-sm text-slate-400">
                  Live drivers loaded from your backend.
                </div>
              </div>

              <div className="flex w-full gap-3 md:w-auto">
                <div className="relative w-full md:w-[320px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search driver, zone, vehicle..."
                    className="h-11 w-full rounded-2xl border border-white/10 bg-black/20 pl-10 pr-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/40"
                  />
                </div>

                <button
                  type="button"
                  onClick={loadDrivers}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-white transition hover:bg-white/10"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            {loading ? (
              <div className="mt-5 rounded-[24px] border border-white/10 bg-black/20 p-8 text-center text-slate-300">
                Loading drivers...
              </div>
            ) : (
              <div className="mt-5 grid gap-4">
                {filtered.map((driver) => (
                  <div
                    key={driver.id}
                    className="rounded-[24px] border border-white/10 bg-black/20 p-4 transition hover:border-violet-400/20 hover:bg-white/[0.05]"
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-extrabold text-white">
                            {driver.name}
                          </div>
                          <DriverStatusBadge status={driver.availabilityStatus} />
                          <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] font-extrabold text-slate-300">
                            DRIVER #{driver.id}
                          </span>
                          {!driver.isActive ? (
                            <span className="rounded-full border border-red-400/20 bg-red-500/10 px-2.5 py-1 text-[10px] font-extrabold text-red-200">
                              INACTIVE
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-3 grid gap-2 text-sm text-slate-300 md:grid-cols-2 xl:grid-cols-4">
                          <Pill icon={Truck} label={`Vehicle: ${driver.vehicleReg || "Not set"}`} />
                          <Pill icon={Phone} label={driver.phone || "No phone"} />
                          <Pill
                            icon={Package}
                            label={`Assignments: ${driver._count?.dispatchAssignments ?? 0}`}
                          />
                          <Pill
                            icon={Camera}
                            label={`Zone: ${driver.zone || "Unassigned"}`}
                          />
                        </div>

                        <div className="mt-3 rounded-2xl border border-violet-400/10 bg-violet-400/5 p-3">
                          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-violet-200">
                            <Brain className="h-4 w-4" />
                            Driver note
                          </div>
                          <div className="mt-1 text-sm text-slate-200">
                            {driver.notes?.trim()
                              ? driver.notes
                              : "No notes yet. Ready for AI scoring, POD behaviour analysis, and assignment optimization."}
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-2 xl:w-[260px]">
                        <button
                          type="button"
                          disabled={savingId === driver.id}
                          onClick={() => setDriverAvailability(driver.id, "AVAILABLE")}
                          className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-left transition hover:border-emerald-400/20 hover:bg-emerald-400/10 disabled:opacity-60"
                        >
                          <span className="text-sm font-bold text-white">Set Available</span>
                          <BadgeCheck className="h-4 w-4 text-emerald-200" />
                        </button>

                        <button
                          type="button"
                          disabled={savingId === driver.id}
                          onClick={() => setDriverAvailability(driver.id, "BUSY")}
                          className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-left transition hover:border-amber-400/20 hover:bg-amber-400/10 disabled:opacity-60"
                        >
                          <span className="text-sm font-bold text-white">Set Busy</span>
                          <Upload className="h-4 w-4 text-amber-200" />
                        </button>

                        <button
                          type="button"
                          disabled={savingId === driver.id}
                          onClick={() => setDriverAvailability(driver.id, "OFFLINE")}
                          className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-left transition hover:border-slate-400/20 hover:bg-slate-400/10 disabled:opacity-60"
                        >
                          <span className="text-sm font-bold text-white">Set Offline</span>
                          <UserCog className="h-4 w-4 text-slate-200" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {filtered.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-8 text-center">
                    <div className="text-lg font-bold text-white">No drivers found</div>
                    <div className="mt-2 text-sm text-slate-400">
                      Try another search term.
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="grid gap-6">
            <Card title="AI-ready driver workflows" subtitle="Built for real operations">
              <Feature text="Choose which driver receives a collection assignment from ops." />
              <Feature text="Track POD upload delays and highlight non-compliance automatically." />
              <Feature text="Prepare for WhatsApp parcel intake and POD upload mapping into the correct client account." />
              <Feature text="Score drivers by zone efficiency, successful POD return, and failed attempt patterns." />
            </Card>

            <Card title="POD and intake vision" subtitle="Future-ready layer">
              <div className="space-y-3 text-sm text-slate-300">
                <p>
                  This page is now backend-connected and ready to become the operational home for driver assignment, POD review, and later WhatsApp-linked intake.
                </p>
                <p>
                </p>
              </div>
            </Card>

            <Card title="Operational snapshot" subtitle="Today">
              <MetricRow label="Available drivers" value={String(summary.available)} tone="good" />
              <MetricRow label="Busy drivers" value={String(summary.busy)} tone="neutral" />
              <MetricRow label="Offline drivers" value={String(summary.offline)} tone="risk" />
              <MetricRow label="On leave drivers" value={String(summary.leave)} tone="neutral" />
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function TopStat(props: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const Icon = props.icon;

  return (
    <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-500">
          {props.label}
        </div>
        <Icon className="h-4 w-4 text-violet-200" />
      </div>
      <div className="mt-2 text-2xl font-black text-white">{props.value}</div>
    </div>
  );
}

function DriverStatusBadge({ status }: { status: DriverStatus }) {
  const cls =
    status === "AVAILABLE"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
      : status === "BUSY"
      ? "border-blue-400/20 bg-blue-400/10 text-blue-200"
      : status === "OFFLINE"
      ? "border-slate-500/20 bg-slate-500/10 text-slate-300"
      : "border-amber-400/20 bg-amber-400/10 text-amber-200";

  return (
    <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-extrabold", cls)}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function Pill(props: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  const Icon = props.icon;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
      <Icon className="h-4 w-4 text-slate-400" />
      <span className="truncate">{props.label}</span>
    </div>
  );
}

function Card(props: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl">
      <div className="text-lg font-extrabold text-white">{props.title}</div>
      <div className="mt-1 text-sm text-slate-400">{props.subtitle}</div>
      <div className="mt-4">{props.children}</div>
    </div>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
      <div className="text-sm text-slate-200">{text}</div>
    </div>
  );
}

function MetricRow(props: {
  label: string;
  value: string;
  tone: "good" | "neutral" | "risk";
}) {
  const toneClass =
    props.tone === "good"
      ? "text-emerald-200"
      : props.tone === "neutral"
      ? "text-amber-200"
      : "text-red-200";

  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <div className="text-sm font-semibold text-slate-300">{props.label}</div>
      <div className={cn("text-sm font-extrabold", toneClass)}>{props.value}</div>
    </div>
  );
}
