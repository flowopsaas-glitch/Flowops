import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Ban, FileCheck2, RefreshCw, Search, ShieldCheck, Truck } from "lucide-react";
import {
  DataTable,
  ErrorState,
  PageHeader,
  StatCard,
  StatusBadge,
  type Column,
} from "@/components/patterns";
import { useAuth } from "../contexts/auth-context";
import {
  DOCUMENT_KEYS,
  DOCUMENT_LABELS,
  canManageHold,
  canRecordEvidence,
  dispatchableReason,
  documentStatus,
  fetchDriverCompliance,
  fetchFleetCompliance,
  policyNote,
  recordComplianceEvidence,
  serviceStatus,
  setComplianceHold,
  type ComplianceDriverRow,
  type CompliancePolicy,
  type EvidencePatch,
  type FleetComplianceReport,
} from "../lib/driverCompliance";

/**
 * Driver compliance — the operational surface over a policy that already exists.
 *
 * The backend decides who may be dispatched (`driver-compliance.policy.ts`, one
 * pure module used by dispatch, manual assignment, route creation and the driver
 * app). This page does not decide anything; it shows the decision and gives
 * operations the means to fix the evidence behind it.
 *
 * Three things it is careful about, because each is a way a compliance screen
 * becomes a liability of its own:
 *
 *  1. **"Dispatchable" is not "compliant".** With `DRIVER_REQUIRE_DOCUMENTS`
 *     off, a driver with no licence on file is dispatchable. The page shows that
 *     as "Allowed, but 1 document not on file", never as a clean pass.
 *  2. **A missing date is not an expiry.** "Not on file" is its own state.
 *  3. **The requirement switch is not ours to flip.** It is an environment
 *     setting on the server; the page reports readiness and never renders a
 *     toggle it cannot honour.
 */

const inputClass =
  "h-9 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400/50";
const labelClass = "mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400";
const primaryButton =
  "inline-flex items-center gap-2 rounded-xl bg-sky-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton =
  "inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50";
const dangerButton =
  "inline-flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50";

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "Available",
  ON_ROUTE: "On route",
  OFFLINE: "Offline",
};

function actionErrorMessage(err: unknown): string | null {
  const response = (err as { response?: { data?: { message?: unknown } } })?.response;
  const message = response?.data?.message;
  if (typeof message === "string" && message.trim()) return message;
  if (typeof (err as Error)?.message === "string" && (err as Error).message.trim()) {
    return (err as Error).message;
  }
  return null;
}

/** `YYYY-MM-DD` for an <input type="date">, or "" when there is no date. */
function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export default function DriverCompliancePage() {
  const { user } = useAuth();
  const role = user?.role;

  const [failure, setFailure] = useState<{ key: string; error: unknown } | null>(null);
  const [applied, setApplied] = useState<{ key: string; report: FleetComplianceReport } | null>(null);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /**
   * Loading is derived from the query key rather than toggled by hand, so a
   * response for a filter the user has already moved off can never be shown.
   */
  const queryKey = useMemo(
    () => JSON.stringify({ status, onlyProblems, reloadToken }),
    [status, onlyProblems, reloadToken],
  );

  useEffect(() => {
    let cancelled = false;
    const key = queryKey;
    fetchFleetCompliance({ status: status || undefined, onlyProblems })
      .then((next) => {
        if (cancelled) return;
        setApplied({ key, report: next });
      })
      .catch((err: unknown) => {
        if (!cancelled) setFailure({ key, error: err });
      });
    return () => {
      cancelled = true;
    };
  }, [queryKey, status, onlyProblems]);

  const isLoading = applied?.key !== queryKey && failure?.key !== queryKey;
  const error = failure?.key === queryKey ? failure.error : null;
  // Strictly key-derived: the summary is filter-dependent, so showing the
  // previous filter's totals while the new ones load would misreport the fleet.
  const current = applied?.key === queryKey ? applied.report : null;
  const readyToRequireDocuments = Boolean(current?.readyToRequireDocuments);
  const policy: CompliancePolicy = current?.policy ?? { requireDocuments: false, warningWindowDays: 14, availableStatuses: [] };
  const summary = current?.summary;

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  const rows = useMemo(() => {
    const all = current?.drivers ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return all;
    return all.filter((row) => {
      const haystack = [row.name ?? "", row.driverId, row.status, ...row.blockerCodes].join(" ").toLowerCase();
      return haystack.includes(term);
    });
  }, [current, search]);

  const columns = useMemo<Column<ComplianceDriverRow>[]>(
    () => [
      {
        id: "driver",
        header: "Driver",
        cell: (row) => (
          <div className="min-w-0">
            <div className="font-medium text-slate-100">{row.name ?? "Unnamed driver"}</div>
            <div className="text-xs text-slate-500">
              {STATUS_LABELS[row.status] ?? row.status}
              {row.isActive ? "" : " · inactive"}
            </div>
          </div>
        ),
        sortable: true,
        sortValue: (row) => row.name ?? row.driverId,
      },
      {
        id: "decision",
        header: "Dispatch decision",
        cell: (row) => (
          <div className="space-y-1">
            <StatusBadge tone={row.dispatchable ? (row.unverifiedDocuments.length && !policy.requireDocuments ? "warning" : "success") : "danger"}>
              {row.dispatchable ? "Dispatchable" : "Blocked"}
            </StatusBadge>
            <div className="max-w-[22rem] text-xs text-slate-400">
              {dispatchableReason(row, policy.requireDocuments)}
            </div>
          </div>
        ),
      },
      {
        id: "documents",
        header: "Documents",
        cell: (row) => {
          const missing = row.unverifiedDocuments.length;
          return (
            <div className="space-y-1">
              <div className="text-slate-200">{3 - missing} of 3 on file</div>
              {missing > 0 ? (
                <div className="text-xs text-amber-300">
                  {row.unverifiedDocuments.map((field) => DOCUMENT_LABELS[field] ?? field).join(", ")}
                </div>
              ) : null}
            </div>
          );
        },
        responsiveClassName: "hidden md:table-cell",
      },
      {
        id: "service",
        header: "Service",
        cell: (row) => {
          const service = serviceStatus(row.service);
          return (
            <span
              className={
                service.state === "overdue"
                  ? "text-red-300"
                  : service.state === "due"
                    ? "text-amber-300"
                    : service.state === "unknown"
                      ? "text-slate-500"
                      : "text-slate-300"
              }
            >
              {service.label}
            </span>
          );
        },
        responsiveClassName: "hidden lg:table-cell",
      },
      {
        id: "hold",
        header: "Hold",
        cell: (row) =>
          row.complianceHold ? (
            <span className="text-red-300">On hold</span>
          ) : (
            <span className="text-slate-500">—</span>
          ),
        responsiveClassName: "hidden sm:table-cell",
      },
    ],
    [policy.requireDocuments],
  );

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Driver compliance"
        description="Who may be dispatched right now, and the evidence behind each decision. Compliance is enforced on every path that puts a driver on a parcel."
        actions={
          <>
            <button type="button" onClick={refresh} className={secondaryButton} disabled={isLoading}>
              <RefreshCw className={isLoading ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
              Refresh
            </button>
          </>
        }
      />

      <div
        className={`rounded-2xl border p-3 text-sm ${
          policy.requireDocuments
            ? "border-emerald-400/20 bg-emerald-500/5 text-emerald-100"
            : readyToRequireDocuments
              ? "border-sky-400/20 bg-sky-500/5 text-sky-100"
              : "border-amber-400/20 bg-amber-500/5 text-amber-100"
        }`}
        data-testid="policy-note"
      >
        <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide opacity-80">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Policy
        </div>
        {summary ? policyNote(policy, summary, readyToRequireDocuments) : "Reading the compliance policy…"}
        <div className="mt-1 text-xs opacity-70">
          Warning window: {policy.warningWindowDays} day{policy.warningWindowDays === 1 ? "" : "s"} before expiry.
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Dispatchable"
          value={summary ? String(summary.dispatchable) : "—"}
          hint={summary ? `of ${summary.drivers} drivers` : undefined}
          icon={<Truck className="h-4 w-4" aria-hidden="true" />}
          isLoading={isLoading && !summary}
        />
        <StatCard
          label="Blocked"
          value={summary ? String(summary.blocked) : "—"}
          hint="Cannot be put on a parcel"
          icon={<Ban className="h-4 w-4" aria-hidden="true" />}
          higherIsBetter={false}
          isLoading={isLoading && !summary}
        />
        <StatCard
          label="Missing documents"
          value={summary ? String(summary.undocumented) : "—"}
          hint="At least one of licence, insurance, background check"
          icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
          higherIsBetter={false}
          isLoading={isLoading && !summary}
        />
        <StatCard
          label="Document coverage"
          value={summary?.documentCoveragePercentage == null ? "—" : `${summary.documentCoveragePercentage}%`}
          hint="Drivers with all three documents on file"
          icon={<FileCheck2 className="h-4 w-4" aria-hidden="true" />}
          isLoading={isLoading && !summary}
        />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <div className="min-w-[220px] flex-1">
          <label className={labelClass} htmlFor="compliance-search">
            Search
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            <input
              id="compliance-search"
              className={`${inputClass} pl-9`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Driver name, status or blocker code"
            />
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="compliance-status">
            Driver status
          </label>
          <select
            id="compliance-status"
            className={inputClass}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="ON_ROUTE">On route</option>
            <option value="OFFLINE">Offline</option>
          </select>
        </div>
        <label className="flex h-9 items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-white/20 bg-white/5"
            checked={onlyProblems}
            onChange={(event) => setOnlyProblems(event.target.checked)}
          />
          Only drivers with problems
        </label>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={refresh} title="Could not load the compliance report" />
      ) : (
        <DataTable
          label="Driver compliance"
          columns={columns}
          rows={rows}
          rowKey={(row) => row.driverId}
          isLoading={isLoading}
          onRowClick={(row) => setSelectedId(row.driverId)}
          rowActionLabel={(row) => `Open compliance for ${row.name ?? row.driverId}`}
          empty={{
            title: search ? "No drivers match that search" : onlyProblems ? "No drivers with problems" : "No drivers on this fleet",
            description: search
              ? "Try a different name, status or blocker code."
              : onlyProblems
                ? "Every driver on this fleet currently has no blocking condition."
                : "Drivers appear here once they are added to the fleet.",
          }}
        />
      )}

      {selectedId ? (
        <DriverComplianceDialog
          driverId={selectedId}
          role={role}
          onClose={() => setSelectedId(null)}
          onChanged={refresh}
        />
      ) : null}
    </div>
  );
}

// ── Detail ──────────────────────────────────────────────────────────────────

function DriverComplianceDialog({
  driverId,
  role,
  onClose,
  onChanged,
}: {
  driverId: string;
  role?: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchDriverCompliance>> | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [draft, setDraft] = useState<EvidencePatch>({});
  const [holdReason, setHoldReason] = useState("");
  const [showHold, setShowHold] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchDriverCompliance(driverId)
      .then((next) => {
        if (cancelled) return;
        setDetail(next);
        setLoaded(true);
        const snapshot = next.snapshot as Record<string, unknown>;
        setDraft({
          licenseExpiry: toDateInput(snapshot.licenseExpiry as string | null) || null,
          insuranceExpiry: toDateInput(snapshot.insuranceExpiry as string | null) || null,
          backgroundCheckExpiry: toDateInput(snapshot.backgroundCheckExpiry as string | null) || null,
          nextServiceDate: toDateInput(snapshot.nextServiceDate as string | null) || null,
          currentKm: (snapshot.currentKm as number | null) ?? null,
          nextServiceKm: (snapshot.nextServiceKm as number | null) ?? null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFailure(err);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [driverId]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setActionError(null);
    try {
      await fn();
      const fresh = await fetchDriverCompliance(driverId);
      setDetail(fresh);
      onChanged();
    } catch (err: unknown) {
      setActionError(actionErrorMessage(err) ?? "That change could not be saved.");
    } finally {
      setBusy(null);
    }
  };

  const saveEvidence = () => {
    // Send only what differs from what is on the server: a PATCH that re-sends
    // an unchanged date records an audit entry saying nothing changed.
    const snapshot = (detail?.snapshot ?? {}) as Record<string, unknown>;
    const patch: EvidencePatch = {};
    for (const key of DOCUMENT_KEYS) {
      const next = draft[key] ?? null;
      const before = toDateInput(snapshot[key] as string | null) || null;
      if (next !== before) patch[key] = next;
    }
    const nextServiceDate = draft.nextServiceDate ?? null;
    if (nextServiceDate !== (toDateInput(snapshot.nextServiceDate as string | null) || null)) {
      patch.nextServiceDate = nextServiceDate;
    }
    if ((draft.currentKm ?? null) !== ((snapshot.currentKm as number | null) ?? null)) {
      patch.currentKm = draft.currentKm ?? null;
    }
    if ((draft.nextServiceKm ?? null) !== ((snapshot.nextServiceKm as number | null) ?? null)) {
      patch.nextServiceKm = draft.nextServiceKm ?? null;
    }
    if (Object.keys(patch).length === 0) {
      setActionError("Nothing has changed.");
      return;
    }
    void run("evidence", () => recordComplianceEvidence(driverId, patch));
  };

  const canEvidence = canRecordEvidence(role);
  const canHold = canManageHold(role);
  const compliance = detail?.compliance;
  const policy = detail?.policy;
  const snapshot = (detail?.snapshot ?? {}) as Record<string, unknown>;

  return (
    <ModalShell title={String(snapshot.name ?? "Driver")} onClose={onClose}>
      {!loaded ? (
        <p className="text-sm text-slate-400">Loading compliance…</p>
      ) : failure ? (
        <ErrorState error={failure} title="Could not load this driver" />
      ) : !compliance || !policy ? null : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={compliance.dispatchable ? "success" : "danger"}>
              {compliance.dispatchable ? "Dispatchable" : "Blocked"}
            </StatusBadge>
            <span className="text-xs text-slate-400">
              {String(snapshot.status ?? "")} · checked {new Date(compliance.checkedAt).toLocaleString("en-ZA")}
            </span>
          </div>

          {compliance.blockers.length > 0 ? (
            <section aria-label="Blockers">
              <h3 className="mb-2 text-sm font-semibold text-red-200">Blocking this driver</h3>
              <ul className="space-y-1 text-sm text-red-100">
                {compliance.blockers.map((issue) => (
                  <li key={issue.code} className="flex gap-2">
                    <span className="font-mono text-xs text-red-300">{issue.code}</span>
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {compliance.warnings.length > 0 ? (
            <section aria-label="Warnings">
              <h3 className="mb-2 text-sm font-semibold text-amber-200">Warnings</h3>
              <ul className="space-y-1 text-sm text-amber-100">
                {compliance.warnings.map((issue) => (
                  <li key={issue.code} className="flex gap-2">
                    <span className="font-mono text-xs text-amber-300">{issue.code}</span>
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {compliance.blockers.length === 0 && compliance.warnings.length === 0 ? (
            <p className="text-sm text-slate-400">No blocking conditions and no warnings for this driver.</p>
          ) : null}

          <section aria-label="Documents">
            <h3 className="mb-2 text-sm font-semibold text-slate-200">Documents on file</h3>
            {policy.requireDocuments ? (
              <p className="mb-2 text-xs text-slate-400">
                Documents are required for dispatch on this account.
              </p>
            ) : (
              <p className="mb-2 text-xs text-amber-200">
                Documents are not required for dispatch yet — a missing date does not block this driver, but it is
                still missing.
              </p>
            )}
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              {DOCUMENT_KEYS.map((key) => {
                const state = documentStatus(
                  draft[key] ?? (snapshot[key] as string | null),
                  policy.warningWindowDays,
                );
                return (
                  <div key={key}>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">{DOCUMENT_LABELS[key]}</dt>
                    <dd
                      className={
                        state.state === "expired"
                          ? "text-red-300"
                          : state.state === "expiring"
                            ? "text-amber-300"
                            : state.state === "missing"
                              ? "text-slate-500"
                              : "text-slate-200"
                      }
                    >
                      {state.label}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>

          {snapshot.complianceHold ? (
            <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-red-300">On hold</div>
              {String(snapshot.complianceHoldReason ?? "No reason recorded")}
            </div>
          ) : null}

          {actionError ? (
            <div role="alert" className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              {actionError}
            </div>
          ) : null}

          {canEvidence ? (
            <form
              aria-label="Record evidence"
              className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
              onSubmit={(event) => {
                event.preventDefault();
                saveEvidence();
              }}
            >
              <h3 className="text-sm font-semibold text-slate-200">Record evidence</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {DOCUMENT_KEYS.map((key) => (
                  <div key={key}>
                    <label className={labelClass} htmlFor={`evidence-${key}`}>
                      {DOCUMENT_LABELS[key]} expiry
                    </label>
                    <input
                      id={`evidence-${key}`}
                      type="date"
                      className={inputClass}
                      value={draft[key] ?? ""}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, [key]: event.target.value || null }))
                      }
                    />
                  </div>
                ))}
                <div>
                  <label className={labelClass} htmlFor="evidence-service-date">
                    Next service date
                  </label>
                  <input
                    id="evidence-service-date"
                    type="date"
                    className={inputClass}
                    value={draft.nextServiceDate ?? ""}
                    onChange={(event) => setDraft((current) => ({ ...current, nextServiceDate: event.target.value || null }))}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="evidence-current-km">
                    Odometer now (km)
                  </label>
                  <input
                    id="evidence-current-km"
                    inputMode="numeric"
                    className={inputClass}
                    value={draft.currentKm ?? ""}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        currentKm: event.target.value === "" ? null : Number(event.target.value),
                      }))
                    }
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="evidence-next-km">
                    Next service at (km)
                  </label>
                  <input
                    id="evidence-next-km"
                    inputMode="numeric"
                    className={inputClass}
                    value={draft.nextServiceKm ?? ""}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        nextServiceKm: event.target.value === "" ? null : Number(event.target.value),
                      }))
                    }
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Clearing a date means &ldquo;not on file&rdquo; and is recorded as such — it is not the same as a valid
                document. Every change is audited with its before and after.
              </p>
              <button type="submit" className={primaryButton} disabled={busy === "evidence"}>
                {busy === "evidence" ? "Saving…" : "Save evidence"}
              </button>
            </form>
          ) : (
            <p className="text-xs text-slate-500">
              Your role can read this report but not change the evidence. Ask a manager or dispatcher to record it.
            </p>
          )}

          {canHold ? (
            <section aria-label="Compliance hold" className="space-y-2">
              {snapshot.complianceHold ? (
                <button
                  type="button"
                  className={secondaryButton}
                  disabled={busy === "hold"}
                  onClick={() => void run("hold", () => setComplianceHold(driverId, false))}
                >
                  {busy === "hold" ? "Lifting…" : "Lift compliance hold"}
                </button>
              ) : showHold ? (
                <form
                  className="space-y-2 rounded-xl border border-red-400/20 bg-red-500/5 p-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!holdReason.trim()) {
                      setActionError("A hold needs a reason — the next person on shift has to know why.");
                      return;
                    }
                    void run("hold", () => setComplianceHold(driverId, true, holdReason.trim()));
                  }}
                >
                  <label className={labelClass} htmlFor="hold-reason">
                    Why is this driver being held?
                  </label>
                  <input
                    id="hold-reason"
                    className={inputClass}
                    value={holdReason}
                    onChange={(event) => setHoldReason(event.target.value)}
                    placeholder="e.g. Licence suspended pending renewal"
                  />
                  <div className="flex gap-2">
                    <button type="submit" className={dangerButton} disabled={busy === "hold"}>
                      {busy === "hold" ? "Placing hold…" : "Place hold"}
                    </button>
                    <button type="button" className={secondaryButton} onClick={() => setShowHold(false)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button type="button" className={dangerButton} onClick={() => setShowHold(true)}>
                  Place compliance hold
                </button>
              )}
            </section>
          ) : null}
        </div>
      )}
    </ModalShell>
  );
}

// ── Shell ───────────────────────────────────────────────────────────────────

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
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
        className="w-full max-w-3xl rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl"
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
