import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, Sparkles, XCircle } from "lucide-react";
import {
  applyOptimizer, getCorridors, listSlotApplications, runOptimizer,
  OPTIMIZER_DECISION_LABEL, type CorridorUtilization, type OptimizerProposal, type OptimizerResult, type SlotApplication,
} from "../../api/railSlotApi";
import { useToast } from "../../components/toast-context";
import type { Tone } from "../../lib/railSlot";
import { Banner, Pill, Section, btnNeutral, btnPrimary, inputCls } from "./railUi";

/**
 * Schedule Optimizer — Phase 2 of the event-driven rail architecture.
 *
 * The backend PROPOSES (deterministic constraint policy over capacity,
 * possessions, envelope + compliance); a human APPLIES each decision through the
 * normal allocate/reject workflow. Capacity is entered by the operator (e.g.
 * from Annexure 33b) — the optimizer never invents it.
 */

const DECISION_TONE: Record<string, Tone> = {
  ALLOCATE: "ok",
  DEFER: "warn",
  REJECT: "danger",
};

const PENDING: Array<SlotApplication["status"]> = ["SUBMITTED", "UNDER_ASSESSMENT", "CAPACITY_CONFLICT"];

export default function SlotOptimizerPanel({ canWrite }: { canWrite: boolean }) {
  const { showToast } = useToast();
  const [apps, setApps] = useState<SlotApplication[]>([]);
  const [corridorNames, setCorridorNames] = useState<Map<string, string>>(new Map());
  const [capacity, setCapacity] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<OptimizerResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(() => (async () => {
    try {
      const [a, cor] = await Promise.all([listSlotApplications(), getCorridors()]);
      setApps(a);
      setResult(null);
      setSelected(new Set());
      setCorridorNames(new Map(cor.map((c) => [c.code, c.name])));
    } catch (e) {
      const message = String((e as Error)?.message ?? e);
      setApps([]);
      setResult(null);
      setSelected(new Set());
      setCorridorNames(new Map());
      setLoadError(message);
      showToast(`Could not load schedule optimizer data: ${message}`, "error");
    } finally {
      setLoading(false);
    }
  })(), [showToast]);

  useEffect(() => { void load(); }, [load]);

  const pending = useMemo(() => apps.filter((a) => PENDING.includes(a.status)), [apps]);
  const corridorsInPlay = useMemo(() => {
    const set = new Set<string>();
    for (const a of pending) set.add(a.corridorCode);
    return [...set].sort();
  }, [pending]);

  const run = async () => {
    const entries = corridorsInPlay
      .filter((code) => (capacity[code] ?? "").trim() !== "")
      .map((code) => ({ corridorCode: code, trainsPerWeek: Math.max(0, Math.floor(Number(capacity[code]))) }))
      .filter((c) => Number.isFinite(c.trainsPerWeek));
    if (entries.length === 0) {
      showToast("Enter the declared weekly capacity (e.g. Annexure 33b) for at least one corridor first.", "error");
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      const r = await runOptimizer(entries);
      setResult(r);
      setSelected(new Set(r.proposals.filter((p) => p.decision !== "DEFER").map((p) => p.applicationId)));
    } catch (e) {
      const message = String((e as Error)?.message ?? e);
      setRunError(message);
      showToast(`Optimizer run failed: ${message}`, "error");
    } finally {
      setRunning(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const apply = async () => {
    const chosen = (result?.proposals ?? []).filter((p) => selected.has(p.applicationId));
    if (chosen.length === 0) return;
    setApplying(true);
    try {
      const decisions = chosen.map((p) => ({
        applicationId: p.applicationId,
        action: p.decision as "ALLOCATE" | "REJECT",
        ...(p.decision === "REJECT" ? { reason: p.reasons[0]?.slice(0, 1900) ?? "Rejected via schedule optimizer." } : {}),
      }));
      const r = await applyOptimizer(decisions);
      showToast(`Applied ${r.applied} decision(s)${r.failed ? `, ${r.failed} failed` : ""}.`, r.failed ? "error" : "success");
      setResult(null);
      await load();
    } catch (e) {
      showToast(`Apply failed: ${(e as Error)?.message ?? e}`, "error");
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 py-10 text-slate-300"><Loader2 className="h-5 w-5 animate-spin" /> Loading scheduler…</div>;
  }

  return (
    <div className="space-y-5">
      <Section title="Schedule optimizer">
        {loadError && (
          <div role="alert" className="mb-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-200">
            Schedule optimizer data unavailable: {loadError}. No conclusion about pending applications can be drawn.
          </div>
        )}
        {runError && (
          <div role="alert" className="mb-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-200">
            Optimizer run failed: {runError}
          </div>
        )}
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            Deterministic decision support — it proposes, you decide. Capacity is declared by you (Annexure 33b); the optimizer never invents it.
          </p>
          <p className="text-sm text-slate-300">
            {loadError
              ? "Pending-application status could not be verified."
              : pending.length === 0
              ? "No pending applications (submitted / under assessment / capacity conflict) — nothing to optimise."
              : `${pending.length} pending application(s) across ${corridorsInPlay.length} corridor(s). Enter the declared trains-per-week each corridor can carry:`}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {corridorsInPlay.map((code) => (
              <label key={code} className="block rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {corridorNames.get(code) ?? code} — trains / week
                </span>
                <input
                  type="number" min={0} step={1}
                  className={`${inputCls} mt-2`}
                  placeholder="e.g. 21"
                  value={capacity[code] ?? ""}
                  onChange={(e) => setCapacity((prev) => ({ ...prev, [code]: e.target.value }))}
                  aria-label={`Weekly capacity for ${corridorNames.get(code) ?? code}`}
                />
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button className={btnPrimary} onClick={() => void run()} disabled={running || Boolean(loadError) || corridorsInPlay.length === 0}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {running ? "Running…" : "Run optimizer"}
            </button>
            <button className={btnNeutral} onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </div>
      </Section>

      {result && result.notes.length > 0 && (
        <Banner tone="warn" title="Capacity notes">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {result.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </Banner>
      )}

      {result && (
        <Section title="Proposals">
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              Generated {new Date(result.generatedAt).toLocaleString("en-ZA")} — apply goes through the normal allocate/reject workflow with full audit.
            </p>
            {result.proposals.map((p) => (
              <ProposalCard
                key={p.applicationId}
                proposal={p}
                corridorName={corridorNames.get(p.corridorCode) ?? p.corridorCode}
                selectable={canWrite && p.decision !== "DEFER"}
                selected={selected.has(p.applicationId)}
                onToggle={() => toggle(p.applicationId)}
              />
            ))}
            {canWrite && (
              <div className="flex items-center gap-3 pt-2">
                <button className={btnPrimary} onClick={() => void apply()} disabled={applying || selected.size === 0}>
                  {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Apply {selected.size} selected decision(s)
                </button>
                <span className="text-xs text-slate-400">Deferred items are not selectable — resolve their blockers first.</span>
              </div>
            )}
          </div>
        </Section>
      )}

      {result && (
        <Section title="Corridor utilisation">
          <div className="overflow-x-auto">
            <p className="mb-2 text-xs text-slate-400">Declared capacity vs allocated vs this run&apos;s proposals.</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-4">Corridor</th>
                  <th className="py-2 pr-4">Capacity / wk</th>
                  <th className="py-2 pr-4">Allocated / wk</th>
                  <th className="py-2 pr-4">Proposed / wk</th>
                  <th className="py-2 pr-4">Deferred / wk</th>
                  <th className="py-2">Remaining / wk</th>
                </tr>
              </thead>
              <tbody>
                {result.utilization.map((u) => (
                  <UtilRow key={u.corridorCode} u={u} name={corridorNames.get(u.corridorCode) ?? u.corridorCode} />
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}

function ProposalCard({ proposal: p, corridorName, selectable, selected, onToggle }: {
  proposal: OptimizerProposal; corridorName: string; selectable: boolean; selected: boolean; onToggle: () => void;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${selected ? "border-emerald-400/50 bg-emerald-400/[0.06]" : "border-white/10 bg-white/[0.03]"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <Pill tone={DECISION_TONE[p.decision] ?? "muted"}>{OPTIMIZER_DECISION_LABEL[p.decision]}</Pill>
        <span className="font-semibold text-white">{p.applicationNumber}</span>
        <span className="text-sm text-slate-400">{corridorName}</span>
        <span className="text-xs text-slate-500">
          {p.weeklyDemand === null ? "demand not stated" : `${p.weeklyDemand} train(s)/week`} · score {p.score}
        </span>
        {selectable && (
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={selected} onChange={onToggle} className="h-4 w-4 rounded border-white/20 bg-transparent" />
            select
          </label>
        )}
      </div>
      {p.reasons.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
          {p.reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}
      {p.warnings.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-200/90">
          {p.warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}
    </div>
  );
}

function UtilRow({ u, name }: { u: CorridorUtilization; name: string }) {
  return (
    <tr className="border-b border-white/5">
      <td className="py-2 pr-4 text-white">{name}</td>
      <td className="py-2 pr-4 text-slate-300">{u.capacityPerWeek ?? <span className="text-amber-200">not declared</span>}</td>
      <td className="py-2 pr-4 text-slate-300">{u.allocatedPerWeek}</td>
      <td className="py-2 pr-4 text-emerald-300">{u.proposedPerWeek}</td>
      <td className="py-2 pr-4 text-amber-200">{u.deferredPerWeek}</td>
      <td className="py-2">
        {u.remainingPerWeek === null ? <span className="text-slate-500">—</span> : (
          <span className={u.remainingPerWeek < 0 ? "text-red-300" : "text-slate-300"}>
            {u.remainingPerWeek} {u.remainingPerWeek < 0 && <XCircle className="inline h-3.5 w-3.5" />}
          </span>
        )}
      </td>
    </tr>
  );
}
