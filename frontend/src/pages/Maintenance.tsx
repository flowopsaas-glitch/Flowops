import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ClipboardList,
  Gauge,
  Plus,
  RefreshCw,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui";
import {
  DataTable,
  ErrorState,
  PageHeader,
  StatCard,
  StatusBadge,
  type Column,
} from "@/components/patterns";
import {
  ASSET_CLASSES,
  ASSET_CLASS_LABELS,
  ASSET_STATUSES,
  ASSET_STATUS_LABELS,
  COST_KINDS,
  COST_KIND_LABELS,
  JOB_STATUS_LABELS,
  JOB_TYPES,
  JOB_TYPE_LABELS,
  addJobCost,
  allowedJobActions,
  assetStatusTone,
  cancelJob,
  completeJob,
  createAsset,
  createJob,
  fetchAssetHistory,
  fetchAssets,
  fetchJob,
  fetchJobs,
  fetchSummary,
  fleetHeadline,
  formatDate,
  formatDateTime,
  formatDuration,
  formatMeter,
  formatMoney,
  formatPercent,
  jobCostTotal,
  jobStatusTone,
  signOffJob,
  startJob,
  warrantyPositionOf,
  warrantyText,
  warrantyTone,
  type AssetHistory,
  type AssetStatus,
  type CostKind,
  type MaintenanceAsset,
  type MaintenanceJob,
  type MaintenanceJobEvent,
  type MaintenanceJobType,
  type MaintenanceSummary,
} from "../lib/maintenance";

/**
 * Asset maintenance & warranty.
 *
 * What this page refuses to do, and why:
 *
 *  - **Say "out of warranty" when nobody wrote a term down.** A card with no
 *    recorded term reads "Warranty not recorded". The distinction decides who
 *    pays for a repeat failure, so the page does not collapse it.
 *  - **Show availability without its basis.** Every percentage is followed by
 *    the window and the number of units, because a figure without a basis is a
 *    claim rather than evidence.
 *  - **Offer a delete.** There is none in the API; the correction path is
 *    cancelling a card with a reason, and the page says so.
 *  - **Let a card be closed silently.** Completing a job records what was done,
 *    the meter, and — separately — the warranty it carries. Sign-off is a
 *    second, distinct act by the custodian.
 */

const inputClass =
  "h-9 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400/50";
const textareaClass =
  "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400/50";
const labelClass = "mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400";
const primaryButton =
  "inline-flex items-center gap-2 rounded-xl bg-sky-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton =
  "inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50";

function actionErrorMessage(err: unknown): string | null {
  const response = (err as { response?: { data?: { message?: unknown } } })?.response;
  const message = response?.data?.message;
  if (typeof message === "string" && message.trim()) return message;
  if (Array.isArray(message) && message.length) return message.join(", ");
  if (typeof (err as Error)?.message === "string" && (err as Error).message.trim()) {
    return (err as Error).message;
  }
  return null;
}

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4 sm:p-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${wide ? "max-w-4xl" : "max-w-xl"} rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl`}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/10 hover:text-slate-200"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function MaintenancePage() {
  const [summary, setSummary] = useState<MaintenanceSummary | null>(null);
  const [assets, setAssets] = useState<MaintenanceAsset[]>([]);
  const [jobs, setJobs] = useState<MaintenanceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<unknown>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const [statusFilter, setStatusFilter] = useState<AssetStatus | "">("");
  const [q, setQ] = useState("");
  const [comebacksOnly, setComebacksOnly] = useState(false);

  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [history, setHistory] = useState<AssetHistory | null>(null);
  const [historyError, setHistoryError] = useState<unknown>(null);

  const [selectedJob, setSelectedJob] = useState<MaintenanceJob | null>(null);
  const [registering, setRegistering] = useState(false);
  const [raising, setRaising] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const windowDays = 30;

  const load = useCallback(() => {
    setLoading(true);
    setFailure(null);
    Promise.all([
      fetchSummary(windowDays),
      fetchAssets({ q, status: statusFilter }),
      fetchJobs({ comebacksOnly }),
    ])
      .then(([nextSummary, nextAssets, nextJobs]) => {
        setSummary(nextSummary);
        setAssets(nextAssets);
        setJobs(nextJobs);
      })
      .catch((err: unknown) => setFailure(err))
      .finally(() => setLoading(false));
  }, [q, statusFilter, comebacksOnly, windowDays]);

  useEffect(() => {
    const timer = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, q, refreshTick]);

  const openAsset = useCallback((assetId: string) => {
    setSelectedAssetId(assetId);
    setHistory(null);
    setHistoryError(null);
    fetchAssetHistory(assetId, 90)
      .then(setHistory)
      .catch((err: unknown) => setHistoryError(err));
  }, []);

  const refresh = () => setRefreshTick((tick) => tick + 1);

  const assetColumns: Column<MaintenanceAsset>[] = useMemo(
    () => [
      {
        id: "unit",
        header: "Unit",
        sortable: true,
        sortValue: (row) => row.assetCode,
        cell: (row) => (
          <div className="min-w-0">
            <div className="font-medium text-slate-100">{row.assetCode}</div>
            <div className="truncate text-xs text-slate-400">{row.name ?? ASSET_CLASS_LABELS[row.assetClass]}</div>
          </div>
        ),
      },
      {
        id: "class",
        header: "Class",
        responsiveClassName: "hidden md:table-cell",
        cell: (row) => <span className="text-slate-300">{ASSET_CLASS_LABELS[row.assetClass]}</span>,
      },
      {
        id: "custodian",
        header: "Contract",
        responsiveClassName: "hidden lg:table-cell",
        cell: (row) => <span className="text-slate-300">{row.custodian ?? "—"}</span>,
      },
      {
        id: "meter",
        header: "Meter",
        responsiveClassName: "hidden sm:table-cell",
        cell: (row) => (
          <span className="tabular-nums text-slate-300">{formatMeter(row.meterReading, row.meterType)}</span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: (row) => (
          <div className="flex flex-col items-start gap-1">
            <StatusBadge tone={assetStatusTone(row.status)}>{ASSET_STATUS_LABELS[row.status]}</StatusBadge>
            {row.openJob ? (
              <span className="text-xs text-amber-300">{row.openJob.jobNumber} open</span>
            ) : null}
          </div>
        ),
      },
    ],
    [],
  );

  const jobColumns: Column<MaintenanceJob>[] = useMemo(
    () => [
      {
        id: "number",
        header: "Card",
        sortable: true,
        sortValue: (row) => row.jobNumber,
        cell: (row) => (
          <div className="min-w-0">
            <div className="font-medium text-slate-100">{row.jobNumber}</div>
            <div className="truncate text-xs text-slate-400">{row.faultDescription}</div>
          </div>
        ),
      },
      {
        id: "unit",
        header: "Unit",
        responsiveClassName: "hidden sm:table-cell",
        cell: (row) => <span className="text-slate-300">{row.asset?.assetCode ?? "—"}</span>,
      },
      {
        id: "type",
        header: "Type",
        responsiveClassName: "hidden md:table-cell",
        cell: (row) => <span className="text-slate-300">{JOB_TYPE_LABELS[row.type]}</span>,
      },
      {
        id: "downtime",
        header: "Downtime",
        responsiveClassName: "hidden lg:table-cell",
        cell: (row) =>
          row.downtimeMinutes === null ? (
            // Null is meaningful: planned work is not lost availability.
            <span className="text-slate-500">{row.type === "PLANNED" || row.type === "INSPECTION" ? "planned" : "—"}</span>
          ) : (
            <span className="tabular-nums text-slate-300">{formatDuration(row.downtimeMinutes)}</span>
          ),
      },
      {
        id: "cost",
        header: "Cost",
        responsiveClassName: "hidden md:table-cell",
        cell: (row) => (
          <span className="tabular-nums text-slate-300">{formatMoney(jobCostTotal(row), row.currency)}</span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: (row) => (
          <div className="flex flex-col items-start gap-1">
            <StatusBadge tone={jobStatusTone(row.status)}>{JOB_STATUS_LABELS[row.status]}</StatusBadge>
            {row.priorJobId ? (
              <Badge variant="outline" className="border-amber-400/40 text-amber-300">
                Comeback
              </Badge>
            ) : null}
          </div>
        ),
      },
    ],
    [],
  );

  const metrics = summary?.metrics;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asset Maintenance"
        description={`What is working, what it costs, and what we owe on it — last ${windowDays} days.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={secondaryButton} onClick={refresh} aria-label="Refresh">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            <button type="button" className={secondaryButton} onClick={() => setRegistering(true)}>
              <Plus className="h-4 w-4" /> Register unit
            </button>
            <button type="button" className={primaryButton} onClick={() => setRaising(true)}>
              <Wrench className="h-4 w-4" /> Raise job card
            </button>
          </div>
        }
      />

      {failure ? (
        <ErrorState error={failure} onRetry={refresh} />
      ) : (
        <>
          {/* The sentence first: an operator should not have to interpret four
              tiles to know whether the fleet is working. */}
          <div
            className={`rounded-2xl border p-4 ${
              // Neutral until the numbers arrive. A green "all clear" rendered
              // before the data loads is the page claiming a fact it does not
              // have yet.
              summary === null
                ? "border-white/10 bg-white/5"
                : summary.status === "attention"
                  ? "border-amber-400/30 bg-amber-500/10"
                  : "border-emerald-400/30 bg-emerald-500/10"
            }`}
          >
            <div className="flex items-start gap-3">
              {summary === null ? (
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
              ) : summary.status === "attention" ? (
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
              ) : (
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-100" data-testid="fleet-headline">
                  {fleetHeadline(summary)}
                </p>
                {summary?.findings?.length ? (
                  <ul className="mt-2 space-y-1">
                    {summary.findings.map((finding) => (
                      <li key={finding.code} className="text-xs text-slate-300">
                        {finding.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Availability"
              value={formatPercent(metrics?.availabilityPercent)}
              hint={`${metrics?.assets ?? 0} units · ${metrics?.downtimeHours ?? 0} h lost`}
              icon={<Gauge className="h-4 w-4" />}
              isLoading={loading}
            />
            <StatCard
              label="Units down"
              value={metrics?.assetsDown ?? 0}
              hint="Out of service now"
              higherIsBetter={false}
              icon={<AlertTriangle className="h-4 w-4" />}
              isLoading={loading}
            />
            <StatCard
              label="Open cards"
              value={metrics?.jobsOpen ?? 0}
              hint={`${metrics?.jobsCompleted ?? 0} completed in window`}
              higherIsBetter={false}
              icon={<ClipboardList className="h-4 w-4" />}
              isLoading={loading}
            />
            <StatCard
              label="Warranty exposure"
              value={formatMoney(metrics?.warrantyExposure ?? 0)}
              hint="Rework inside a warranty we gave"
              higherIsBetter={false}
              icon={<ShieldAlert className="h-4 w-4" />}
              isLoading={loading}
            />
          </div>

          <section aria-labelledby="fleet-heading" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="fleet-heading" className="text-base font-semibold text-white">
                Fleet
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className={`${inputClass} w-56`}
                  placeholder="Unit number, serial or contract"
                  aria-label="Search units"
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                />
                <select
                  className={`${inputClass} w-40`}
                  aria-label="Filter by status"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as AssetStatus | "")}
                >
                  <option value="">All statuses</option>
                  {ASSET_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {ASSET_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <DataTable
              columns={assetColumns}
              rows={assets}
              rowKey={(row) => row.id}
              isLoading={loading}
              onRowClick={(row) => openAsset(row.id)}
              rowActionLabel={(row) => `Open unit ${row.assetCode}`}
              empty={{
                title: "No units on the register",
                description:
                  "Register the units you maintain — a job card needs a unit to hang off, and a unit is what a contract holder renews.",
              }}
            />
          </section>

          <section aria-labelledby="jobs-heading" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="jobs-heading" className="text-base font-semibold text-white">
                Job cards
              </h2>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={comebacksOnly}
                  onChange={(event) => setComebacksOnly(event.target.checked)}
                />
                Repeat failures only
              </label>
            </div>

            <DataTable
              columns={jobColumns}
              rows={jobs}
              rowKey={(row) => row.id}
              isLoading={loading}
              onRowClick={(row) => setSelectedJob(row)}
              rowActionLabel={(row) => `Open job ${row.jobNumber}`}
              empty={{
                title: "No job cards yet",
                description:
                  "Raise one against a unit. The card is the record the next technician reads, and the evidence a comeback is judged on.",
              }}
            />
          </section>
        </>
      )}

      {selectedAssetId ? (
        <Modal title="Unit history" onClose={() => setSelectedAssetId(null)} wide>
          {historyError ? (
            <ErrorState error={historyError} onRetry={() => openAsset(selectedAssetId)} />
          ) : !history ? (
            <p className="text-sm text-slate-400">Loading the unit’s history…</p>
          ) : (
            <AssetDetail history={history} onClose={() => setSelectedAssetId(null)} onRaise={() => setRaising(true)} />
          )}
        </Modal>
      ) : null}

      {registering ? (
        <Modal title="Register a unit" onClose={() => setRegistering(false)}>
          <RegisterAssetForm
            busy={busy}
            error={formError}
            onCancel={() => setRegistering(false)}
            onSubmit={async (payload) => {
              setBusy(true);
              setFormError(null);
              try {
                await createAsset(payload);
                setRegistering(false);
                refresh();
              } catch (err: unknown) {
                setFormError(actionErrorMessage(err) ?? "Could not register the unit.");
              } finally {
                setBusy(false);
              }
            }}
          />
        </Modal>
      ) : null}

      {raising ? (
        <Modal title="Raise a job card" onClose={() => setRaising(false)}>
          <RaiseJobForm
            assets={assets}
            busy={busy}
            error={formError}
            onCancel={() => setRaising(false)}
            onSubmit={async (payload) => {
              setBusy(true);
              setFormError(null);
              try {
                await createJob(payload);
                setRaising(false);
                refresh();
              } catch (err: unknown) {
                setFormError(actionErrorMessage(err) ?? "Could not raise the card.");
              } finally {
                setBusy(false);
              }
            }}
          />
        </Modal>
      ) : null}

      {selectedJob ? (
        <Modal title={`Job ${selectedJob.jobNumber}`} onClose={() => setSelectedJob(null)} wide>
          <JobDetail
            job={selectedJob}
            busy={busy}
            error={formError}
            onClose={() => setSelectedJob(null)}
            onChanged={() => {
              setSelectedJob(null);
              refresh();
            }}
            onError={setFormError}
            setBusy={setBusy}
          />
        </Modal>
      ) : null}
    </div>
  );
}

// ── Asset detail ────────────────────────────────────────────────────────────

function AssetDetail({
  history,
  onClose,
  onRaise,
}: {
  history: AssetHistory;
  onClose: () => void;
  onRaise: () => void;
}) {
  const { asset, availability, costs, meter, faultPattern, comebacks, lastJobWarranty } = history;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-white">{asset.assetCode}</div>
          <div className="text-sm text-slate-400">
            {asset.name ?? ASSET_CLASS_LABELS[asset.assetClass]}
            {asset.custodian ? ` · ${asset.custodian}` : ""}
            {asset.site ? ` · ${asset.site}` : ""}
          </div>
        </div>
        <StatusBadge tone={assetStatusTone(asset.status)}>{ASSET_STATUS_LABELS[asset.status]}</StatusBadge>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="Availability" value={formatPercent(availability.percent)} hint={`over ${history.windowDays} days`} />
        <Metric label="Downtime" value={formatDuration(availability.downtimeMinutes)} hint="unplanned, this window" />
        <Metric label="Cost" value={formatMoney(costs.total)} hint={`${costs.rows} cost lines`} />
        <Metric
          label={meter.type === "HOURS" ? "Cost / hour" : "Cost / km"}
          value={meter.costPerUnit === null ? "—" : formatMoney(meter.costPerUnit)}
          hint={
            meter.advanced === null
              ? "no meter readings in window"
              : meter.advanced === 0
                ? "meter did not move in window"
                : `${formatMeter(meter.advanced, meter.type)} in window`
          }
        />
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="text-xs uppercase tracking-wide text-slate-400">Last job warranty</div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <StatusBadge tone={warrantyTone(lastJobWarranty?.position ?? "UNKNOWN")}>
            {warrantyText(lastJobWarranty?.position ?? "UNKNOWN", lastJobWarranty?.expiresAt ?? null)}
          </StatusBadge>
          {lastJobWarranty ? (
            <span className="text-xs text-slate-400">
              {lastJobWarranty.jobNumber}
              {lastJobWarranty.termDays ? ` · ${lastJobWarranty.termDays} days` : ""}
            </span>
          ) : (
            <span className="text-xs text-slate-400">No completed work on this unit yet.</span>
          )}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-white">Fault pattern</h3>
        {faultPattern.length === 0 ? (
          <p className="text-sm text-slate-400">No coded faults yet. Coded faults are what make a pattern visible.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2">Fault</th>
                  <th className="px-3 py-2">Times</th>
                  <th className="px-3 py-2">Comebacks</th>
                  <th className="px-3 py-2">Downtime</th>
                  <th className="px-3 py-2">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {faultPattern.map((row) => (
                  <tr key={row.faultCodeId} className="border-t border-white/5">
                    <td className="px-3 py-2 text-slate-200">
                      {row.faultCode ? `${row.faultCode.code} — ${row.faultCode.label}` : row.faultCodeId}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-300">{row.occurrences}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-300">{row.comebacks}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-300">{formatDuration(row.totalDowntimeMinutes)}</td>
                    <td className="px-3 py-2 text-slate-400">{formatDate(row.lastReportedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-white">
          Job cards
          {comebacks.sharePercent !== null ? (
            <span className="ml-2 text-xs font-normal text-slate-400">
              {comebacks.count} of {history.jobs.filter((job) => job.status !== "CANCELLED").length} are repeats
              ({comebacks.sharePercent}%)
            </span>
          ) : null}
        </h3>
        <ul className="space-y-2">
          {history.jobs.slice(0, 20).map((job) => {
            const position = warrantyPositionOf(job);
            return (
              <li key={job.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-100">
                      {job.jobNumber} · {JOB_TYPE_LABELS[job.type]}
                    </div>
                    <div className="truncate text-xs text-slate-400">{job.faultDescription}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {job.priorJobId ? (
                      <Badge variant="outline" className="border-amber-400/40 text-amber-300">
                        Comeback
                      </Badge>
                    ) : null}
                    <StatusBadge tone={jobStatusTone(job.status)}>{JOB_STATUS_LABELS[job.status]}</StatusBadge>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                  <span>Reported {formatDate(job.reportedAt)}</span>
                  {job.completedAt ? <span>Completed {formatDate(job.completedAt)}</span> : null}
                  {job.downtimeMinutes !== null ? <span>{formatDuration(job.downtimeMinutes)} down</span> : null}
                  <span>{formatMoney(jobCostTotal(job), job.currency)}</span>
                  <span>{warrantyText(position, job.warrantyExpiresAt)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" className={secondaryButton} onClick={onClose}>
          Close
        </button>
        <button type="button" className={primaryButton} onClick={onRaise}>
          <Plus className="h-4 w-4" /> Raise job card
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-white">{value}</div>
      <div className="text-xs text-slate-400">{hint}</div>
    </div>
  );
}

// ── Forms ───────────────────────────────────────────────────────────────────

function RegisterAssetForm({
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const [assetCode, setAssetCode] = useState("");
  const [name, setName] = useState("");
  const [assetClass, setAssetClass] = useState<string>("REACH_STACKER");
  const [custodian, setCustodian] = useState("");
  const [site, setSite] = useState("");
  const [meterType, setMeterType] = useState<"HOURS" | "KM">("HOURS");
  const [meterReading, setMeterReading] = useState("");

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          assetCode,
          name: name || undefined,
          assetClass,
          custodian: custodian || undefined,
          site: site || undefined,
          meterType,
          meterReading: meterReading === "" ? undefined : Number(meterReading),
        });
      }}
    >
      <div>
        <label className={labelClass} htmlFor="asset-code">
          Unit number
        </label>
        <input
          id="asset-code"
          className={inputClass}
          value={assetCode}
          onChange={(event) => setAssetCode(event.target.value)}
          placeholder="RS-014"
          required
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="asset-name">
          Description
        </label>
        <input
          id="asset-name"
          className={inputClass}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Reach stacker 14"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="asset-class">
            Class
          </label>
          <select id="asset-class" className={inputClass} value={assetClass} onChange={(e) => setAssetClass(e.target.value)}>
            {ASSET_CLASSES.map((value) => (
              <option key={value} value={value}>
                {ASSET_CLASS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="asset-custodian">
            Contract / custodian
          </label>
          <input
            id="asset-custodian"
            className={inputClass}
            value={custodian}
            onChange={(event) => setCustodian(event.target.value)}
            placeholder="Whose work the unit serves"
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass} htmlFor="asset-site">
            Site
          </label>
          <input id="asset-site" className={inputClass} value={site} onChange={(e) => setSite(e.target.value)} />
        </div>
        <div>
          <label className={labelClass} htmlFor="asset-meter-type">
            Meter
          </label>
          <select
            id="asset-meter-type"
            className={inputClass}
            value={meterType}
            onChange={(event) => setMeterType(event.target.value as "HOURS" | "KM")}
          >
            <option value="HOURS">Hours</option>
            <option value="KM">Kilometres</option>
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="asset-meter-reading">
            Opening reading
          </label>
          <input
            id="asset-meter-reading"
            className={inputClass}
            inputMode="decimal"
            value={meterReading}
            onChange={(event) => setMeterReading(event.target.value)}
            placeholder="Optional"
          />
        </div>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className={secondaryButton} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={primaryButton} disabled={busy || !assetCode.trim()}>
          {busy ? "Saving…" : "Register unit"}
        </button>
      </div>
    </form>
  );
}

function RaiseJobForm({
  assets,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  assets: MaintenanceAsset[];
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const [assetId, setAssetId] = useState(assets[0]?.id ?? "");
  const [type, setType] = useState<MaintenanceJobType>("BREAKDOWN");
  const [faultDescription, setFaultDescription] = useState("");
  const [meterAtJob, setMeterAtJob] = useState("");

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          assetId,
          type,
          faultDescription,
          meterAtJob: meterAtJob === "" ? undefined : Number(meterAtJob),
        });
      }}
    >
      <div>
        <label className={labelClass} htmlFor="job-asset">
          Unit
        </label>
        <select id="job-asset" className={inputClass} value={assetId} onChange={(event) => setAssetId(event.target.value)}>
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.assetCode}
              {asset.name ? ` — ${asset.name}` : ""}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor="job-type">
          Type
        </label>
        <select
          id="job-type"
          className={inputClass}
          value={type}
          onChange={(event) => setType(event.target.value as MaintenanceJobType)}
        >
          {JOB_TYPES.map((value) => (
            <option key={value} value={value}>
              {JOB_TYPE_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor="job-fault">
          What was seen
        </label>
        <textarea
          id="job-fault"
          className={textareaClass}
          rows={3}
          value={faultDescription}
          onChange={(event) => setFaultDescription(event.target.value)}
          placeholder="Hydraulic oil leaking at the boom cylinder"
          required
          minLength={3}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="job-meter">
          Meter reading now
        </label>
        <input
          id="job-meter"
          className={inputClass}
          inputMode="decimal"
          value={meterAtJob}
          onChange={(event) => setMeterAtJob(event.target.value)}
          placeholder="Optional — hours or kilometres"
        />
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className={secondaryButton} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={primaryButton} disabled={busy || !assetId || faultDescription.trim().length < 3}>
          {busy ? "Saving…" : "Raise card"}
        </button>
      </div>
    </form>
  );
}

// ── Job detail ──────────────────────────────────────────────────────────────

function JobDetail({
  job,
  busy,
  error,
  onClose,
  onChanged,
  onError,
  setBusy,
}: {
  job: MaintenanceJob;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onChanged: () => void;
  onError: (message: string | null) => void;
  setBusy: (value: boolean) => void;
}) {
  const actions = allowedJobActions(job.status);
  const [panel, setPanel] = useState<"none" | "complete" | "signoff" | "cancel" | "cost">("none");
  const [events, setEvents] = useState<MaintenanceJobEvent[] | null>(job.events ?? null);
  const [workPerformed, setWorkPerformed] = useState("");
  const [warrantyTermDays, setWarrantyTermDays] = useState("");
  const [labourHours, setLabourHours] = useState("");
  const [signedOffBy, setSignedOffBy] = useState("");
  const [reason, setReason] = useState("");
  const [costKind, setCostKind] = useState<CostKind>("PART");
  const [costDescription, setCostDescription] = useState("");
  const [costQuantity, setCostQuantity] = useState("1");
  const [costUnitCost, setCostUnitCost] = useState("");

  // The card's history is the record. It is fetched rather than inferred from
  // timestamps, because the events say *what happened and who did it*, which is
  // the part a dispute turns on.
  useEffect(() => {
    let cancelled = false;
    fetchJob(job.id)
      .then((detail) => {
        if (!cancelled) setEvents(detail.events ?? []);
      })
      .catch(() => {
        // A failed history load must not hide the card itself.
        if (!cancelled) setEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [job.id]);

  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    onError(null);
    try {
      await fn();
      onChanged();
    } catch (err: unknown) {
      onError(actionErrorMessage(err) ?? fallback);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm text-slate-400">
            {job.asset?.assetCode ?? "—"} · {JOB_TYPE_LABELS[job.type]} · reported {formatDateTime(job.reportedAt)}
          </div>
          <p className="mt-1 text-sm text-slate-200">{job.faultDescription}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge tone={jobStatusTone(job.status)}>{JOB_STATUS_LABELS[job.status]}</StatusBadge>
          {job.priorJobId ? (
            <Badge variant="outline" className="border-amber-400/40 text-amber-300">
              Comeback of {job.priorJob?.jobNumber ?? "an earlier card"}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="Downtime" value={formatDuration(job.downtimeMinutes)} hint="from the card's timestamps" />
        <Metric label="Cost" value={formatMoney(jobCostTotal(job), job.currency)} hint={`${job.costs?.length ?? 0} lines`} />
        <Metric
          label="Warranty"
          value={warrantyText(
            warrantyPositionOf(job),
            job.warrantyExpiresAt,
          )}
          hint={job.warrantyTermDays ? `${job.warrantyTermDays} days` : "term not recorded"}
        />
        <Metric label="Meter" value={job.meterAtJob === null ? "—" : String(job.meterAtJob)} hint="at the job" />
      </div>

      {job.workPerformed ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400">Work performed</div>
          <p className="mt-1 text-sm text-slate-200">{job.workPerformed}</p>
        </div>
      ) : null}

      {job.cancelledReason ? (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
          Cancelled: {job.cancelledReason}
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        {actions.start ? (
          <button
            type="button"
            className={secondaryButton}
            disabled={busy}
            onClick={() => run(() => startJob(job.id), "Could not start the job.")}
          >
            Start work
          </button>
        ) : null}
        {actions.complete ? (
          <button type="button" className={primaryButton} onClick={() => setPanel("complete")}>
            Complete job
          </button>
        ) : null}
        {actions.signOff ? (
          <button type="button" className={primaryButton} onClick={() => setPanel("signoff")}>
            Sign off
          </button>
        ) : null}
        {actions.addCost ? (
          <button type="button" className={secondaryButton} onClick={() => setPanel("cost")}>
            Add cost
          </button>
        ) : null}
        {actions.cancel ? (
          <button type="button" className={secondaryButton} onClick={() => setPanel("cancel")}>
            Cancel card
          </button>
        ) : null}
        <button type="button" className={secondaryButton} onClick={onClose}>
          Close
        </button>
      </div>

      {panel === "complete" ? (
        <form
          className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            run(
              () =>
                completeJob(job.id, {
                  workPerformed,
                  labourHours: labourHours === "" ? undefined : Number(labourHours),
                  warrantyTermDays: warrantyTermDays === "" ? undefined : Number(warrantyTermDays),
                }),
              "Could not complete the job.",
            );
          }}
        >
          <div>
            <label className={labelClass} htmlFor="complete-work">
              What was done
            </label>
            <textarea
              id="complete-work"
              className={textareaClass}
              rows={2}
              value={workPerformed}
              onChange={(event) => setWorkPerformed(event.target.value)}
              required
              minLength={3}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="complete-warranty">
                Warranty (days)
              </label>
              <input
                id="complete-warranty"
                className={inputClass}
                inputMode="numeric"
                value={warrantyTermDays}
                onChange={(event) => setWarrantyTermDays(event.target.value)}
                placeholder="Blank = not recorded"
              />
              <p className="mt-1 text-xs text-slate-500">
                A number of days, or blank. “Lifetime” is refused — the record has to be able to price it.
              </p>
            </div>
            <div>
              <label className={labelClass} htmlFor="complete-labour">
                Labour hours
              </label>
              <input
                id="complete-labour"
                className={inputClass}
                inputMode="decimal"
                value={labourHours}
                onChange={(event) => setLabourHours(event.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className={secondaryButton} onClick={() => setPanel("none")}>
              Back
            </button>
            <button type="submit" className={primaryButton} disabled={busy || workPerformed.trim().length < 3}>
              {busy ? "Saving…" : "Complete"}
            </button>
          </div>
        </form>
      ) : null}

      {panel === "signoff" ? (
        <form
          className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => signOffJob(job.id, signedOffBy), "Could not sign off.");
          }}
        >
          <div>
            <label className={labelClass} htmlFor="signoff-by">
              Who accepted the work?
            </label>
            <input
              id="signoff-by"
              className={inputClass}
              value={signedOffBy}
              onChange={(event) => setSignedOffBy(event.target.value)}
              placeholder="The custodian’s representative"
              required
              minLength={2}
            />
            <p className="mt-1 text-xs text-slate-500">
              Sign-off is the custodian’s acceptance, not ours. It is terminal: a disputed job gets a new card, not an
              edit.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className={secondaryButton} onClick={() => setPanel("none")}>
              Back
            </button>
            <button type="submit" className={primaryButton} disabled={busy || signedOffBy.trim().length < 2}>
              {busy ? "Saving…" : "Sign off"}
            </button>
          </div>
        </form>
      ) : null}

      {panel === "cancel" ? (
        <form
          className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => cancelJob(job.id, reason), "Could not cancel the card.");
          }}
        >
          <div>
            <label className={labelClass} htmlFor="cancel-reason">
              Why is this card being cancelled?
            </label>
            <textarea
              id="cancel-reason"
              className={textareaClass}
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              minLength={3}
            />
            <p className="mt-1 text-xs text-slate-500">
              There is no delete — the card stays, with this reason on it.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className={secondaryButton} onClick={() => setPanel("none")}>
              Back
            </button>
            <button type="submit" className={primaryButton} disabled={busy || reason.trim().length < 3}>
              Cancel card
            </button>
          </div>
        </form>
      ) : null}

      {panel === "cost" ? (
        <form
          className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            run(
              () =>
                addJobCost(job.id, {
                  kind: costKind,
                  description: costDescription,
                  quantity: Number(costQuantity || "1"),
                  unitCost: Number(costUnitCost),
                }),
              "Could not add the cost.",
            );
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="cost-kind">
                Kind
              </label>
              <select
                id="cost-kind"
                className={inputClass}
                value={costKind}
                onChange={(event) => setCostKind(event.target.value as CostKind)}
              >
                {COST_KINDS.map((value) => (
                  <option key={value} value={value}>
                    {COST_KIND_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="cost-description">
                Description
              </label>
              <input
                id="cost-description"
                className={inputClass}
                value={costDescription}
                onChange={(event) => setCostDescription(event.target.value)}
                required
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="cost-quantity">
                Quantity
              </label>
              <input
                id="cost-quantity"
                className={inputClass}
                inputMode="decimal"
                value={costQuantity}
                onChange={(event) => setCostQuantity(event.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="cost-unit">
                Unit cost
              </label>
              <input
                id="cost-unit"
                className={inputClass}
                inputMode="decimal"
                value={costUnitCost}
                onChange={(event) => setCostUnitCost(event.target.value)}
                required
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className={secondaryButton} onClick={() => setPanel("none")}>
              Back
            </button>
            <button
              type="submit"
              className={primaryButton}
              disabled={busy || !costDescription.trim() || costUnitCost === ""}
            >
              Add cost
            </button>
          </div>
        </form>
      ) : null}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-white">History</h3>
        {events === null ? (
          <p className="text-xs text-slate-400">Loading the card's history…</p>
        ) : events.length === 0 ? (
          <p className="text-xs text-slate-400">
            Reported {formatDateTime(job.reportedAt)}
            {job.completedAt ? ` · completed ${formatDateTime(job.completedAt)}` : ""}
            {job.signedOffAt ? ` · signed off by ${job.signedOffBy} on ${formatDate(job.signedOffAt)}` : ""}
          </p>
        ) : (
          <ol className="space-y-1">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-baseline gap-x-2 text-xs text-slate-400">
                <span className="tabular-nums text-slate-500">{formatDateTime(event.createdAt)}</span>
                <span className="text-slate-200">{event.description}</span>
                {event.actorName ? <span className="text-slate-500">— {event.actorName}</span> : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
