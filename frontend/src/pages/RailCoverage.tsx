import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ReferenceNotice from "./rail/ReferenceNotice";
import {
  capabilities,
  coverageRows,
  coverageSummary,
  derivedGaps,
  requestOrder,
  type CoverageCapability,
  type Criticality,
} from "../data/railCoverageData";

/**
 * Rail coverage — the gap analysis behind the annexure register.
 *
 * Deliberately a *prioritisation* view, not another list of the register: /rail/statement already
 * lists all 49 annexures with a have/want filter. This page answers the two questions that list
 * cannot — what does each gap block, and what should be requested first.
 */

const critTone: Record<Criticality, string> = {
  blocker: "bg-rose-100 text-rose-800 ring-1 ring-rose-200",
  important: "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
  reference: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

const critLabel: Record<Criticality, string> = {
  blocker: "Blocking",
  important: "Important",
  reference: "Reference",
};

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold tabular-nums ${tone ?? "text-slate-900"}`}>{value}</p>
    </div>
  );
}

export default function RailCoverage() {
  const [capability, setCapability] = useState<CoverageCapability | "all">("all");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [onlyBlockers, setOnlyBlockers] = useState(false);

  const rows = useMemo(() => {
    let r = coverageRows;
    if (capability !== "all") r = r.filter((x) => x.capability === capability);
    if (onlyMissing) r = r.filter((x) => !x.delivered);
    if (onlyBlockers) r = r.filter((x) => !x.delivered && x.criticality === "blocker");
    return r;
  }, [capability, onlyMissing, onlyBlockers]);

  const gaps = useMemo(() => {
    let g = derivedGaps;
    if (capability !== "all") g = g.filter((x) => x.capability === capability);
    if (onlyMissing || onlyBlockers) {
      // derived gaps are all outstanding by definition; the blocker filter still applies
      if (onlyBlockers) g = g.filter((x) => x.criticality === "blocker");
    }
    return g;
  }, [capability, onlyMissing, onlyBlockers]);

  const pct = Math.round((coverageSummary.delivered / coverageSummary.total) * 100);
  const showingAsk = capability === "all" && !onlyMissing && !onlyBlockers;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Source coverage · Network Statement V4 annexures
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Coverage &amp; gaps</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Which of the 49 Network Statement annexures are built into this product, which are not,
          and — for each gap — exactly what stays blocked until it arrives. Every row states the
          consequence, not just the status.
        </p>
      </div>

      <ReferenceNotice>
        Coverage describes what has been ingested. A delivered document is not automatically
        authoritative — where a source is superseded, excerpted or unexecuted, the row says so.
      </ReferenceNotice>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Annexures in register" value={coverageSummary.total} />
        <Stat label="Delivered" value={coverageSummary.delivered} tone="text-emerald-700" />
        <Stat label="Outstanding" value={coverageSummary.outstanding} tone="text-slate-900" />
        <Stat label="Blocking gaps" value={coverageSummary.blockers} tone="text-rose-700" />
        <Stat label="Important gaps" value={coverageSummary.outstandingImportant} tone="text-amber-700" />
        <Stat label="Reference gaps" value={coverageSummary.outstandingReference} tone="text-slate-500" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-semibold text-slate-700">Delivered against the register</span>
          <span className="tabular-nums text-slate-500">
            {coverageSummary.delivered} / {coverageSummary.total} · {pct}%
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Annexures delivered"
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100"
        >
          <div className="h-full rounded-full bg-teal-600" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          {derivedGaps.length} further gaps sit outside the register — sub-components of delivered
          documents, or sources the Network Statement never lists. Counting only the register would
          overstate coverage.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Coverage filters">
        <label className="text-xs font-medium text-slate-600">
          Capability{" "}
          <select
            value={capability}
            onChange={(e) => setCapability(e.target.value as CoverageCapability | "all")}
            className="ml-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
          >
            <option value="all">All capabilities</option>
            {capabilities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          aria-pressed={onlyMissing}
          onClick={() => setOnlyMissing((v) => !v)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
            onlyMissing
              ? "bg-teal-700 text-white"
              : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          Outstanding only
        </button>
        <button
          type="button"
          aria-pressed={onlyBlockers}
          onClick={() => setOnlyBlockers((v) => !v)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
            onlyBlockers
              ? "bg-rose-700 text-white"
              : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          Blocking only
        </button>
      </div>

      {/* Derived gaps — always shown first, because they hide behind green ticks */}
      {gaps.length > 0 && (
        <section className="rounded-xl border border-rose-200 bg-rose-50/40">
          <header className="border-b border-rose-200 px-3 py-2">
            <h2 className="text-sm font-semibold text-slate-800">
              Gaps outside the register
              <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800">
                {gaps.length}
              </span>
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-600">
              A delivered annexure can still be incomplete. These are missing pieces of, or inputs
              to, documents already counted as delivered.
            </p>
          </header>
          <ul className="divide-y divide-rose-100">
            {gaps.map((g) => (
              <li key={g.id} className="px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${critTone[g.criticality]}`}>
                    {critLabel[g.criticality]}
                  </span>
                  <span className="text-xs font-semibold text-slate-800">{g.title}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                    {g.parent}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400">
                    {g.capability}
                  </span>
                </div>
                <p className="mt-1 max-w-4xl text-[11px] leading-relaxed text-slate-600">{g.effect}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* The ordered ask */}
      {showingAsk && (
        <section className="rounded-xl border border-teal-200 bg-teal-50/50 p-3">
          <h2 className="text-sm font-semibold text-slate-800">What to request next, in order</h2>
          <p className="mt-0.5 text-[11px] text-slate-600">
            Ranked by what unblocks the most workflows per document, not by annexure number.
          </p>
          <ol className="mt-2 space-y-2">
            {requestOrder.map((r) => (
              <li key={r.rank} className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-700 text-[10px] font-semibold text-white">
                  {r.rank}
                </span>
                <div>
                  <p className="text-[11px] font-semibold text-slate-800">
                    {r.ids
                      .map((id) => {
                        const row = coverageRows.find((c) => c.id === id);
                        const gap = derivedGaps.find((g) => g.id === id);
                        if (gap) return gap.title;
                        return row ? `Annexure ${row.id} — ${row.title}` : id;
                      })
                      .join(" · ")}
                  </p>
                  <p className="mt-0.5 max-w-4xl text-[11px] leading-relaxed text-slate-600">{r.why}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Full register coverage table */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-3 py-2">
          <h2 className="text-sm font-semibold text-slate-800">
            Annexure register coverage
            <span className="ml-2 text-[11px] font-normal text-slate-500">
              showing {rows.length} of {coverageRows.length}
            </span>
          </h2>
          <Link
            to="/rail/statement"
            className="text-[11px] font-medium text-teal-700 underline-offset-2 hover:underline"
          >
            Full register with chapter grouping →
          </Link>
        </header>

        {rows.length === 0 ? (
          <p role="status" className="px-3 py-6 text-center text-xs text-slate-500">
            No annexures match these filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2">Annexure</th>
                  <th className="px-3 py-2">Ch</th>
                  <th className="px-3 py-2">Capability</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">What it unblocks, or what stays blocked</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 align-top last:border-0">
                    <td className="px-3 py-2">
                      <p className="font-semibold text-slate-800">{r.id}</p>
                      <p className="text-[11px] text-slate-500">{r.title}</p>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-500">{r.chapter}</td>
                    <td className="px-3 py-2 text-slate-600">{r.capability}</td>
                    <td className="px-3 py-2">
                      {r.delivered ? (
                        r.route ? (
                          <Link
                            to={r.route}
                            className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-200"
                          >
                            Delivered →
                          </Link>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                            Delivered
                          </span>
                        )
                      ) : (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${critTone[r.criticality]}`}>
                          {critLabel[r.criticality]}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[11px] leading-relaxed text-slate-600">{r.effect}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[11px] text-slate-500">
        Coverage is derived at runtime from the annexure register on{" "}
        <Link to="/rail/statement" className="text-teal-700 underline-offset-2 hover:underline">
          /rail/statement
        </Link>
        , so delivering an annexure there updates this page automatically.
      </p>
    </div>
  );
}
