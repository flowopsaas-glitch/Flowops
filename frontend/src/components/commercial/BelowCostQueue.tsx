import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import {
  listTripExceptions,
  updateTripException,
  type MarginExceptionStatus,
  type TripExceptionRow,
} from "../../api/tripTruthApi";
import { errorMessageOf } from "../patterns/errorMessage";
import { formatMoney } from "../../lib/currency";

const tenantCurrency = () => window.__FLOWOPS_CURRENCY__ ?? "ZAR";

function ageLabel(iso?: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 3600_000) return `${Math.max(1, Math.floor(ms / 60_000))}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

/**
 * Below-cost exception queue. An exception exists only where a trip's cost
 * is backed by recorded entries (MEASURED/ALLOCATED) and still landed under
 * water — estimates never raise exceptions, because acting on a guess is
 * how a small loss turns into a big one. Acknowledge while there is still
 * time to reprice, rebook, or talk to the client.
 */
export default function BelowCostQueue({ period }: { period: string }) {
  const [rows, setRows] = useState<TripExceptionRow[]>([]);
  const [counts, setCounts] = useState<{ open: number; acknowledged: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  // Lint-proven loader shape (see TripTruthPanel): writes inside try,
  // AbortSignal guard, rejection surfaced by callers.
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const list = await listTripExceptions(period);
        if (signal?.aborted) return;
        setRows(list.exceptions);
        setCounts(list.counts);
        setLoadError(null);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [period],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoadError(errorMessageOf(error));
    });
    return () => controller.abort();
  }, [load]);

  const act = async (row: TripExceptionRow, status: MarginExceptionStatus) => {
    setBusyId(row.waybillId);
    setActionError(null);
    try {
      await updateTripException(row.waybillId, status, notes[row.waybillId]);
      await load();
    } catch (error) {
      setActionError(errorMessageOf(error));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section
      aria-labelledby="below-cost-heading"
      className="rounded-2xl border border-red-400/20 bg-red-400/[0.03] p-4"
    >
      <h3 id="below-cost-heading" className="flex items-center gap-2 text-sm font-bold">
        <AlertTriangle className="h-4 w-4 text-red-300" />
        Below-cost exceptions
        {counts && (counts.open > 0 || counts.acknowledged > 0) && (
          <span className="rounded-full border border-red-400/40 bg-red-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-200">
            {counts.open} open · {counts.acknowledged} acknowledged
          </span>
        )}
      </h3>
      <p className="mt-1 text-xs text-white/45">
        Only trips whose cost is backed by recorded entries can appear here — estimates
        never raise exceptions. Acknowledge while there is still time to act.
      </p>

      {actionError && (
        <p role="alert" className="mt-2 text-sm text-red-300">{actionError}</p>
      )}

      {loading ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-white/40">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking for below-cost trips…
        </p>
      ) : loadError ? (
        <p role="alert" className="mt-3 text-sm text-red-300">
          Could not load exceptions: {loadError}
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          No open below-cost exceptions for {period}. If trips are missing here, check
          whether their costs were recorded — unrecorded trips raise no exceptions.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-white/5">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <span className="font-semibold">{row.trackingNumber ?? row.waybillId}</span>
              <span className="text-white/50">{row.clientName ?? "—"}</span>
              <span className="font-bold text-red-300">
                {formatMoney(row.grossMargin, tenantCurrency())}
              </span>
              <span className="text-xs text-white/40">
                cost {formatMoney(row.totalCost, tenantCurrency())} vs revenue{" "}
                {formatMoney(row.revenue, tenantCurrency())} · {row.provenance?.toLowerCase()}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  row.exceptionStatus === "OPEN"
                    ? "border-red-400/40 bg-red-400/10 text-red-200"
                    : "border-amber-400/40 bg-amber-400/10 text-amber-200"
                }`}
              >
                {row.exceptionStatus?.toLowerCase()}
              </span>
              {row.exceptionAt && (
                <span className="text-[11px] text-white/35">opened {ageLabel(row.exceptionAt)}</span>
              )}
              {row.exceptionNote && (
                <span className="w-full text-xs text-white/50">“{row.exceptionNote}”</span>
              )}
              <span className="ml-auto flex items-center gap-2">
                <label className="sr-only" htmlFor={`exc-note-${row.waybillId}`}>
                  Note for {row.trackingNumber ?? "trip"}
                </label>
                <input
                  id={`exc-note-${row.waybillId}`}
                  className="w-44 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-white placeholder:text-white/25 focus:border-white/30 focus:outline-none"
                  placeholder="What will you do?"
                  value={notes[row.waybillId] ?? ""}
                  onChange={(e) =>
                    setNotes((prev) => ({ ...prev, [row.waybillId]: e.target.value }))
                  }
                />
                {row.exceptionStatus === "OPEN" && (
                  <button
                    type="button"
                    disabled={busyId === row.waybillId}
                    onClick={() => void act(row, "ACKNOWLEDGED")}
                    className="rounded-lg border border-amber-400/40 px-2.5 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-400/10 disabled:opacity-50"
                  >
                    Acknowledge
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyId === row.waybillId}
                  onClick={() => void act(row, "RESOLVED")}
                  className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-black hover:bg-white/85 disabled:opacity-50"
                >
                  Resolve
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
