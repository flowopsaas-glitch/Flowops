import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Wallet,
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
  CLAIM_LIABILITY_LABELS,
  CLAIM_STATUS_LABELS,
  CLAIM_STATUSES,
  CLAIM_TYPES,
  CLAIM_TYPE_LABELS,
  addClaimEvidence,
  addClaimNote,
  allowedActions,
  amountAtStake,
  approvalProblem,
  assessClaim,
  approveClaim,
  claimStatusTone,
  createClaim,
  evidenceRefs,
  fetchClaim,
  fetchClaimSummary,
  fetchClaims,
  formatMoney,
  isOverdue,
  rejectClaim,
  settleClaim,
  withdrawClaim,
  type Claim,
  type ClaimLiability,
  type ClaimStatus,
  type ClaimSummary,
  type ClaimType,
  searchWaybills,
  type WaybillOption,
} from "../lib/claims";

/**
 * Claims & liability.
 *
 * What this page will not do:
 *
 *  - **Guess liability.** A claim whose liability is `UNASSESSED` says "not
 *    assessed". The platform does not default it to the carrier, because who
 *    carries a loss is a commercial position taken from trading terms or an
 *    insurer, not a field with a sensible default.
 *  - **Show a settlement as finished.** Settling raises a **DRAFT** credit note.
 *    The page says so, and names it, so nobody tells a client they have been
 *    credited when finance has not yet issued anything.
 *  - **Offer a delete.** There is no endpoint and no button: a claim is a
 *    record, and a rejected or settled one is a concluded record.
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

/** The message the API sent, when it sent one. Never a raw object on screen. */
function actionErrorMessage(err: unknown): string | null {
  const response = (err as { response?: { data?: { message?: unknown } } })?.response;
  const message = response?.data?.message;
  if (typeof message === "string" && message.trim()) return message;
  if (typeof (err as Error)?.message === "string" && (err as Error).message.trim()) {
    return (err as Error).message;
  }
  return null;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ClaimsPage() {
  const [summary, setSummary] = useState<ClaimSummary | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [result, setResult] = useState<{ key: string; rows: Claim[] } | null>(null);
  const [failure, setFailure] = useState<{ key: string; error: unknown } | null>(null);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ClaimStatus | "">("");
  const [type, setType] = useState<ClaimType | "">("");
  const [openOnly, setOpenOnly] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  /**
   * Loading is derived from the query key, not toggled by hand.
   *
   * That makes a stale response impossible to render: a result is only shown
   * when its key is the key currently on screen, and changing a filter puts the
   * page back into its loading state by definition rather than by bookkeeping.
   */
  const queryKey = useMemo(
    () => JSON.stringify({ q, status, type, openOnly, refreshTick }),
    [q, status, type, openOnly, refreshTick],
  );

  useEffect(() => {
    let cancelled = false;
    const key = queryKey;
    // Debounce keystrokes; the other filters can go immediately.
    const timer = setTimeout(() => {
      Promise.all([fetchClaims({ q, status, type, openOnly }), fetchClaimSummary()])
        .then(([list, totals]) => {
          if (cancelled) return;
          setResult({ key, rows: list });
          setSummary(totals);
          setFailure(null);
        })
        .catch((err: unknown) => {
          if (!cancelled) setFailure({ key, error: err });
        });
    }, q ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [queryKey, q, status, type, openOnly]);

  const isLoading = result?.key !== queryKey && failure?.key !== queryKey;
  const rows = result?.key === queryKey ? result.rows : [];
  const error = failure?.key === queryKey ? failure.error : null;

  const refresh = useCallback(() => setRefreshTick((tick) => tick + 1), []);

  const replaceClaim = useCallback((updated: Claim) => {
    setResult((current) =>
      current
        ? { ...current, rows: current.rows.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)) }
        : current,
    );
    setSelectedId(updated.id);
  }, []);

  const columns = useMemo<Column<Claim>[]>(
    () => [
      {
        id: "number",
        header: "Claim",
        cell: (claim) => (
          <div className="min-w-0">
            <div className="font-medium text-slate-100">{claim.number}</div>
            <div className="text-xs text-slate-400">{CLAIM_TYPE_LABELS[claim.type]}</div>
          </div>
        ),
        sortable: true,
        sortValue: (claim) => claim.number,
      },
      {
        id: "waybill",
        header: "Waybill",
        cell: (claim) => (
          <div className="min-w-0">
            <div className="text-slate-200">{claim.waybillNumber ?? "—"}</div>
            <div className="truncate text-xs text-slate-400">{claim.clientName ?? "Client not recorded"}</div>
          </div>
        ),
        responsiveClassName: "hidden md:table-cell",
      },
      {
        id: "status",
        header: "Status",
        cell: (claim) => (
          <div className="space-y-1">
            <StatusBadge tone={claimStatusTone(claim.status)}>{CLAIM_STATUS_LABELS[claim.status]}</StatusBadge>
            {isOverdue(claim) ? (
              <div className="text-xs text-amber-300">Response overdue</div>
            ) : null}
          </div>
        ),
      },
      {
        id: "liability",
        header: "Liability",
        cell: (claim) => (
          <span className={claim.liability === "UNASSESSED" ? "text-slate-500" : "text-slate-200"}>
            {CLAIM_LIABILITY_LABELS[claim.liability]}
          </span>
        ),
        responsiveClassName: "hidden lg:table-cell",
      },
      {
        id: "claimed",
        header: "Claimed",
        cell: (claim) => <span className="tabular-nums text-slate-200">{formatMoney(claim.claimedAmount, claim.currency)}</span>,
        sortable: true,
        sortValue: (claim) => claim.claimedAmount,
        className: "text-right",
        headerClassName: "text-right",
      },
      {
        id: "approved",
        header: "Approved",
        cell: (claim) =>
          claim.approvedAmount == null ? (
            <span className="text-slate-500">—</span>
          ) : (
            <span className="tabular-nums text-emerald-300">{formatMoney(claim.approvedAmount, claim.currency)}</span>
          ),
        className: "text-right",
        headerClassName: "text-right",
        responsiveClassName: "hidden sm:table-cell",
      },
      {
        id: "raised",
        header: "Raised",
        cell: (claim) => (
          <div className="min-w-0">
            <div className="text-slate-300">{formatDate(claim.createdAt)}</div>
            <div className="truncate text-xs text-slate-500">{claim.raisedByName ?? "Raised by an unrecorded user"}</div>
          </div>
        ),
        responsiveClassName: "hidden xl:table-cell",
      },
    ],
    [],
  );

  const hasFilters = Boolean(q || status || type || openOnly);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Claims & liability"
        description="Damage, loss, shortage, delay and theft claims per waybill. Settling a claim raises a draft credit note for finance to issue."
        actions={
          <>
            <button type="button" onClick={refresh} className={secondaryButton} disabled={isLoading}>
              <RefreshCw className={isLoading ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
              Refresh
            </button>
            <button type="button" onClick={() => setCreating(true)} className={primaryButton}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Raise a claim
            </button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open claims"
          value={summary ? String(summary.open) : "—"}
          hint={summary ? `${summary.total} raised in total` : undefined}
          icon={<ClipboardList className="h-4 w-4" aria-hidden="true" />}
          isLoading={isLoading && !summary}
        />
        <StatCard
          label="Value at stake"
          value={summary ? formatMoney(summary.claimedOpen) : "—"}
          hint="Claimed on claims still in play"
          icon={<Wallet className="h-4 w-4" aria-hidden="true" />}
          isLoading={isLoading && !summary}
        />
        <StatCard
          label="Approved, awaiting credit"
          value={summary ? formatMoney(summary.approvedPayable) : "—"}
          hint="Owed but not yet settled"
          icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
          isLoading={isLoading && !summary}
        />
        <StatCard
          label="Past response date"
          value={summary ? String(summary.overdue) : "—"}
          hint="Open claims whose respond-by date has passed"
          icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
          higherIsBetter={false}
          isLoading={isLoading && !summary}
        />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <div className="min-w-[220px] flex-1">
          <label className={labelClass} htmlFor="claim-search">
            Search
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            <input
              id="claim-search"
              className={`${inputClass} pl-9`}
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Claim number, waybill, client or summary"
            />
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="claim-status">
            Status
          </label>
          <select
            id="claim-status"
            className={inputClass}
            value={status}
            onChange={(event) => setStatus(event.target.value as ClaimStatus | "")}
          >
            <option value="">All statuses</option>
            {CLAIM_STATUSES.map((value) => (
              <option key={value} value={value}>
                {CLAIM_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="claim-type">
            Type
          </label>
          <select
            id="claim-type"
            className={inputClass}
            value={type}
            onChange={(event) => setType(event.target.value as ClaimType | "")}
          >
            <option value="">All types</option>
            {CLAIM_TYPES.map((value) => (
              <option key={value} value={value}>
                {CLAIM_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <label className="flex h-9 items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-white/20 bg-white/5"
            checked={openOnly}
            onChange={(event) => setOpenOnly(event.target.checked)}
          />
          Still open
        </label>
        {hasFilters ? (
          <button
            type="button"
            className={secondaryButton}
            onClick={() => {
              setQ("");
              setStatus("");
              setType("");
              setOpenOnly(false);
            }}
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={refresh} title="Could not load claims" />
      ) : (
        <DataTable
          label="Claims"
          columns={columns}
          rows={rows}
          rowKey={(claim) => claim.id}
          isLoading={isLoading}
          onRowClick={(claim) => setSelectedId(claim.id)}
          rowActionLabel={(claim) => `Open claim ${claim.number}`}
          empty={{
            title: hasFilters ? "No claims match those filters" : "No claims raised",
            description: hasFilters
              ? "Try a different status, type or search term."
              : "Damage, shortage or loss reported against a waybill is recorded here with its liability position.",
          }}
        />
      )}

      {selectedId ? (
        <ClaimDetailDialog
          claimId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={(updated) => {
            replaceClaim(updated);
            void fetchClaimSummary().then(setSummary).catch(() => undefined);
          }}
          onRemovedFromView={() => {
            setSelectedId(null);
            refresh();
          }}
        />
      ) : null}

      {creating ? (
        <CreateClaimDialog
          onClose={() => setCreating(false)}
          onCreated={(claim) => {
            setCreating(false);
            setResult((current) => (current ? { ...current, rows: [claim, ...current.rows] } : current));
            void fetchClaimSummary().then(setSummary).catch(() => undefined);
            setSelectedId(claim.id);
          }}
        />
      ) : null}
    </div>
  );
}

// ── Detail ──────────────────────────────────────────────────────────────────

interface ClaimDetailDialogProps {
  claimId: string;
  onClose: () => void;
  onChanged: (claim: Claim) => void;
  onRemovedFromView: () => void;
}

function ClaimDetailDialog({ claimId, onClose, onChanged, onRemovedFromView }: ClaimDetailDialogProps) {
  const [claim, setClaim] = useState<Claim | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [action, setAction] = useState<null | "assess" | "approve" | "reject" | "withdraw" | "settle" | "note" | "evidence">(null);

  useEffect(() => {
    let cancelled = false;
    fetchClaim(claimId)
      .then((detail) => {
        if (cancelled) return;
        setClaim(detail);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFailure(err);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [claimId]);

  const isLoading = !loaded;

  const run = async (label: string, fn: () => Promise<Claim>) => {
    setBusy(label);
    setActionError(null);
    try {
      const updated = await fn();
      setClaim(updated);
      onChanged(updated);
      setAction(null);
    } catch (err: unknown) {
      setActionError(actionErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const actions = claim ? allowedActions(claim.status) : null;
  const refs = claim ? evidenceRefs(claim) : [];

  return (
    <ModalShell title={claim ? `Claim ${claim.number}` : "Claim"} onClose={onClose} wide>
      {isLoading ? (
        <p className="text-sm text-slate-400">Loading claim…</p>
      ) : failure ? (
        <ErrorState error={failure} title="Could not load this claim" />
      ) : !claim ? null : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={claimStatusTone(claim.status)}>{CLAIM_STATUS_LABELS[claim.status]}</StatusBadge>
            <Badge variant="secondary">{CLAIM_TYPE_LABELS[claim.type]}</Badge>
            {isOverdue(claim) ? <Badge variant="destructive">Response overdue</Badge> : null}
          </div>

          <p className="text-sm text-slate-200">{claim.summary}</p>
          {claim.description ? <p className="whitespace-pre-wrap text-sm text-slate-400">{claim.description}</p> : null}

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Fact label="Waybill" value={claim.waybillNumber ?? "—"} />
            <Fact label="Client" value={claim.clientName ?? "Not recorded"} />
            <Fact label="Claimed" value={formatMoney(claim.claimedAmount, claim.currency)} />
            <Fact
              label="Approved"
              value={claim.approvedAmount == null ? "Not approved" : formatMoney(claim.approvedAmount, claim.currency)}
            />
            <Fact label="Incident" value={formatDate(claim.incidentAt)} />
            <Fact label="Respond by" value={formatDate(claim.respondBy)} />
            <Fact
              label="Liability"
              value={
                claim.liability === "UNASSESSED"
                  ? "Not assessed — nobody has decided who carries this loss"
                  : CLAIM_LIABILITY_LABELS[claim.liability]
              }
            />
            <Fact label="Basis" value={claim.liabilityBasis ?? "Not stated"} />
            <Fact
              label="Liability cap"
              value={claim.liabilityCap == null ? "No cap set" : formatMoney(claim.liabilityCap, claim.currency)}
            />
            <Fact label="Amount at stake" value={formatMoney(amountAtStake(claim), claim.currency)} />
          </dl>

          {claim.rejectionReason ? (
            <div className="rounded-xl border border-red-400/20 bg-red-500/5 p-3 text-sm text-red-200">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-red-300">Rejection reason</div>
              {claim.rejectionReason}
            </div>
          ) : null}

          {claim.status === "SETTLED" && claim.creditNoteNumber ? (
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-3 text-sm text-emerald-100">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-emerald-300">Settlement</div>
              Settled {formatDate(claim.settledAt)} against draft credit note <strong>{claim.creditNoteNumber}</strong>.
              The credit note is a <strong>draft</strong> — finance still has to issue it before the client&rsquo;s account
              is credited.
            </div>
          ) : null}

          <section aria-label="Evidence">
            <h3 className="mb-2 text-sm font-semibold text-slate-200">Evidence</h3>
            {refs.length ? (
              <ul className="flex flex-wrap gap-2">
                {refs.map((ref) => (
                  <li key={ref} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300">
                    {ref}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No evidence references attached.</p>
            )}
          </section>

          <section aria-label="History">
            <h3 className="mb-2 text-sm font-semibold text-slate-200">History</h3>
            <ol className="space-y-3">
              {(claim.events ?? []).map((event) => (
                <li key={event.id} className="border-l border-white/10 pl-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    {event.type.replace(/_/g, " ").toLowerCase()}
                    {event.fromStatus && event.toStatus && event.fromStatus !== event.toStatus
                      ? ` · ${CLAIM_STATUS_LABELS[event.fromStatus]} → ${CLAIM_STATUS_LABELS[event.toStatus]}`
                      : ""}
                  </div>
                  <div className="text-sm text-slate-200">{event.description ?? "—"}</div>
                  <div className="text-xs text-slate-500">
                    {formatDate(event.createdAt)} · {event.actorName ?? "Actor not recorded"}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {actionError ? (
            <div role="alert" className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              {actionError}
            </div>
          ) : null}

          <section aria-label="Actions" className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {actions?.assess ? (
                <button type="button" className={secondaryButton} onClick={() => setAction("assess")}>
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  Assess liability
                </button>
              ) : null}
              {actions?.approve ? (
                <button type="button" className={secondaryButton} onClick={() => setAction("approve")}>
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Approve an amount
                </button>
              ) : null}
              {actions?.settle ? (
                <button type="button" className={secondaryButton} onClick={() => setAction("settle")}>
                  <Wallet className="h-4 w-4" aria-hidden="true" />
                  Settle &amp; raise draft credit note
                </button>
              ) : null}
              {actions?.reject ? (
                <button type="button" className={secondaryButton} onClick={() => setAction("reject")}>
                  Reject
                </button>
              ) : null}
              {actions?.withdraw ? (
                <button type="button" className={secondaryButton} onClick={() => setAction("withdraw")}>
                  Withdraw
                </button>
              ) : null}
              <button type="button" className={secondaryButton} onClick={() => setAction("note")}>
                Add note
              </button>
              <button type="button" className={secondaryButton} onClick={() => setAction("evidence")}>
                Add evidence
              </button>
            </div>

            {actions && !actions.assess && !actions.approve && !actions.settle && !actions.reject && !actions.withdraw ? (
              <p className="text-xs text-slate-500">
                This claim is {CLAIM_STATUS_LABELS[claim.status].toLowerCase()} and cannot change again. Raise a new claim
                if the position changes.
              </p>
            ) : null}

            {action === "assess" ? (
              <AssessForm
                busy={busy === "assess"}
                defaultCap={claim.liabilityCap ?? undefined}
                defaultBasis={claim.liabilityBasis ?? ""}
                defaultLiability={claim.liability === "UNASSESSED" ? "CARRIER" : claim.liability}
                onSubmit={(payload) => run("assess", () => assessClaim(claim.id, payload))}
              />
            ) : null}

            {action === "approve" ? (
              <ApproveForm
                busy={busy === "approve"}
                claim={claim}
                onSubmit={(payload) => run("approve", () => approveClaim(claim.id, payload))}
              />
            ) : null}

            {action === "reject" ? (
              <RejectForm busy={busy === "reject"} onSubmit={(reason) => run("reject", () => rejectClaim(claim.id, { reason }))} />
            ) : null}

            {action === "withdraw" ? (
              <ReasonForm
                busy={busy === "withdraw"}
                label="Why is this claim being withdrawn? (optional)"
                submitLabel="Withdraw claim"
                onSubmit={(reason) => run("withdraw", () => withdrawClaim(claim.id, { reason }))}
              />
            ) : null}

            {action === "settle" ? (
              <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-sm text-slate-300">
                  Settling records {formatMoney(claim.approvedAmount, claim.currency)} as owed and raises a{" "}
                  <strong>draft</strong> credit note for {claim.clientName ?? "the client"}. Finance must issue it before
                  the client&rsquo;s account is credited.
                </p>
                <button
                  type="button"
                  className={primaryButton}
                  disabled={busy === "settle"}
                  onClick={() => run("settle", () => settleClaim(claim.id))}
                >
                  {busy === "settle" ? "Settling…" : "Settle and raise draft credit note"}
                </button>
              </div>
            ) : null}

            {action === "note" ? (
              <ReasonForm
                busy={busy === "note"}
                label="Note"
                submitLabel="Add note"
                onSubmit={(text) => run("note", () => addClaimNote(claim.id, text))}
              />
            ) : null}

            {action === "evidence" ? (
              <ReasonForm
                busy={busy === "evidence"}
                label="Evidence references, comma separated (photo ids, ePOD ids, manifest codes)"
                submitLabel="Add evidence"
                onSubmit={(text) => {
                  const refs = text
                    .split(",")
                    .map((ref) => ref.trim())
                    .filter(Boolean);
                  if (!refs.length) {
                    setActionError("Add at least one evidence reference.");
                    return Promise.resolve();
                  }
                  return run("evidence", () => addClaimEvidence(claim.id, refs));
                }}
              />
            ) : null}
          </section>

          <div className="flex justify-end gap-2 border-t border-white/10 pt-3">
            <button type="button" className={secondaryButton} onClick={onRemovedFromView}>
              Close and refresh list
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-slate-200">{value}</dd>
    </div>
  );
}

// ── Forms ───────────────────────────────────────────────────────────────────

function AssessForm({
  busy,
  defaultLiability,
  defaultBasis,
  defaultCap,
  onSubmit,
}: {
  busy: boolean;
  defaultLiability: ClaimLiability;
  defaultBasis: string;
  defaultCap?: number;
  onSubmit: (payload: { liability: Exclude<ClaimLiability, "UNASSESSED">; liabilityBasis: string; liabilityCap?: number }) => void;
}) {
  const [liability, setLiability] = useState<Exclude<ClaimLiability, "UNASSESSED">>(
    defaultLiability === "UNASSESSED" ? "CARRIER" : defaultLiability,
  );
  const [basis, setBasis] = useState(defaultBasis);
  const [cap, setCap] = useState(defaultCap != null ? String(defaultCap) : "");
  const invalid = basis.trim().length < 3;

  return (
    <form
      className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (invalid) return;
        onSubmit({
          liability,
          liabilityBasis: basis.trim(),
          ...(cap.trim() ? { liabilityCap: Number(cap) } : {}),
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="assess-liability">
            Who carries the loss
          </label>
          <select
            id="assess-liability"
            className={inputClass}
            value={liability}
            onChange={(event) => setLiability(event.target.value as Exclude<ClaimLiability, "UNASSESSED">)}
          >
            <option value="CARRIER">Carrier (us)</option>
            <option value="INSURER">Insurer</option>
            <option value="CLIENT">Client</option>
            <option value="THIRD_PARTY">Third party</option>
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="assess-cap">
            Liability cap (optional)
          </label>
          <input
            id="assess-cap"
            className={inputClass}
            inputMode="decimal"
            value={cap}
            onChange={(event) => setCap(event.target.value)}
            placeholder="e.g. 250000"
          />
        </div>
      </div>
      <div>
        <label className={labelClass} htmlFor="assess-basis">
          Basis — the clause, policy or agreement this rests on
        </label>
        <input
          id="assess-basis"
          className={inputClass}
          value={basis}
          onChange={(event) => setBasis(event.target.value)}
          placeholder="e.g. Trading terms clause 12.2"
        />
        {invalid ? <p className="mt-1 text-xs text-amber-300">State the basis — an assessment without one is an opinion.</p> : null}
      </div>
      <button type="submit" className={primaryButton} disabled={busy || invalid}>
        {busy ? "Saving…" : "Record assessment"}
      </button>
    </form>
  );
}

function ApproveForm({
  busy,
  claim,
  onSubmit,
}: {
  busy: boolean;
  claim: Claim;
  onSubmit: (payload: { approvedAmount: number; note?: string }) => void;
}) {
  const [amount, setAmount] = useState(String(claim.approvedAmount ?? claim.claimedAmount));
  const [note, setNote] = useState("");
  const numeric = Number(amount);
  const problem = approvalProblem(numeric, claim);

  return (
    <form
      className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (problem) return;
        onSubmit({ approvedAmount: numeric, ...(note.trim() ? { note: note.trim() } : {}) });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="approve-amount">
            Amount to approve ({claim.currency})
          </label>
          <input
            id="approve-amount"
            className={inputClass}
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="approve-note">
            Note (optional)
          </label>
          <input id="approve-note" className={inputClass} value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Claimed {formatMoney(claim.claimedAmount, claim.currency)}
        {claim.liabilityCap != null ? ` · cap ${formatMoney(claim.liabilityCap, claim.currency)}` : ""}.
      </p>
      {problem ? <p className="text-xs text-amber-300">{problem}</p> : null}
      <button type="submit" className={primaryButton} disabled={busy || Boolean(problem)}>
        {busy ? "Approving…" : "Approve"}
      </button>
    </form>
  );
}

function RejectForm({ busy, onSubmit }: { busy: boolean; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const invalid = reason.trim().length < 5;
  return (
    <form
      className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (invalid) return;
        onSubmit(reason.trim());
      }}
    >
      <label className={labelClass} htmlFor="reject-reason">
        Reason — the client sees this
      </label>
      <textarea
        id="reject-reason"
        className={textareaClass}
        rows={3}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="e.g. Damage occurred after a clean, signed POD; liability rests with the consignee."
      />
      <button type="submit" className={primaryButton} disabled={busy || invalid}>
        {busy ? "Rejecting…" : "Reject claim"}
      </button>
    </form>
  );
}

function ReasonForm({
  busy,
  label,
  submitLabel,
  onSubmit,
}: {
  busy: boolean;
  label: string;
  submitLabel: string;
  onSubmit: (text: string) => void | Promise<void>;
}) {
  const [text, setText] = useState("");
  return (
    <form
      className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!text.trim()) return;
        void onSubmit(text.trim());
      }}
    >
      <label className={labelClass} htmlFor="reason-form-text">
        {label}
      </label>
      <textarea
        id="reason-form-text"
        className={textareaClass}
        rows={2}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <button type="submit" className={primaryButton} disabled={busy || !text.trim()}>
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

// ── Create ──────────────────────────────────────────────────────────────────

function CreateClaimDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (claim: Claim) => void }) {
  const [waybillQuery, setWaybillQuery] = useState("");
  const [fetchedOptions, setFetchedOptions] = useState<WaybillOption[]>([]);
  const [waybill, setWaybill] = useState<WaybillOption | null>(null);
  const [type, setType] = useState<ClaimType>("DAMAGE");
  const [amount, setAmount] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [incidentAt, setIncidentAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = waybillQuery.trim();
    if (waybill || term.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchWaybills(term)
        .then((rows) => {
          if (!cancelled) setFetchedOptions(rows);
        })
        .catch(() => {
          if (!cancelled) setFetchedOptions([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [waybillQuery, waybill]);

  // Derived, not cleared by hand: a chosen waybill or a short term shows nothing.
  const options = waybill || waybillQuery.trim().length < 2 ? [] : fetchedOptions;

  const amountProblem = !Number.isFinite(Number(amount)) || Number(amount) <= 0 ? "Enter an amount greater than zero." : null;
  const summaryProblem = summary.trim().length < 3 ? "Describe what happened in a few words." : null;
  const problem = !waybill ? "Choose the waybill this claim concerns." : amountProblem ?? summaryProblem;

  const submit = async () => {
    if (!waybill || problem) return;
    setBusy(true);
    setError(null);
    try {
      const claim = await createClaim({
        waybillId: waybill.id,
        type,
        claimedAmount: Number(amount),
        summary: summary.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(incidentAt ? { incidentAt: new Date(incidentAt).toISOString() } : {}),
      });
      onCreated(claim);
    } catch (err: unknown) {
      setError(actionErrorMessage(err) ?? "The claim could not be raised.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Raise a claim" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div>
          <label className={labelClass} htmlFor="create-waybill">
            Waybill
          </label>
          {waybill ? (
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
              <span className="text-slate-100">
                {waybill.trackingNumber} · {waybill.clientName ?? "Client not recorded"}
              </span>
              <button type="button" className="text-xs text-sky-300 hover:underline" onClick={() => setWaybill(null)}>
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                id="create-waybill"
                className={inputClass}
                value={waybillQuery}
                onChange={(event) => setWaybillQuery(event.target.value)}
                placeholder="Search waybill number or client"
              />
              {options.length ? (
                <ul className="mt-2 max-h-40 overflow-auto rounded-xl border border-white/10 bg-slate-900/60">
                  {options.map((option) => (
                    <li key={option.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/5"
                        onClick={() => setWaybill(option)}
                      >
                        {option.trackingNumber}
                        <span className="ml-2 text-xs text-slate-500">{option.clientName ?? ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="create-type">
              Type
            </label>
            <select
              id="create-type"
              className={inputClass}
              value={type}
              onChange={(event) => setType(event.target.value as ClaimType)}
            >
              {CLAIM_TYPES.map((value) => (
                <option key={value} value={value}>
                  {CLAIM_TYPE_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="create-amount">
              Amount claimed
            </label>
            <input
              id="create-amount"
              className={inputClass}
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="e.g. 4250.00"
            />
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="create-summary">
            What happened
          </label>
          <input
            id="create-summary"
            className={inputClass}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="e.g. Pallet 3 of 7 crushed on unloading"
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="create-description">
            Detail (optional)
          </label>
          <textarea
            id="create-description"
            className={textareaClass}
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="create-incident">
            When did it happen? (optional)
          </label>
          <input
            id="create-incident"
            type="datetime-local"
            className={inputClass}
            value={incidentAt}
            onChange={(event) => setIncidentAt(event.target.value)}
          />
        </div>

        {problem && (waybill || amount || summary) ? (
          <p className="text-xs text-amber-300">{problem}</p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={primaryButton} disabled={busy || Boolean(problem)}>
            {busy ? "Raising…" : "Raise claim"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ── Shell ───────────────────────────────────────────────────────────────────

function ModalShell({
  title,
  onClose,
  wide,
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
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
        className={`w-full ${wide ? "max-w-3xl" : "max-w-xl"} rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl`}
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
