import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ship, Anchor, Loader2, Plus, AlertTriangle, ShieldCheck, ShieldAlert,
  Lock, PackageCheck, Scale, FileSignature, CheckCircle2, Search, X,
  type LucideIcon,
} from "lucide-react";
import { useToast } from "../../components/toast-context";
import BackButton from "../../components/BackButton";
import { formatMoney } from "../../lib/currency";
import * as ga from "../../api/generalAverageApi";

/**
 * General Average.
 *
 * The workflow this exists for: a shipowner declares general average after an
 * extraordinary sacrifice, and from that moment cargo is not released until
 * each cargo interest has provided security. Undamaged goods still owe a
 * contribution — that surprises cargo owners, and it is the forwarder who has
 * to explain it and then chase the security.
 *
 * So the page is organised around the liability, not around the data model:
 * what is still unsecured, what is blocked from release, and what is owed or
 * refundable once the adjuster's award lands.
 */

const STATUS_CLS: Record<ga.GaStatus, string> = {
  DECLARED: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  SECURING: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  SECURED: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  ADJUSTED: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
  SETTLED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  CLOSED: "border-white/15 bg-white/5 text-white/50",
};

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "—";

const num = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-ZA", { maximumFractionDigits: 2 }));

export default function GeneralAverage() {
  const { showToast } = useToast();
  const [events, setEvents] = useState<ga.GaEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ga.GaEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);

  // No setState before the first await: an effect that sets state synchronously
  // cascades an extra render. First paint is covered by the `true` initial
  // value; refreshes swap the rows without a spinner.
  const load = useCallback(async () => {
    try {
      setEvents(await ga.listGaEvents());
    } catch {
      showToast("Could not load general average events", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        setEvents(await ga.listGaEvents());
      } catch {
        if (alive) showToast("Could not load general average events", "error");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [showToast]);

  const open = useCallback(async (id: string) => {
    setSelectedId(id);
    setBusy(true);
    try {
      setDetail(await ga.getGaEvent(id));
    } catch {
      showToast("Could not load this event", "error");
    } finally {
      setBusy(false);
    }
  }, [showToast]);

  const refreshDetail = useCallback(async () => {
    if (!selectedId) return;
    setDetail(await ga.getGaEvent(selectedId));
    void load();
  }, [selectedId, load]);

  // Event-level liability summary. This is the number the desk is judged on.
  const summary = useMemo(() => {
    const rows = detail?.contributors ?? [];
    const secured = rows.filter((r) => r.securityLodgedAt).length;
    const released = rows.filter((r) => r.releasedAt).length;
    return {
      total: rows.length,
      secured,
      unsecured: rows.length - secured,
      released,
      blocked: rows.length - released,
      securedValue: rows.reduce((s, r) => s + (r.securityAmount ?? 0), 0),
      assessed: rows.reduce((s, r) => s + (r.assessedContribution ?? 0), 0),
      owed: rows.reduce((s, r) => s + ((r.balanceDue ?? 0) > 0 ? r.balanceDue ?? 0 : 0), 0),
      refundable: rows.reduce((s, r) => s + ((r.balanceDue ?? 0) < 0 ? -(r.balanceDue ?? 0) : 0), 0),
    };
  }, [detail]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl font-bold text-white/90">General Average</h1>
            <p className="text-sm text-white/45">
              Shared maritime sacrifice, security and cargo release
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-sky-500/90 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-500"
        >
          <Plus className="h-4 w-4" /> Declare GA
        </button>
      </div>

      {events.length === 0 && !showNew ? (
        <EmptyState onCreate={() => setShowNew(true)} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="space-y-2">
            {events.map((e) => (
              <button
                key={e.id}
                onClick={() => void open(e.id)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  selectedId === e.id
                    ? "border-sky-500/50 bg-sky-500/10"
                    : "border-white/10 bg-white/[0.03] hover:border-white/20"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-white/85">{e.vesselName}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_CLS[e.status]}`}>
                    {ga.GA_STATUS_LABEL[e.status]}
                  </span>
                </div>
                <div className="mt-1 text-xs text-white/45">
                  {e.voyageNumber ? `Voyage ${e.voyageNumber}` : "Voyage —"} · {fmtDate(e.occurredAt)}
                </div>
                <div className="mt-1 truncate text-xs text-white/35">{e.nature}</div>
                <div className="mt-2 text-[11px] text-white/40">
                  {e._count?.contributors ?? 0} cargo interest{(e._count?.contributors ?? 0) === 1 ? "" : "s"}
                </div>
              </button>
            ))}
          </div>

          <div className="min-w-0">
            {!detail ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center text-sm text-white/40">
                {busy ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : "Select an event."}
              </div>
            ) : (
              <EventDetail
                event={detail}
                summary={summary}
                busy={busy}
                setBusy={setBusy}
                onChanged={refreshDetail}
                showToast={showToast}
              />
            )}
          </div>
        </div>
      )}

      {showNew && (
        <NewEventDialog
          onClose={() => setShowNew(false)}
          onCreated={(e) => { setShowNew(false); void load(); void open(e.id); }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone?: "warn" | "good" | "bad" }) {
  const toneCls =
    tone === "warn" ? "text-amber-300" : tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-rose-300" : "text-white/85";
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-white/40">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`mt-1 text-lg font-bold ${toneCls}`}>{value}</div>
    </div>
  );
}

function EventDetail({
  event, summary, busy, setBusy, onChanged, showToast,
}: {
  event: ga.GaEvent;
  summary: { total: number; secured: number; unsecured: number; released: number; blocked: number; securedValue: number; assessed: number; owed: number; refundable: number };
  busy: boolean;
  setBusy: (b: boolean) => void;
  onChanged: () => Promise<void>;
  showToast: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const [tab, setTab] = useState<"interests" | "award">("interests");
  const [candidates, setCandidates] = useState<ga.GaCandidate[] | null>(null);
  const [matchedOn, setMatchedOn] = useState<string>("");
  const [addingValue, setAddingValue] = useState<Record<string, string>>({});
  const [awardInputs, setAwardInputs] = useState<Record<string, string>>({});
  const [awardAdjuster, setAwardAdjuster] = useState(event.adjusterName ?? "");

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      showToast(ok, "success");
      await onChanged();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      showToast(Array.isArray(msg) ? msg.join(", ") : msg || "That did not work", "error");
    } finally {
      setBusy(false);
    }
  };

  const findCandidates = async () => {
    setBusy(true);
    try {
      const r = await ga.discoverGaContributors(event.id);
      setCandidates(r.candidates);
      setMatchedOn(r.matchedOn);
      if (r.candidates.length === 0) showToast("No further cargo found on this voyage", "info");
    } catch {
      showToast("Could not search the voyage", "error");
    } finally {
      setBusy(false);
    }
  };

  const pool = (event.totalExpenditure ?? 0) + (event.totalSacrifice ?? 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Ship className="h-4 w-4 text-sky-300" />
              <h2 className="text-lg font-bold text-white/90">{event.vesselName}</h2>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_CLS[event.status]}`}>
                {ga.GA_STATUS_LABEL[event.status]}
              </span>
            </div>
            <p className="mt-1 text-sm text-white/50">{event.nature}</p>
          </div>
          <div className="text-right text-xs text-white/45">
            <div>Occurred {fmtDate(event.occurredAt)}</div>
            {event.portOfRefuge && <div>Port of refuge: {event.portOfRefuge}</div>}
            {event.adjusterName && <div>Adjuster: {event.adjusterName}</div>}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat icon={Scale} label="GA fund" value={formatMoney(pool, event.currency)} />
          <Stat icon={ShieldCheck} label="Secured" value={`${summary.secured}/${summary.total}`} tone={summary.unsecured > 0 ? "warn" : "good"} />
          <Stat icon={PackageCheck} label="Released" value={`${summary.released}/${summary.total}`} />
          <Stat
            icon={summary.owed > 0 ? AlertTriangle : CheckCircle2}
            label={summary.owed > 0 ? "Still owed" : summary.refundable > 0 ? "Refundable" : "Balances"}
            value={formatMoney(summary.owed > 0 ? summary.owed : summary.refundable, event.currency)}
            tone={summary.owed > 0 ? "bad" : summary.refundable > 0 ? "warn" : undefined}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-white/10 bg-white/[0.02] p-1">
        {(["interests", "award"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold capitalize transition ${
              tab === t ? "bg-white/10 text-white/90" : "text-white/45 hover:text-white/70"
            }`}
          >
            {t === "interests" ? "Cargo interests" : "Award & settlement"}
          </button>
        ))}
      </div>

      {tab === "interests" ? (
        <div className="space-y-3">
          {/* The liability, stated plainly. Undamaged cargo still owes. */}
          {summary.blocked > 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <p className="text-sm text-amber-200/90">
                {summary.blocked} cargo interest{summary.blocked === 1 ? "" : "s"} not yet released. The shipowner holds a
                lien over the cargo until security is lodged, and a cargo owner whose goods arrived undamaged still owes a
                contribution. Releasing without security makes the forwarder liable for it.
              </p>
            </div>
          )}

          <ContributorsTable
            event={event}
            busy={busy}
            onLodge={(c) =>
              run(async () => {
                const amount = window.prompt("Security amount", String(c.estimatedContribution ?? ""));
                if (!amount) return;
                const ref = window.prompt("Security reference (bond / guarantee number)", "");
                await ga.lodgeGaSecurity(event.id, c.id, {
                  securityType: "AVERAGE_BOND",
                  amount: Number(amount),
                  reference: ref || undefined,
                });
              }, "Security lodged")
            }
            onRelease={(c) =>
              run(() => ga.releaseGaCargo(event.id, c.id), "Cargo released")
            }
          />

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white/80">Find cargo on this voyage</h3>
                <p className="text-xs text-white/45">
                  Ocean shipment files matching the vessel
                  {matchedOn ? ` (matched on ${matchedOn})` : ""}.
                </p>
              </div>
              <button
                onClick={() => void findCandidates()}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70 transition hover:border-white/30 disabled:opacity-40"
              >
                <Search className="h-4 w-4" /> Search
              </button>
            </div>

            {candidates && candidates.length > 0 && (
              <ul className="mt-3 space-y-2">
                {candidates.map((c) => (
                  <li key={c.shipmentFileId} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-white/80">{c.fileNumber} · {c.consigneeName ?? "—"}</div>
                      <div className="text-xs text-white/40">
                        Suggested CIF {formatMoney(c.suggestedValue, event.currency)}
                        {c.incoterm ? ` · ${c.incoterm}` : ""}
                      </div>
                      {c.needsReview && (
                        <div className="mt-1 inline-flex items-center gap-1 text-xs text-amber-300">
                          <AlertTriangle className="h-3 w-3" />
                          Not CIF — confirm the contributory value; it is not converted for you.
                        </div>
                      )}
                    </div>
                    <input
                      value={addingValue[c.shipmentFileId] ?? ""}
                      onChange={(e) => setAddingValue((v) => ({ ...v, [c.shipmentFileId]: e.target.value }))}
                      placeholder="Value"
                      inputMode="decimal"
                      className="w-28 rounded-md border border-white/15 bg-black/30 px-2 py-1 text-sm text-white/85 outline-none focus:border-sky-500/50"
                    />
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            ga.addGaContributor(event.id, {
                              shipmentFileId: c.shipmentFileId,
                              contributoryValue: Number(addingValue[c.shipmentFileId] ?? c.suggestedValue),
                              valueBasis: c.needsReview ? "DECLARED" : "CIF",
                            }),
                          "Cargo interest added",
                        ).then(() => setCandidates((cur) => (cur ?? []).filter((x) => x.shipmentFileId !== c.shipmentFileId)))
                      }
                      className="rounded-md bg-sky-500/90 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-40"
                    >
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white/80">
              <FileSignature className="h-4 w-4" /> Adjuster&apos;s award
            </h3>
            <p className="mt-1 text-xs text-white/45">
              Until the award lands every figure here is provisional. After it lands, the difference between
              what was secured and what was assessed becomes a balance — owed, or refundable.
            </p>

            <div className="mt-3 space-y-2">
              {(event.contributors ?? []).map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-white/80">{c.shipmentFile?.fileNumber ?? c.shipmentFileId}</div>
                    <div className="text-xs text-white/40">
                      Secured {formatMoney(c.securityAmount, event.currency)}
                      {c.assessedContribution != null && ` · Assessed ${formatMoney(c.assessedContribution, event.currency)}`}
                    </div>
                  </div>
                  <input
                    value={awardInputs[c.id] ?? (c.assessedContribution != null ? String(c.assessedContribution) : "")}
                    onChange={(e) => setAwardInputs((v) => ({ ...v, [c.id]: e.target.value }))}
                    placeholder="Assessed"
                    inputMode="decimal"
                    className="w-28 rounded-md border border-white/15 bg-black/30 px-2 py-1 text-sm text-white/85 outline-none focus:border-sky-500/50"
                  />
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={awardAdjuster}
                onChange={(e) => setAwardAdjuster(e.target.value)}
                placeholder="Adjuster name"
                className="w-48 rounded-md border border-white/15 bg-black/30 px-2 py-1 text-sm text-white/85 outline-none focus:border-sky-500/50"
              />
              <button
                disabled={busy}
                onClick={() =>
                  run(
                    () =>
                      ga.recordGaAward(event.id, {
                        adjusterName: awardAdjuster || undefined,
                        contributions: (event.contributors ?? [])
                          .map((c) => ({
                            contributorId: c.id,
                            assessedContribution: Number(awardInputs[c.id] ?? c.assessedContribution ?? 0),
                          }))
                          .filter((x) => Number.isFinite(x.assessedContribution)),
                      }),
                    "Award recorded",
                  )
                }
                className="rounded-md bg-indigo-500/90 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-40"
              >
                Record award
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <h3 className="text-sm font-semibold text-white/80">Settlement</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <div className="text-[11px] uppercase text-white/40">Assessed total</div>
                <div className="text-lg font-bold text-white/85">{formatMoney(summary.assessed, event.currency)}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <div className="text-[11px] uppercase text-white/40">Still owed</div>
                <div className="text-lg font-bold text-rose-300">{formatMoney(summary.owed, event.currency)}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <div className="text-[11px] uppercase text-white/40">Refundable</div>
                <div className="text-lg font-bold text-amber-300">{formatMoney(summary.refundable, event.currency)}</div>
              </div>
            </div>
            <button
              disabled={busy || event.status === "SETTLED"}
              onClick={() => run(() => ga.settleGaEvent(event.id), "Event settled")}
              className="mt-3 rounded-md bg-emerald-500/90 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
            >
              {event.status === "SETTLED" ? "Settled" : "Settle event"}
            </button>
            <p className="mt-2 text-xs text-white/40">
              The server refuses to settle while any balance is outstanding. A refund due does not block settlement.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ContributorsTable({
  event, busy, onLodge, onRelease,
}: {
  event: ga.GaEvent;
  busy: boolean;
  onLodge: (c: ga.GaContributor) => void;
  onRelease: (c: ga.GaContributor) => void;
}) {
  const rows = event.contributors ?? [];
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center text-sm text-white/40">
        No cargo interests recorded yet. Use “Find cargo on this voyage”.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-sm">
        <thead className="bg-white/[0.04] text-left text-[11px] uppercase tracking-wide text-white/40">
          <tr>
            <th className="px-3 py-2">Cargo interest</th>
            <th className="px-3 py-2 text-right">Contributory value</th>
            <th className="px-3 py-2 text-right">Share</th>
            <th className="px-3 py-2 text-right">Estimated</th>
            <th className="px-3 py-2">Security</th>
            <th className="px-3 py-2">Release</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const secured = !!c.securityLodgedAt;
            const released = !!c.releasedAt;
            return (
              <tr key={c.id} className="border-t border-white/5">
                <td className="px-3 py-2">
                  <div className="text-white/85">{c.shipmentFile?.fileNumber ?? "—"}</div>
                  <div className="text-xs text-white/40">{c.shipmentFile?.consigneeName ?? ""}</div>
                </td>
                <td className="px-3 py-2 text-right text-white/75">{num(c.adjustedValue ?? c.contributoryValue)}</td>
                <td className="px-3 py-2 text-right text-white/60">{c.sharePct != null ? `${c.sharePct.toFixed(2)}%` : "—"}</td>
                <td className="px-3 py-2 text-right text-white/75">{c.estimatedContribution != null ? formatMoney(c.estimatedContribution, event.currency) : "—"}</td>
                <td className="px-3 py-2">
                  {secured ? (
                    <div className="text-xs">
                      <div className="inline-flex items-center gap-1 text-emerald-300">
                        <ShieldCheck className="h-3 w-3" /> {ga.GA_SECURITY_LABEL[c.securityType ?? "AVERAGE_BOND"]}
                      </div>
                      <div className="text-white/40">
                        {formatMoney(c.securityAmount, event.currency)} · {fmtDate(c.securityLodgedAt)}
                      </div>
                    </div>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() => onLodge(c)}
                      className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-40"
                    >
                      <ShieldAlert className="h-3 w-3" /> Lodge security
                    </button>
                  )}
                </td>
                <td className="px-3 py-2">
                  {released ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                      <PackageCheck className="h-3 w-3" /> {fmtDate(c.releasedAt)}
                    </span>
                  ) : (
                    <button
                      // Disabled as a courtesy. The gate that matters is server-side:
                      // releaseCargo() refuses unless security is on record.
                      disabled={busy || !secured}
                      title={secured ? "Record release" : "Security must be lodged before cargo can be released"}
                      onClick={() => onRelease(c)}
                      className="inline-flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-xs text-white/70 transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <Lock className="h-3 w-3" /> Release
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-10 text-center">
      <Anchor className="mx-auto h-8 w-8 text-white/25" />
      <h2 className="mt-3 text-base font-semibold text-white/80">No general average declared</h2>
      <p className="mx-auto mt-1 max-w-lg text-sm text-white/45">
        When extraordinary expenditure is incurred, or property sacrificed, to save a ship and its cargo from a common
        danger, the loss is shared by everyone whose property survived it. Cargo owners owe a contribution even when
        their goods arrived undamaged, and the shipowner may withhold delivery until security is provided.
      </p>
      <button
        onClick={onCreate}
        className="mt-4 rounded-lg bg-sky-500/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500"
      >
        Declare general average
      </button>
    </div>
  );
}

function NewEventDialog({
  onClose, onCreated, showToast,
}: {
  onClose: () => void;
  onCreated: (e: ga.GaEvent) => void;
  showToast: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const [form, setForm] = useState({
    vesselName: "", nature: "", occurredAt: new Date().toISOString().slice(0, 10),
    vesselImo: "", vesselMmsi: "", voyageNumber: "", portOfRefuge: "",
    declaredBy: "", adjusterName: "", totalExpenditure: "", totalSacrifice: "", currency: "USD",
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.vesselName.trim() || !form.nature.trim()) {
      showToast("Vessel and the nature of the casualty are required", "error");
      return;
    }
    setSaving(true);
    try {
      onCreated(await ga.createGaEvent({
        vesselName: form.vesselName.trim(),
        nature: form.nature.trim(),
        occurredAt: new Date(form.occurredAt).toISOString(),
        vesselImo: form.vesselImo.trim() || undefined,
        vesselMmsi: form.vesselMmsi.trim() || undefined,
        voyageNumber: form.voyageNumber.trim() || undefined,
        portOfRefuge: form.portOfRefuge.trim() || undefined,
        declaredBy: form.declaredBy.trim() || undefined,
        adjusterName: form.adjusterName.trim() || undefined,
        totalExpenditure: form.totalExpenditure ? Number(form.totalExpenditure) : undefined,
        totalSacrifice: form.totalSacrifice ? Number(form.totalSacrifice) : undefined,
        currency: form.currency,
      }));
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      showToast(Array.isArray(msg) ? msg.join(", ") : msg || "Could not declare", "error");
    } finally {
      setSaving(false);
    }
  };

  const f = (k: keyof typeof form, label: string, opts?: { placeholder?: string; type?: string }) => (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-white/40">{label}</span>
      <input
        value={form[k]}
        onChange={(e) => setForm((s) => ({ ...s, [k]: e.target.value }))}
        type={opts?.type ?? "text"}
        placeholder={opts?.placeholder}
        className="mt-1 w-full rounded-md border border-white/15 bg-black/30 px-2 py-1.5 text-sm text-white/85 outline-none focus:border-sky-500/50"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-neutral-950 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white/90">Declare general average</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/80"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {f("vesselName", "Vessel")}
          {f("voyageNumber", "Voyage", { placeholder: "e.g. 026W" })}
          {f("vesselImo", "IMO", { placeholder: "7 digits" })}
          {f("vesselMmsi", "MMSI", { placeholder: "9 digits" })}
          {f("occurredAt", "Date of the GA act", { type: "date" })}
          {f("portOfRefuge", "Port of refuge", { placeholder: "e.g. Durban" })}
          <div className="sm:col-span-2">{f("nature", "Nature of the casualty", { placeholder: "e.g. engine room fire, grounding" })}</div>
          {f("declaredBy", "Declared by", { placeholder: "Shipowner / agent" })}
          {f("adjusterName", "Average adjuster")}
          {f("totalExpenditure", "Extraordinary expenditure", { type: "number" })}
          {f("totalSacrifice", "Property sacrificed", { type: "number" })}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white/70 hover:border-white/30">Cancel</button>
          <button
            onClick={() => void submit()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-500/90 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-40"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Declare
          </button>
        </div>
      </div>
    </div>
  );
}
