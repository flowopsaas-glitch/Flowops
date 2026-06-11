import React, { useEffect, useMemo, useState } from "react";
import {
  Route,
  Truck,
  Brain,
  Clock3,
  MapPinned,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Search,
  ArrowRight,
  PackageCheck,
  RefreshCw
} from "lucide-react";
import { api } from '../api/client';

type DispatchJobStatus =
  | "UNASSIGNED"
  | "ASSIGNED"
  | "ACCEPTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

type DispatchPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

type DispatchJobRow = {
  id: string;
  companyId: number;
  createdByUserId?: number | null;
  jobType: "COLLECTION" | "DELIVERY" | "TRANSFER" | "RETURNS";
  status: DispatchJobStatus;
  priority: DispatchPriority;
  reference?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  collectionAddress?: string | null;
  deliveryAddress?: string | null;
  area?: string | null;
  scheduledAt?: string | null;
  dueAt?: string | null;
  parcelCount?: number | null;
  weightKg?: number | null;
  serviceLevel?: string | null;
  notes?: string | null;
  aiRiskScore?: number | null;
  aiConfidence?: number | null;
  aiExplanation?: string | null;
  isUrgent: boolean;
  slaRisk: boolean;
  createdAt: string;
  updatedAt: string;
  assignments?: Array<{
    id: number;
    status: string;
    driverId: number;
    driver?: {
      id: number;
      name: string;
      vehicleReg?: string | null;
      zone?: string | null;
    };
  }>;
};

type DriverRow = {
  id: number;
  name: string;
  zone?: string | null;
  vehicleReg?: string | null;
  availabilityStatus: "AVAILABLE" | "BUSY" | "OFFLINE" | "ON_LEAVE";
  isActive: boolean;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function DispatchBoard() {
  const [query, setQuery] = useState("");
  const [jobs, setJobs] = useState<DispatchJobRow[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingJobId, setSavingJobId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [driverSelection, setDriverSelection] = useState<Record<string, string>>({});
  const [createForm, setCreateForm] = useState({
    jobType: "COLLECTION",
    priority: "NORMAL",
    reference: "",
    customerName: "",
    customerPhone: "",
    collectionAddress: "",
    deliveryAddress: "",
    area: "",
    parcelCount: "1",
    serviceLevel: "",
    notes: ""
  });

  async function loadData() {
    try {
      setLoading(true);
      setError("");

      const [jobsRes, driversRes] = await Promise.all([
        api.get<DispatchJobRow[]>("/dispatch/jobs"),
        api.get<DriverRow[]>("/drivers")
      ]);

      setJobs(Array.isArray(jobsRes.data) ? jobsRes.data : []);
      setDrivers(Array.isArray(driversRes.data) ? driversRes.data : []);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to load dispatch board."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function createJob(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSavingJobId("create");
      setError("");

      await api.post("/dispatch/jobs", {
        jobType: createForm.jobType,
        priority: createForm.priority,
        reference: createForm.reference || undefined,
        customerName: createForm.customerName || undefined,
        customerPhone: createForm.customerPhone || undefined,
        collectionAddress: createForm.collectionAddress || undefined,
        deliveryAddress: createForm.deliveryAddress || undefined,
        area: createForm.area || undefined,
        parcelCount: Number(createForm.parcelCount || "1"),
        serviceLevel: createForm.serviceLevel || undefined,
        notes: createForm.notes || undefined,
        isUrgent: createForm.priority === "URGENT"
      });

      setCreateForm({
        jobType: "COLLECTION",
        priority: "NORMAL",
        reference: "",
        customerName: "",
        customerPhone: "",
        collectionAddress: "",
        deliveryAddress: "",
        area: "",
        parcelCount: "1",
        serviceLevel: "",
        notes: ""
      });

      await loadData();
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to create dispatch job."
      );
    } finally {
      setSavingJobId(null);
    }
  }

  async function assignDriver(jobId: string) {
    const selected = driverSelection[jobId];

    if (!selected) {
      setError("Please choose a driver before assigning.");
      return;
    }

    try {
      setSavingJobId(jobId);
      setError("");

      await api.post(`/dispatch/jobs/${jobId}/assign`, {
        driverId: Number(selected)
      });

      await loadData();
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to assign driver."
      );
    } finally {
      setSavingJobId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return jobs;

    return jobs.filter((job) => {
      return (
        job.id.toLowerCase().includes(q) ||
        (job.reference || "").toLowerCase().includes(q) ||
        (job.customerName || "").toLowerCase().includes(q) ||
        (job.area || "").toLowerCase().includes(q) ||
        job.status.toLowerCase().includes(q) ||
        job.jobType.toLowerCase().includes(q)
      );
    });
  }, [jobs, query]);

  const totals = useMemo(() => {
    return {
      jobs: jobs.length,
      unassigned: jobs.filter((j) => j.status === "UNASSIGNED").length,
      active: jobs.filter((j) =>
        ["ASSIGNED", "ACCEPTED", "IN_PROGRESS"].includes(j.status)
      ).length,
      urgent: jobs.filter((j) => j.priority === "URGENT" || j.isUrgent).length
    };
  }, [jobs]);

  const availableDrivers = useMemo(() => {
    return drivers.filter((d) => d.isActive && d.availabilityStatus === "AVAILABLE");
  }, [drivers]);

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,#12203f_0%,#0a1122_40%,#050913_100%)] p-6 md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_0_40px_rgba(0,0,0,0.25)] backdrop-blur-xl">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-cyan-200">
                <Sparkles className="h-3.5 w-3.5" />
                AI Dispatch Layer
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-white md:text-4xl">
                Dispatch Board
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300 md:text-base">
                Create jobs, allocate drivers, and turn tenant operations into a controlled dispatch command center.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Jobs" value={String(totals.jobs)} icon={Route} />
              <StatCard label="Unassigned" value={String(totals.unassigned)} icon={MapPinned} />
              <StatCard label="Active" value={String(totals.active)} icon={PackageCheck} />
              <StatCard label="Urgent" value={String(totals.urgent)} icon={AlertTriangle} />
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
          <div className="grid gap-6">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-lg font-extrabold text-white">Live Dispatch Jobs</div>
                  <div className="mt-1 text-sm text-slate-400">
                    Loaded from your backend dispatch module.
                  </div>
                </div>

                <div className="flex w-full gap-3 md:w-auto">
                  <div className="relative w-full md:w-[320px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search job, reference, area..."
                      className="h-11 w-full rounded-2xl border border-white/10 bg-black/20 pl-10 pr-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={loadData}
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
                  Loading dispatch jobs...
                </div>
              ) : (
                <div className="mt-5 grid gap-4">
                  {filtered.map((job) => {
                    const activeAssignment = job.assignments?.[0];
                    const assignedDriver = activeAssignment?.driver;

                    return (
                      <div
                        key={job.id}
                        className="rounded-[24px] border border-white/10 bg-black/20 p-4 transition hover:border-cyan-400/20 hover:bg-white/[0.05]"
                      >
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-base font-extrabold text-white">
                                {job.reference || job.customerName || job.id}
                              </div>
                              <StatusBadge status={job.status} />
                              <PriorityBadge priority={job.priority} />
                            </div>

                            <div className="mt-2 grid gap-2 text-sm text-slate-300 md:grid-cols-2 xl:grid-cols-4">
                              <InfoPill icon={MapPinned} label={`Area: ${job.area || "Not set"}`} />
                              <InfoPill icon={Truck} label={`Type: ${job.jobType}`} />
                              <InfoPill icon={Clock3} label={`Parcels: ${job.parcelCount ?? 1}`} />
                              <InfoPill
                                icon={PackageCheck}
                                label={
                                  assignedDriver
                                    ? `Driver: ${assignedDriver.name}`
                                    : "Driver: Unassigned"
                                }
                              />
                            </div>

                            <div className="mt-3 rounded-2xl border border-cyan-400/10 bg-cyan-400/5 p-3">
                              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-cyan-200">
                                <Brain className="h-4 w-4" />
                                Dispatch intelligence
                              </div>
                              <div className="mt-1 text-sm text-slate-200">
                                {job.aiExplanation?.trim()
                                  ? job.aiExplanation
                                  : assignedDriver
                                  ? `Assigned to ${assignedDriver.name}. Ready for later AI route optimization by tenant, SLA, risk, and workload.`
                                  : "Currently unassigned. Ready for ops assignment and later AI-based driver recommendation."}
                              </div>
                            </div>
                          </div>

                          <div className="grid gap-2 xl:w-[280px]">
                            <select
                              value={driverSelection[job.id] || ""}
                              onChange={(e) =>
                                setDriverSelection((prev) => ({
                                  ...prev,
                                  [job.id]: e.target.value
                                }))
                              }
                              className="h-11 rounded-2xl border border-white/10 bg-white/[0.05] px-3 text-sm text-white outline-none"
                            >
                              <option value="">Choose driver</option>
                              {availableDrivers.map((driver) => (
                                <option key={driver.id} value={driver.id}>
                                  {driver.name} {driver.zone ? `Â· ${driver.zone}` : ""}
                                </option>
                              ))}
                            </select>

                            <button
                              type="button"
                              disabled={savingJobId === job.id}
                              onClick={() => assignDriver(job.id)}
                              className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-left transition hover:border-cyan-400/20 hover:bg-cyan-400/10 disabled:opacity-60"
                            >
                              <span className="text-sm font-bold text-white">
                                Assign Driver
                              </span>
                              <ArrowRight className="h-4 w-4 text-cyan-200" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {filtered.length === 0 ? (
                    <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-8 text-center">
                      <div className="text-lg font-bold text-white">No dispatch jobs found</div>
                      <div className="mt-2 text-sm text-slate-400">
                        Create one on the right, or try a different search term.
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-6">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl">
              <div className="text-lg font-extrabold text-white">Create Dispatch Job</div>
              <div className="mt-1 text-sm text-slate-400">
                Ops can create jobs and assign them immediately.
              </div>

              <form onSubmit={createJob} className="mt-4 grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={createForm.jobType}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, jobType: e.target.value }))
                    }
                    className="h-11 rounded-2xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none"
                  >
                    <option value="COLLECTION">COLLECTION</option>
                    <option value="DELIVERY">DELIVERY</option>
                    <option value="TRANSFER">TRANSFER</option>
                    <option value="RETURNS">RETURNS</option>
                  </select>

                  <select
                    value={createForm.priority}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, priority: e.target.value }))
                    }
                    className="h-11 rounded-2xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none"
                  >
                    <option value="LOW">LOW</option>
                    <option value="NORMAL">NORMAL</option>
                    <option value="HIGH">HIGH</option>
                    <option value="URGENT">URGENT</option>
                  </select>
                </div>

                <input
                  value={createForm.reference}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, reference: e.target.value }))
                  }
                  placeholder="Reference"
                  className="h-11 rounded-2xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-slate-500"
                />

                <input
                  value={createForm.customerName}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, customerName: e.target.value }))
                  }
                  placeholder="Customer name"
                  className="h-11 rounded-2xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-slate-500"
                />

                <input
                  value={createForm.customerPhone}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, customerPhone: e.target.value }))
                  }
                  placeholder="Customer phone"
                  className="h-11 rounded-2xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-slate-500"
                />

                <input
                  value={createForm.collectionAddress}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      collectionAddress: e.target.value
                    }))
                  }
                  placeholder="Collection address"
                  className="h-11 rounded-2xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-slate-500"
                />

                <input
                  value={createForm.deliveryAddress}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      deliveryAddress: e.target.value
                    }))
                  }
                  placeholder="Delivery address"
                  className="h-11 rounded-2xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-slate-500"
                />

                <div className="grid grid-cols-2 gap-3">
                  <input
                    value={createForm.area}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, area: e.target.value }))
                    }
                    placeholder="Area"
                    className="h-11 rounded-2xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-slate-500"
                  />

                  <input
                    value={createForm.parcelCount}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, parcelCount: e.target.value }))
                    }
                    placeholder="Parcel count"
                    className="h-11 rounded-2xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-slate-500"
                  />
                </div>

                <input
                  value={createForm.serviceLevel}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, serviceLevel: e.target.value }))
                  }
                  placeholder="Service level"
                  className="h-11 rounded-2xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-slate-500"
                />

                <textarea
                  value={createForm.notes}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder="Notes"
                  rows={4}
                  className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                />

                <button
                  type="submit"
                  disabled={savingJobId === "create"}
                  className="mt-2 flex items-center justify-between rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-left transition hover:bg-cyan-400/15 disabled:opacity-60"
                >
                  <span className="text-sm font-bold text-white">Create Dispatch Job</span>
                  <CheckCircle2 className="h-4 w-4 text-cyan-200" />
                </button>
              </form>
            </div>

            <PanelCard
              title="AI Optimization Layer"
              subtitle="Tenant-aware dispatch foundation"
            >
              <div className="grid gap-3">
                <FeatureLine text="Ops can assign the right driver per job from live available drivers." />
                <FeatureLine text="Ready for SLA-aware and zone-aware optimization." />
                <FeatureLine text="Can evolve into WhatsApp and POD-linked dispatch automation." />
              </div>
            </PanelCard>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard(props: {
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
        <Icon className="h-4 w-4 text-cyan-200" />
      </div>
      <div className="mt-2 text-2xl font-black text-white">{props.value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: DispatchJobStatus }) {
  const classes =
    status === "UNASSIGNED"
      ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
      : status === "ASSIGNED"
      ? "border-blue-400/20 bg-blue-400/10 text-blue-200"
      : status === "ACCEPTED"
      ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-200"
      : status === "IN_PROGRESS"
      ? "border-indigo-400/20 bg-indigo-400/10 text-indigo-200"
      : status === "COMPLETED"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
      : "border-red-400/20 bg-red-400/10 text-red-200";

  return (
    <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-extrabold", classes)}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: DispatchPriority }) {
  const classes =
    priority === "URGENT"
      ? "border-red-400/20 bg-red-400/10 text-red-200"
      : priority === "HIGH"
      ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
      : priority === "NORMAL"
      ? "border-blue-400/20 bg-blue-400/10 text-blue-200"
      : "border-slate-500/20 bg-slate-500/10 text-slate-300";

  return (
    <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-extrabold", classes)}>
      {priority}
    </span>
  );
}

function InfoPill(props: {
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

function PanelCard(props: {
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

function FeatureLine({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
      <div className="text-sm text-slate-200">{text}</div>
    </div>
  );
}
