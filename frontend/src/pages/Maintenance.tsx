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
import { useAuth } from "../contexts/auth-context";
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
  isMaintenanceAssetWriter,
  isMaintenanceJobWriter,
  isMaintenanceManager,
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
  commercialStuckText,
  jobCostTotal,
  varianceText,
  jobStatusTone,
  recordCommercial,
  repairVsWaitText,
  signOffJob,
  startJob,
  warrantyPositionOf,
  warrantyStandingText,
  warrantyText,
  warrantyTone,
  type AssetHistory,
  type AssetStatus,
  type ClassRollup,
  type CommercialChain,
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
  const { user } = useAuth();
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
            {isMaintenanceAssetWriter(user?.role) ? (
              <button type="button" className={secondaryButton} onClick={() => setRegistering(true)}>
                <Plus className="h-4 w-4" /> Register unit
              </button>
            ) : null}
            {isMaintenanceJobWriter(user?.role) ? (
              <button type="button" className={primaryButton} onClick={() => setRaising(true)}>
                <Wrench className="h-4 w-4" /> Raise job card
              </button>
            ) : null}
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

          <CommercialBand metrics={summary?.metrics ?? null} />

          <ClassBand rows={summary?.byClass ?? []} loading={loading} />

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
  const { asset, availability, costs, meter, faultPattern, comebacks, lastJobWarranty, warranty } = history;

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

      {/* The supplier's term on the machine, which is a different contract from
          the warranty on the last job. Both are shown because both decide who
          pays, and conflating them is how a claim gets made against the wrong
          one. */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="text-xs uppercase tracking-wide text-slate-400">
          Supplier warranty{asset.warrantySupplier ? ` · ${asset.warrantySupplier}` : ""}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <StatusBadge tone={warrantyTone(warranty?.state ?? "UNKNOWN")}>
            {warrantyStandingText(warranty)}
          </StatusBadge>
          {asset.warrantyTermDays ? (
            <span className="text-xs text-slate-400">
              {asset.warrantyTermDays} days from {formatDate(asset.warrantyStartAt ?? null)}
              {asset.warrantyServiceIntervalDays
                ? ` · serviced every ${asset.warrantyServiceIntervalDays} days to stay valid`
                : ""}
            </span>
          ) : (
            <span className="text-xs text-slate-400">
              No supplier term recorded — the platform will not guess one.
            </span>
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

/**
 * The fleet by class.
 *
 * A fleet-wide figure is the number that gets reported; the class is the number
 * that gets acted on. At 122 machines, "94% availability" is not a fact anyone
 * can do anything with — "straddle carriers at 88%, the rest at 99%" is a
 * conversation with a supplier.
 *
 * Each card carries the limit its own class is judged against, so the reader
 * can see when an outage will be called one, rather than discovering it.
 */
function ClassBand({ rows, loading }: { rows: ClassRollup[]; loading: boolean }) {
  if (loading && rows.length === 0) return null;
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="classes-heading" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="classes-heading" className="text-base font-semibold text-white">
          By class
        </h2>
        <p className="text-xs text-slate-400">Worst availability first — a class is what gets fixed.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((row) => {
          const below = row.availabilityPercent !== null && row.availabilityPercent < 95;
          return (
            <div
              key={row.assetClass}
              className={`rounded-2xl border p-4 ${
                below ? "border-amber-400/30 bg-amber-500/10" : "border-white/10 bg-white/5"
              }`}
              data-testid={`class-${row.assetClass}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-slate-200">{row.label}</span>
                <span className="text-xs text-slate-400">
                  {row.units} {row.units === 1 ? "unit" : "units"}
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums text-white">
                {formatPercent(row.availabilityPercent)}
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {row.unitsDown} down · {row.openJobs} open ·{" "}
                {row.longestDownHours === null ? "nothing out now" : `longest ${row.longestDownHours} h`}
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                {row.expectedRepairHours} h expected repair · flags past {row.longDownLimitHours} h
              </div>
            </div>
          );
        })}
      </div>
    </section>
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
  const [warrantySupplier, setWarrantySupplier] = useState("");
  const [warrantyStartAt, setWarrantyStartAt] = useState("");
  const [warrantyTermDays, setWarrantyTermDays] = useState("");
  const [warrantyServiceIntervalDays, setWarrantyServiceIntervalDays] = useState("");

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
          // Blank means "not recorded", never zero: the API stores the absence
          // and the warranty reads UNKNOWN rather than expired.
          warrantySupplier: warrantySupplier || undefined,
          warrantyStartAt: warrantyStartAt || undefined,
          warrantyTermDays: warrantyTermDays === "" ? undefined : Number(warrantyTermDays),
          warrantyServiceIntervalDays:
            warrantyServiceIntervalDays === "" ? undefined : Number(warrantyServiceIntervalDays),
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

      {/* Optional, and worth capturing at registration: a supplier term that
          nobody wrote down cannot be claimed against later, and the condition
          that keeps it alive is a fact about the contract, not the repair. */}
      <fieldset className="rounded-xl border border-white/10 bg-white/5 p-3">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-slate-400">
          Supplier warranty (optional)
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="asset-warranty-supplier">
              Supplier
            </label>
            <input
              id="asset-warranty-supplier"
              className={inputClass}
              value={warrantySupplier}
              onChange={(event) => setWarrantySupplier(event.target.value)}
              placeholder="Kalmar, Terex, whoever holds the contract"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="asset-warranty-start">
              Term starts
            </label>
            <input
              id="asset-warranty-start"
              type="date"
              className={inputClass}
              value={warrantyStartAt}
              onChange={(event) => setWarrantyStartAt(event.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="asset-warranty-term">
              Term (days)
            </label>
            <input
              id="asset-warranty-term"
              className={inputClass}
              inputMode="numeric"
              value={warrantyTermDays}
              onChange={(event) => setWarrantyTermDays(event.target.value)}
              placeholder="30 months = 913"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="asset-warranty-service">
              Serviced every (days)
            </label>
            <input
              id="asset-warranty-service"
              className={inputClass}
              inputMode="numeric"
              value={warrantyServiceIntervalDays}
              onChange={(event) => setWarrantyServiceIntervalDays(event.target.value)}
              placeholder="365 — an annual labour-only service"
            />
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          With an interval set, the unit reads “service overdue” instead of “in warranty” once a service is missed — a
          live term with a missed condition is the case that looks fine and is not.
        </p>
      </fieldset>

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

// ── The commercial chain ────────────────────────────────────────────────────

/**
 * Quoted → authorised → worked → invoiced → paid, with the gap between each.
 *
 * The gaps are the point. A timeline that shows five dates and no durations
 * tells you the job was slow but not who slowed it, which is exactly the
 * argument this strip exists to end.
 */
function ChainStrip({
  chain,
  anomalies,
}: {
  chain: CommercialChain | null | undefined;
  anomalies?: string[] | null;
}) {
  if (!chain) {
    return (
      <p className="text-sm text-slate-400">
        No commercial trail recorded. Quoting, the purchase order, the invoice and the payment are not on this card,
        so nothing here can say whether the delay was the repair or the permission.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <ol className="grid gap-2 sm:grid-cols-5" data-testid="commercial-chain">
        {chain.steps.map((step) => {
          const current = chain.nextStep === step.key;
          return (
            <li
              key={step.key}
              className={`rounded-xl border p-2 ${
                step.done
                  ? "border-white/10 bg-white/5"
                  : current
                    ? "border-amber-400/40 bg-amber-500/10"
                    : "border-white/5 bg-transparent"
              }`}
            >
              <div className="text-[11px] uppercase tracking-wide text-slate-400">{step.label}</div>
              <div className="mt-0.5 text-xs text-slate-200">
                {step.done ? formatDate(step.at) : current ? "waiting" : "—"}
              </div>
              {step.waitHours !== null ? (
                <div className="mt-1 text-[11px] text-slate-500">{formatWait(step.waitHours)} after previous</div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {anomalies && anomalies.length > 0 ? (
        <div
          className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-3"
          data-testid="commercial-anomalies"
        >
          <div className="text-xs uppercase tracking-wide text-amber-300">
            Dates recorded as given
          </div>
          <ul className="mt-1 space-y-1">
            {anomalies.map((note) => (
              <li key={note} className="text-xs text-amber-100/90">
                {note}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="text-xs uppercase tracking-wide text-slate-400">Where it stands</div>
        <p className="mt-1 text-sm text-slate-200" data-testid="commercial-stuck">
          {commercialStuckText(chain)}
        </p>
        <p className="mt-1 text-xs text-slate-400" data-testid="commercial-split">
          {repairVsWaitText(chain)}
        </p>
        {chain.quotedAmount !== null ? (
          <p className="mt-1 text-xs text-slate-400">
            Quoted {formatMoney(chain.quotedAmount)} · spent {formatMoney(chain.actualCost)} ·{" "}
            {varianceText(chain)}
          </p>
        ) : null}
        {chain.startedBeforeOrder ? (
          <p className="mt-2 text-xs text-amber-300">
            Work started before the purchase order arrived. That is the contractor carrying the risk, and it is worth
            knowing before the invoice is queried.
          </p>
        ) : null}
        {chain.workedWithoutOrder ? (
          <p className="mt-2 text-xs text-amber-300">
            Work is finished and no purchase order was recorded. There may be nobody who has agreed to pay for it.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function formatWait(hours: number): string {
  if (hours >= 48) {
    const days = Math.round((hours / 24) * 10) / 10;
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  const rounded = Math.round(hours);
  return `${rounded} ${rounded === 1 ? "hour" : "hours"}`;
}

/**
 * Recording a step.
 *
 * Prefilled with what the card already holds, and only the fields that changed
 * are sent. That is what makes clearing a box mean "withdraw this date" rather
 * than "I did not fill it in this time" — a distinction the API depends on and
 * a form has to earn.
 */
function CommercialPanel({
  job,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  job: MaintenanceJob;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const initial = {
    quotationAmount: job.quotationAmount === null ? "" : String(job.quotationAmount),
    quotationAt: job.quotationAt ? job.quotationAt.slice(0, 10) : "",
    purchaseOrderNumber: job.purchaseOrderNumber ?? "",
    purchaseOrderAt: job.purchaseOrderAt ? job.purchaseOrderAt.slice(0, 10) : "",
    invoicedAt: job.invoicedAt ? job.invoicedAt.slice(0, 10) : "",
    paidAt: job.paidAt ? job.paidAt.slice(0, 10) : "",
  };
  const [form, setForm] = useState(initial);
  const set = (key: keyof typeof initial) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const payload: Record<string, unknown> = {};
  for (const key of Object.keys(initial) as Array<keyof typeof initial>) {
    if (form[key] === initial[key]) continue;
    const value = form[key].trim();
    if (value === "") {
      payload[key] = null;
    } else if (key === "quotationAmount") {
      payload[key] = Number(value);
    } else {
      payload[key] = value;
    }
  }

  const rows: Array<{ key: keyof typeof initial; label: string; type: string; placeholder?: string }> = [
    { key: "quotationAmount", label: "Quoted amount", type: "number", placeholder: "42500" },
    { key: "quotationAt", label: "Quotation sent", type: "date" },
    { key: "purchaseOrderNumber", label: "Purchase order no.", type: "text", placeholder: "PO-2026-118423" },
    { key: "purchaseOrderAt", label: "Order arrived", type: "date" },
    { key: "invoicedAt", label: "Invoiced", type: "date" },
    { key: "paidAt", label: "Paid", type: "date" },
  ];

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (Object.keys(payload).length === 0) return;
        onSubmit(payload);
      }}
    >
      <p className="text-xs text-slate-400">
        Each date is the day it actually happened. The gap between the quotation and the order is the time the unit
        stood still waiting for permission — and it is the figure that decides whether a slow repair was the workshop
        or the paperwork.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.key}>
            <label className={labelClass} htmlFor={`commercial-${row.key}`}>
              {row.label}
            </label>
            <input
              id={`commercial-${row.key}`}
              className={inputClass}
              type={row.type}
              step={row.type === "number" ? "0.01" : undefined}
              value={form[row.key]}
              onChange={set(row.key)}
              placeholder={row.placeholder}
            />
          </div>
        ))}
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" className={secondaryButton} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={primaryButton} disabled={busy || Object.keys(payload).length === 0}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

/**
 * Money and authority, for the whole fleet.
 *
 * Deliberately separate from the availability tiles: availability is what the
 * workshop controls, and the authority wait is what it does not. Adding them
 * together would produce one number that blames the wrong department.
 */
function CommercialBand({ metrics }: { metrics: MaintenanceSummary["metrics"] | null }) {
  if (!metrics) return null;
  const tiles = [
    {
      label: "Waiting on a PO",
      value: String(metrics.awaitingOrder),
      hint: metrics.awaitingOrder === 0 ? "nothing quoted and stuck" : "cards quoted, not authorised",
    },
    {
      label: "Authority wait",
      value: metrics.authorityWaitHours === 0 ? "0 h" : formatWait(metrics.authorityWaitHours),
      hint: "quotation to purchase order, in window",
    },
    {
      label: "Not yet invoiced",
      value: formatMoney(metrics.unbilledExposure),
      hint: "work completed, claim not raised",
    },
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4" data-testid="commercial-band">
      <div className="text-xs uppercase tracking-wide text-slate-400">Money & authority</div>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.label}>
            <div className="text-[11px] text-slate-400">{tile.label}</div>
            <div className="text-lg font-semibold tabular-nums text-white">{tile.value}</div>
            <div className="text-[11px] text-slate-500">{tile.hint}</div>
          </div>
        ))}
      </div>
    </div>
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
  const { user } = useAuth();
  // Status says what is possible; the role says what *this* reader may do. The
  // server checks both, so the screen must too.
  const actions = allowedJobActions(job.status, user?.role);
  const manager = isMaintenanceManager(user?.role);
  const [panel, setPanel] = useState<"none" | "complete" | "signoff" | "cancel" | "cost" | "commercial">("none");
  const [events, setEvents] = useState<MaintenanceJobEvent[] | null>(job.events ?? null);
  // The fetched card carries the derived commercial chain; the row from the
  // list does not. Kept separate so a failed detail load still renders the card.
  const [chain, setChain] = useState<CommercialChain | null>(job.commercial ?? null);
  const [anomalies, setAnomalies] = useState<string[]>(job.anomalies ?? []);
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
        if (cancelled) return;
        setEvents(detail.events ?? []);
        setChain(detail.commercial ?? null);
        setAnomalies(detail.anomalies ?? []);
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

      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs uppercase tracking-wide text-slate-400">Quotation, authority and payment</div>
          {actions.recordCommercial ? (
            <button type="button" className={secondaryButton} onClick={() => setPanel("commercial")}>
              Record step
            </button>
          ) : null}
        </div>
        <ChainStrip chain={chain} anomalies={anomalies} />
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

      {!manager && job.status !== "CANCELLED" ? (
        <p className="text-xs text-slate-500">
          Completing, signing off, cancelling and the quotation and payment dates are manager actions. You can start
          work and add costs.
        </p>
      ) : null}

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

      {panel === "commercial" ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <CommercialPanel
            job={job}
            busy={busy}
            error={error}
            onCancel={() => setPanel("none")}
            onSubmit={(payload) =>
              run(async () => {
                const saved = await recordCommercial(job.id, payload);
                setChain(saved.commercial ?? null);
                setAnomalies(saved.anomalies ?? []);
              }, "Could not record that step.")
            }
          />
        </div>
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
