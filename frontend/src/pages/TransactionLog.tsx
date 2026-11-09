import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Info, RefreshCw, Search, FileText, Train, X } from "lucide-react";
import { Badge } from "@/components/ui";
import {
  DataTable,
  ErrorState,
  PageHeader,
  StatCard,
  type Column,
} from "@/components/patterns";
import {
  ACTOR_TYPE_OPTIONS,
  SUMMARY_WINDOWS,
  actorBucketLabel,
  actorDisplay,
  actorToneClass,
  eventBadgeClass,
  evidenceKeys,
  fetchEntityHistory,
  fetchTrail,
  fetchTrailSummary,
  formatTimestamp,
  humanEvent,
  kindLabel,
  shortId,
  statusTransition,
  type TrailKind,
  type TrailRecord,
  type TrailSummary,
} from "../lib/auditTrail";

/**
 * The tenant transaction log — an **event trail**, not a diff log.
 *
 * What used to be here called `/audit/transactions`, which has never existed,
 * and rendered columns for `fieldChanged`, `oldValue` and `newValue` against a
 * back end that records none of that. The page now reads the append-only event
 * tables the platform actually keeps (`tracking_events`,
 * `rail_consignment_events`) and says so.
 *
 * Three rules the UI holds to, because each is a way an "audit trail" stops
 * being evidence:
 *
 *  1. No invented columns. There is no before/after value to show, so none is
 *     shown — on the list *or* in the history panel.
 *  2. No invented actors. An event with a missing actor is rendered as
 *     unattributed/unresolved, never as "System" (see `actorDisplay`).
 *  3. No invented transitions. `fromStatus` is filled only by the single-entity
 *     history endpoint, where the predecessor row is actually in hand.
 */

export interface TransactionLogProps {
  /**
   * Locks the page to one source, for `/transactions/waybills`. The general
   * route leaves it undefined and offers a source filter instead.
   */
  kind?: TrailKind;
}

/** `to` is exclusive on the API, so a whole-day selection ends at next midnight. */
function startOfDay(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function startOfNextDay(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setDate(date.getDate() + 1);
  return date.toISOString();
}

const EMPTY_SUMMARY: TrailSummary = {
  days: 7,
  total: 0,
  byKind: { waybill: 0, consignment: 0 },
  byActorType: {},
  entitiesTouched: 0,
  firstEventAt: null,
  lastEventAt: null,
};

export default function TransactionLog({ kind: lockedKind }: TransactionLogProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [kind, setKind] = useState<TrailKind | "">(lockedKind ?? "");
  const [actorType, setActorType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [days, setDays] = useState<number>(7);
  const [reloadToken, setReloadToken] = useState(0);

  const [loadingMore, setLoadingMore] = useState(false);
  const [historyNonce, setHistoryNonce] = useState(0);
  const [selected, setSelected] = useState<TrailRecord | null>(null);

  /**
   * Results carry the key they were fetched for. That makes loading and error
   * states *derived* rather than reset: a key mismatch means "nothing loaded for
   * the current filters yet", so the effect body never has to call setState
   * before fetching (React flags that as a cascading render).
   */
  const [page, setPage] = useState<{
    key: string;
    records: TrailRecord[];
    nextCursor: string | null;
    hasMore: boolean;
  } | null>(null);
  const [listError, setListError] = useState<{ key: string; error: unknown } | null>(null);

  const [summaryState, setSummaryState] = useState<{ key: string; value: TrailSummary } | null>(null);
  const [summaryErrorState, setSummaryErrorState] = useState<{ key: string; error: unknown } | null>(null);

  const [historyState, setHistoryState] = useState<{ key: string; rows: TrailRecord[] } | null>(null);
  const [historyErrorState, setHistoryErrorState] = useState<{ key: string; error: unknown } | null>(null);

  const effectiveKind = (lockedKind ?? kind) as TrailKind | "";

  // Every input that changes what the server returns, in one string.
  const listKey = useMemo(
    () =>
      JSON.stringify([
        effectiveKind,
        debouncedSearch,
        actorType,
        from,
        to,
        reloadToken,
      ]),
    [effectiveKind, debouncedSearch, actorType, from, to, reloadToken],
  );
  const summaryKey = `${days}|${reloadToken}`;
  const historyKey = selected ? `${selected.kind}:${selected.entityId}|${historyNonce}` : null;

  const records = page?.key === listKey ? page.records : [];
  const nextCursor = page?.key === listKey ? page.nextCursor : null;
  const hasMore = page?.key === listKey ? page.hasMore : false;
  const error = listError?.key === listKey ? listError.error : null;
  const loading = !error && page?.key !== listKey;

  const summaryError = summaryErrorState?.key === summaryKey ? summaryErrorState.error : null;
  const summary = summaryState?.key === summaryKey ? summaryState.value : null;
  const summaryLoading = !summaryError && summary === null;

  const history = historyKey && historyState?.key === historyKey ? historyState.rows : null;
  const historyError = historyKey && historyErrorState?.key === historyKey ? historyErrorState.error : null;
  const historyLoading = Boolean(historyKey) && !historyError && history === null;

  // Debounce typing: every keystroke must not become a database query.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // ── Page 1 (and every filter change) ──────────────────────────────────────
  useEffect(() => {
    let alive = true;
    const key = listKey;

    fetchTrail({
      kind: effectiveKind || undefined,
      q: debouncedSearch || undefined,
      actorType: actorType || undefined,
      from: startOfDay(from),
      to: startOfNextDay(to),
      limit: 50,
    })
      .then((result) => {
        if (alive) setPage({ key, ...result });
      })
      .catch((err) => {
        if (alive) setListError({ key, error: err });
      });

    return () => {
      alive = false;
    };
  }, [listKey, effectiveKind, debouncedSearch, actorType, from, to]);

  // ── Summary ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    const key = summaryKey;

    fetchTrailSummary(days)
      .then((value) => {
        if (alive) setSummaryState({ key, value: { ...EMPTY_SUMMARY, ...value } });
      })
      .catch((err) => {
        if (alive) setSummaryErrorState({ key, error: err });
      });

    return () => {
      alive = false;
    };
  }, [days, summaryKey]);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    const key = listKey;
    setLoadingMore(true);

    fetchTrail({
      kind: effectiveKind || undefined,
      q: debouncedSearch || undefined,
      actorType: actorType || undefined,
      from: startOfDay(from),
      to: startOfNextDay(to),
      cursor: nextCursor,
      limit: 50,
    })
      .then((next) => {
        setPage((prev) => {
          // Filters changed while this page was in flight: drop it rather than
          // append rows that do not belong to the current view.
          if (!prev || prev.key !== key) return prev;
          // Keyset paging cannot re-serve a row, but guard the key anyway: React
          // would silently drop a duplicate rather than show a double.
          const seen = new Set(prev.records.map((r) => r.id));
          return {
            key,
            records: [...prev.records, ...next.records.filter((r) => !seen.has(r.id))],
            nextCursor: next.nextCursor,
            hasMore: next.hasMore,
          };
        });
      })
      .catch((err) => setListError({ key, error: err }))
      .finally(() => setLoadingMore(false));
  }, [nextCursor, loadingMore, listKey, effectiveKind, debouncedSearch, actorType, from, to]);

  // ── Single-entity history ─────────────────────────────────────────────────
  useEffect(() => {
    if (!selected) return;
    let alive = true;
    const key = `${selected.kind}:${selected.entityId}|${historyNonce}`;

    fetchEntityHistory(selected.kind, selected.entityId)
      .then((rows) => {
        if (alive) setHistoryState({ key, rows });
      })
      .catch((err) => {
        if (alive) setHistoryErrorState({ key, error: err });
      });

    return () => {
      alive = false;
    };
  }, [selected, historyNonce]);

  const activeFilterCount = [debouncedSearch, actorType, from, to].filter(Boolean).length + (lockedKind ? 0 : kind ? 1 : 0);

  const clearFilters = () => {
    setSearch("");
    setActorType("");
    setFrom("");
    setTo("");
    if (!lockedKind) setKind("");
  };

  const columns = useMemo<Column<TrailRecord>[]>(
    () => [
      {
        id: "time",
        header: "When",
        cell: (row) => {
          const stamp = formatTimestamp(row.occurredAt);
          return (
            <div className="whitespace-nowrap" title={stamp.iso}>
              <div className="text-sm text-white">{stamp.date}</div>
              <div className="text-xs text-white/50">{stamp.time}</div>
            </div>
          );
        },
        className: "align-top",
      },
      {
        id: "entity",
        header: "Entity",
        cell: (row) => (
          <div className="flex items-start gap-2">
            {row.kind === "waybill" ? (
              <FileText size={14} strokeWidth={2} className="mt-0.5 text-white/40" aria-hidden />
            ) : (
              <Train size={14} strokeWidth={2} className="mt-0.5 text-white/40" aria-hidden />
            )}
            <div>
              <div className="font-mono text-sm text-white">{row.entityReference}</div>
              <div className="text-xs text-white/40">{kindLabel(row.kind)}</div>
            </div>
          </div>
        ),
        className: "align-top",
      },
      {
        id: "event",
        header: "Event",
        cell: (row) => (
          <Badge className={`border ${eventBadgeClass(row.event)}`}>{humanEvent(row.event)}</Badge>
        ),
        className: "align-top",
      },
      {
        id: "status",
        header: "State",
        cell: (row) => (
          <span className="font-mono text-xs text-white/70">
            {row.status ?? <span className="italic text-white/30">not recorded</span>}
          </span>
        ),
        className: "align-top",
        responsiveClassName: "hidden md:table-cell",
      },
      {
        id: "description",
        header: "What happened",
        cell: (row) => (
          <div className="max-w-[26rem]">
            <div className="text-sm text-white/85">{row.description}</div>
            {row.location ? (
              <div className="text-xs text-white/40">{row.location}</div>
            ) : null}
            {evidenceKeys(row).length ? (
              <div className="mt-1 text-[11px] text-white/35">
                evidence: {evidenceKeys(row).join(", ")}
              </div>
            ) : null}
          </div>
        ),
        className: "align-top",
      },
      {
        id: "actor",
        header: "Recorded by",
        cell: (row) => {
          const actor = actorDisplay(row);
          return (
            <div className={`text-sm ${actorToneClass(actor.tone)}`}>
              <div>{actor.text}</div>
              {actor.detail ? <div className="text-xs text-white/35">{actor.detail}</div> : null}
            </div>
          );
        },
        className: "align-top",
        responsiveClassName: "hidden lg:table-cell",
      },
    ],
    [],
  );

  const figures = summary ?? EMPTY_SUMMARY;

  const actorBuckets = useMemo(
    () =>
      Object.entries(figures.byActorType ?? {})
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1]),
    [figures.byActorType],
  );

  const windowLabel = useMemo(() => {
    const stamp = figures.firstEventAt ? formatTimestamp(figures.firstEventAt) : null;
    if (!stamp) return `last ${days} day${days === 1 ? "" : "s"}`;
    return `since ${stamp.date} ${stamp.time}`;
  }, [figures.firstEventAt, days]);

  const title = lockedKind === "waybill" ? "Waybill Transaction Log" : "Transaction Log";

  return (
    <div className="min-h-full bg-[#07111f]">
      <PageHeader
        title={title}
        description="Recorded movement and status events for waybills and rail consignments, newest first."
        className="mb-4"
        actions={
          <>
            {summaryLoading ? null : (
              <span className="text-xs text-white/40">activity {windowLabel}</span>
            )}
            <select
              aria-label="Summary window"
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              {SUMMARY_WINDOWS.map((option) => (
                <option key={option} value={option}>
                  Last {option} day{option === 1 ? "" : "s"}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setReloadToken((n) => n + 1)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm hover:bg-white/10 transition"
            >
              <RefreshCw size={16} strokeWidth={2} aria-hidden />
              Refresh
            </button>
          </>
        }
      />

      {/*
        Stated once, plainly, because the alternative is a user assuming they are
        looking at a field-level change log and drawing the wrong conclusion from
        its absence.
      */}
      <div className="mb-6 flex items-start gap-2 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-xs text-sky-100/80">
        <Info size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-sky-300" aria-hidden />
        <p>
          This is an <strong className="font-semibold text-sky-100">event trail</strong>: one row per
          recorded event, immutable once written. FlowOps records what happened to a consignment
          — collection, scans, arrivals, delivery, exceptions — not field-level edits, so no
          before/after values appear here. Trips are not event-sourced and do not appear.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard
          label="Events"
          value={summaryLoading ? "—" : figures.total}
          hint={`last ${days} day${days === 1 ? "" : "s"}`}
          icon={<RefreshCw size={20} strokeWidth={2} />}
        />
        <StatCard
          label="Waybill events"
          value={summaryLoading ? "—" : figures.byKind?.waybill ?? 0}
          icon={<FileText size={20} strokeWidth={2} />}
        />
        <StatCard
          label="Rail events"
          value={summaryLoading ? "—" : figures.byKind?.consignment ?? 0}
          icon={<Train size={20} strokeWidth={2} />}
        />
        <StatCard
          label="Entities touched"
          value={summaryLoading ? "—" : figures.entitiesTouched}
          hint="distinct waybills + consignments"
        />
      </div>

      {summaryError ? (
        <ErrorState
          title="Could not load the activity summary"
          error={summaryError}
          onRetry={() => setReloadToken((n) => n + 1)}
          className="mb-4"
        />
      ) : null}

      {actorBuckets.length > 0 ? (
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">
            Recorded by
          </span>
          {actorBuckets.map(([bucket, count]) => (
            <span
              key={bucket}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70"
            >
              {actorBucketLabel(bucket)}{" "}
              <span className="font-mono text-white">{count}</span>
            </span>
          ))}
        </div>
      ) : null}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="absolute left-3 top-3 text-white/40" size={16} aria-hidden />
          <input
            type="search"
            aria-label="Search events"
            placeholder="Search reference, description, location or driver…"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 pl-9 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {lockedKind ? null : (
          <select
            aria-label="Filter by source"
            value={kind}
            onChange={(e) => setKind(e.target.value as TrailKind | "")}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
          >
            <option value="">All sources</option>
            <option value="waybill">Waybills</option>
            <option value="consignment">Rail consignments</option>
          </select>
        )}
        <select
          aria-label="Filter by actor type"
          value={actorType}
          onChange={(e) => setActorType(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
        >
          <option value="">All actors</option>
          {ACTOR_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs text-white/50">
          From
          <input
            type="date"
            aria-label="From date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-white/50">
          To
          <input
            type="date"
            aria-label="To date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
          />
        </label>
        {activeFilterCount > 0 ? (
          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-sm text-white/60 hover:bg-white/5"
          >
            <X size={14} strokeWidth={2} aria-hidden />
            Clear {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}
          </button>
        ) : null}
      </div>

      <DataTable<TrailRecord>
        label="Transaction log events"
        columns={columns}
        rows={records}
        rowKey={(row) => row.id}
        isLoading={loading}
        error={error}
        onRetry={() => setReloadToken((n) => n + 1)}
        onRowClick={(row) => setSelected((current) => (current?.id === row.id ? null : row))}
        rowActionLabel={(row) => `Show history for ${row.entityReference}`}
        selectedKey={selected?.id ?? null}
        empty={{
          title: activeFilterCount
            ? "No events match these filters"
            : "No events recorded yet",
          description: activeFilterCount
            ? "Try widening the date range, or clearing the search and actor filters."
            : "Waybill scans and rail consignment events appear here as soon as they are recorded. Trips are not event-sourced.",
        }}
        density="compact"
      />

      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-xs text-white/40" aria-live="polite">
          Showing {records.length} event{records.length === 1 ? "" : "s"}
          {hasMore ? " — more available" : records.length ? " — end of trail" : ""}
        </p>
        {hasMore ? (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more events"}
          </button>
        ) : null}
      </div>

      {selected ? (
        <EntityHistoryPanel
          record={selected}
          rows={history}
          loading={historyLoading}
          error={historyError}
          onClose={() => setSelected(null)}
          onRetry={() => setHistoryNonce((n) => n + 1)}
        />
      ) : null}
    </div>
  );
}

interface EntityHistoryPanelProps {
  record: TrailRecord;
  rows: TrailRecord[] | null;
  loading: boolean;
  error: unknown;
  onClose: () => void;
  onRetry: () => void;
}

/**
 * The one place a status transition is legitimate: the server returns the whole
 * history for a single entity, oldest first, with each event's predecessor in
 * hand.
 */
function EntityHistoryPanel({ record, rows, loading, error, onClose, onRetry }: EntityHistoryPanelProps) {
  return (
    <section
      className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4"
      aria-label={`History for ${record.entityReference}`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">
            History — <span className="font-mono">{record.entityReference}</span>
          </h2>
          <p className="text-xs text-white/40">
            {kindLabel(record.kind)} {shortId(record.entityId)} · oldest first · a transition is
            shown only where the preceding event is known
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close history"
          className="rounded-lg border border-white/10 p-1.5 text-white/60 hover:bg-white/10"
        >
          <X size={14} strokeWidth={2} aria-hidden />
        </button>
      </div>

      {loading ? (
        <p className="py-6 text-center text-sm text-white/40" aria-busy="true">
          Loading history…
        </p>
      ) : error ? (
        <ErrorState title="Could not load this entity's history" error={error} onRetry={onRetry} />
      ) : !rows || rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/40">
          No recorded events for this {record.kind === "waybill" ? "waybill" : "consignment"}.
        </p>
      ) : (
        <ol className="space-y-2">
          {rows.map((row) => {
            const stamp = formatTimestamp(row.occurredAt);
            const actor = actorDisplay(row);
            const transition = statusTransition(row);
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-start gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3"
              >
                <div className="w-28 shrink-0" title={stamp.iso}>
                  <div className="text-xs text-white">{stamp.date}</div>
                  <div className="text-[11px] text-white/45">{stamp.time}</div>
                </div>
                <Badge className={`border ${eventBadgeClass(row.event)}`}>
                  {humanEvent(row.event)}
                </Badge>
                <div className="min-w-[12rem] flex-1">
                  <div className="text-sm text-white/85">{row.description}</div>
                  <div className="text-xs text-white/40">
                    {[row.location, transition ? `state: ${transition}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <div className={`text-xs ${actorToneClass(actor.tone)}`}>
                  {actor.text}
                  {actor.detail ? <span className="text-white/30"> · {actor.detail}</span> : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
