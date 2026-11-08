import React, { useEffect, useMemo, useState } from "react";
import ReferenceNotice from "./rail/ReferenceNotice";
import {
  capacityDb,
  capacityFYNote,
  capacityFYs,
  capacityRoutes,
  capacitySource,
  derivedFormulas,
  workbookSnapshot,
  type CapacityRow,
} from "../data/railCapacityData";
import { fyConsistencyStatement, routeHeadroom } from "../data/railCapacityAnalysis";
import CorridorCapacityPanel from "../components/rail/CorridorCapacityPanel";
import { getCorridors } from "../api/railSlotApi";

/**
 * Slots & Capacity page — built round 68 from Annexure 33 Capacity Statement (2).xlsm (V4-06);
 * rebuilt 2026-11-03 against the 2026-10-23 revision (4), which populates allocation data for all
 * five fiscal years and revises twelve theoretical-capacity cells on the East London route.
 * Raw Capacity_DB columns shown as-is; derived measures recomputed with the workbook's own
 * formula pattern and labelled "derived" everywhere (formulas panel at the bottom).
 * Period discipline: figures are always labelled with their FY — never substituted across periods.
 */

const num = (v: number | string): number => (typeof v === "number" ? v : Number(v) || 0);

function sectionDerived(r: CapacityRow) {
  const theo = num(r.theoreticalDaily);
  const practical = Math.round(0.65 * theo);
  const dailyAvailable = practical - num(r.lostTSR) - num(r.lostMA) + num(r.infraRecovery) + num(r.unusedFromTOCs);
  const weeklyPractical = practical * 7;
  const weeklyAllocated = r.tocAllocated.reduce<number>((s, t) => s + num(t), 0);
  const weeklySpare = weeklyPractical - weeklyAllocated;
  return { theo, practical, dailyAvailable, weeklyPractical, weeklyAllocated, weeklySpare };
}

export default function RailCapacity() {
  const [fy, setFy] = useState("FY26/27");
  const [route, setRoute] = useState("General Freight: Johannesburg to Durban");
  const [corridors, setCorridors] = useState<Array<{ code: string; name: string }>>([]);

  useEffect(() => {
    getCorridors().then((c) => setCorridors(c.map((x) => ({ code: x.code, name: x.name })))).catch(() => setCorridors([]));
  }, []);

  const rows = useMemo(
    () => capacityDb.filter((r) => r.fy === fy && r.route === route),
    [fy, route],
  );

  const derived = useMemo(() => rows.map((r) => ({ r, d: sectionDerived(r) })), [rows]);

  const totals = useMemo(() => {
    const t = derived.reduce(
      (a, { d }) => ({
        theo: a.theo + d.theo,
        practical: a.practical + d.practical,
        weeklyPractical: a.weeklyPractical + d.weeklyPractical,
        weeklyAllocated: a.weeklyAllocated + d.weeklyAllocated,
        weeklySpare: a.weeklySpare + d.weeklySpare,
      }),
      { theo: 0, practical: 0, weeklyPractical: 0, weeklyAllocated: 0, weeklySpare: 0 },
    );
    return t;
  }, [derived]);

  const bottleneck = useMemo(() => {
    if (derived.length === 0) return null;
    const minTheo = Math.min(...derived.map(({ d }) => d.theo));
    return derived.filter(({ d }) => d.theo === minTheo).map(({ r }) => r.section || "(blank section)");
  }, [derived]);

  const headroom = useMemo(() => routeHeadroom(fy), [fy]);
  const tightest = headroom[0] ?? null;
  const yearlyStatement = useMemo(() => fyConsistencyStatement(), []);

  const hasAllocations = derived.some(
    ({ r }) => num(r.lostTSR) !== 0 || num(r.lostMA) !== 0 || r.tocAllocated.some((t) => num(t) !== 0),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Annexure 33b · Capacity Statement (V4-06)
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Slots &amp; capacity</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Section-level train path capacity by route and financial year, from the Annexure 33b Capacity_DB
            ({capacitySource.capacityDbRows} rows · {capacityRoutes.length} routes · {capacityFYs.length} FYs).
            Raw cells as delivered; derived measures recomputed with the workbook&apos;s own formula pattern and
            labelled as derived.
          </p>
        </div>
      </div>

      <ReferenceNotice />

      <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
        <b>Period discipline.</b> {capacityFYNote[fy]} — every figure on this page is labelled{" "}
        <b>{fy}</b>; values are never substituted across periods. Source:{" "}
        <code className="rounded bg-white px-1">{capacitySource.file}</code> (sha256{" "}
        {capacitySource.sha256.slice(0, 16)}…).
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-medium text-slate-600">
          Financial year{" "}
          <select
            value={fy}
            onChange={(e) => setFy(e.target.value)}
            className="ml-2 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800"
          >
            {capacityFYs.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Route{" "}
          <select
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            className="ml-2 max-w-[420px] rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800"
          >
            {capacityRoutes.map((rt) => (
              <option key={rt} value={rt}>
                {rt}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Sections", String(rows.length)],
          ["Theoretical daily (sum)", String(totals.theo)],
          ["Practical daily (derived)", String(totals.practical)],
          ["Weekly practical (derived)", String(totals.weeklyPractical)],
          ["Weekly allocated to TOCs (derived)", String(totals.weeklyAllocated)],
          ["Weekly spare (derived)", String(totals.weeklySpare)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-slate-500">
        The &quot;(sum)&quot; figures add the section rows. That is arithmetic, not route capacity, and the
        allocation totals add the same way. A train path occupies a slot on every section it
        traverses, so the ceiling is the narrowest section (see the network panel below), not the
        total of them.
      </p>

      {bottleneck && bottleneck.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <b>Bottleneck section(s) (derived: minimum theoretical daily capacity on this route/FY):</b>{" "}
          {bottleneck.join(" · ")}
        </div>
      )}

      {!hasAllocations && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <b>No allocation data for {fy} in this revision.</b> The Capacity_DB rows carry Theoretical Daily
          Capacity alone. Shown as delivered — never filled in or substituted from another period.
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table aria-label="Section capacity" className="min-w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2">Section</th>
              <th className="px-2 py-2">Depot</th>
              <th className="px-2 py-2">Theoretical daily</th>
              <th className="px-2 py-2">Practical daily (derived)</th>
              <th className="px-2 py-2">Lost TSR</th>
              <th className="px-2 py-2">Lost MA</th>
              <th className="px-2 py-2">Infra recovery</th>
              <th className="px-2 py-2">Unused from TOCs</th>
              <th className="px-2 py-2">Daily available (derived)</th>
              <th className="px-2 py-2">Weekly practical (derived)</th>
              <th className="px-2 py-2">Weekly allocated (derived)</th>
              <th className="px-2 py-2">Weekly spare (derived)</th>
              <th className="px-2 py-2">Constraint</th>
            </tr>
          </thead>
          <tbody>
            {derived.map(({ r, d }) => (
              <tr key={r.key} className="border-b border-slate-100 last:border-0">
                <td className="px-2 py-1.5 text-slate-500">{r.order}</td>
                <td className="px-2 py-1.5 font-medium text-slate-800">{r.section || <span className="text-slate-400">(blank in source)</span>}</td>
                <td className="px-2 py-1.5 text-slate-600">{r.depot}</td>
                <td className="px-2 py-1.5">{String(r.theoreticalDaily)}</td>
                <td className="px-2 py-1.5">{d.practical}</td>
                <td className="px-2 py-1.5">{String(r.lostTSR)}</td>
                <td className="px-2 py-1.5">{String(r.lostMA)}</td>
                <td className="px-2 py-1.5">{String(r.infraRecovery)}</td>
                <td className="px-2 py-1.5">{String(r.unusedFromTOCs)}</td>
                <td className="px-2 py-1.5">{d.dailyAvailable}</td>
                <td className="px-2 py-1.5">{d.weeklyPractical}</td>
                <td className="px-2 py-1.5">{d.weeklyAllocated}</td>
                <td className="px-2 py-1.5">{d.weeklySpare}</td>
                <td className="px-2 py-1.5">
                  {bottleneck?.includes(r.section || "(blank section)") ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Bottleneck</span>
                  ) : (
                    ""
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={14} className="px-3 py-6 text-center text-slate-400">
                  No sections in the Capacity_DB for this route/FY combination.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white">
        <header className="border-b border-slate-200 px-3 py-2">
          <h2 className="text-sm font-semibold text-slate-800">
            Route ceiling across the network
            <span className="ml-2 text-[11px] font-normal text-slate-500">{fy} · tightest first</span>
          </h2>
          <p className="mt-0.5 max-w-4xl text-[11px] text-slate-600">
            Each route is reduced to the section that binds it: minimum theoretical daily capacity
            among open sections, times the workbook&apos;s capacity factor ({capacitySource.capacityFactor}),
            times seven. Allocation is shown for that bottleneck section only — allocations recorded
            on other sections are not summed, because they describe different traffic over the same line.
            Sections whose depot reads &quot;(Line Closed)&quot; carry a theoretical figure that cannot be
            sold and are excluded; on every route in every year the binding section is an open one, so
            the exclusion lowers no ceiling.
          </p>
        </header>
        <div className="overflow-x-auto">
          <table aria-label="Route ceiling" className="min-w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">Route</th>
                <th className="px-3 py-2">Bottleneck section</th>
                <th className="px-3 py-2 text-right">Theo/day</th>
                <th className="px-3 py-2 text-right">Practical/day</th>
                <th className="px-3 py-2 text-right">Weekly ceiling</th>
                <th className="px-3 py-2 text-right">Allocated wk</th>
                <th className="px-3 py-2 text-right">Spare wk</th>
                <th className="px-3 py-2 text-right">Utilisation</th>
              </tr>
            </thead>
            <tbody>
              {headroom.map((h) => (
                <tr key={h.route} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-1.5 font-medium text-slate-800">
                    {h.route}
                    <span className="ml-2 text-[10px] font-normal text-slate-400">
                      {h.sections} open {h.sections === 1 ? "section" : "sections"}
                      {h.closedSections.length > 0 && (
                        <> · {h.closedSections.length} closed excluded</>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-slate-600">
                    {h.bottleneckSections.join(" · ")}
                    <span className="ml-2 text-[10px] text-slate-400">{h.bottleneckDepot}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{h.bottleneckTheoreticalDaily}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{h.routePracticalDaily}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{h.routeWeeklyPractical}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{h.bottleneckAllocated}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{h.bottleneckSpare}</td>
                  <td className="px-3 py-1.5 text-right">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
                        h.utilisationPct >= 70
                          ? "bg-rose-100 text-rose-800"
                          : h.utilisationPct >= 40
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {h.utilisationPct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-1 border-t border-slate-200 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
          {tightest && (
            <p>
              <b className="text-slate-800">Tightest route in {fy}:</b> {tightest.route} —{" "}
              {tightest.utilisationPct}% of its weekly ceiling already allocated on{" "}
              {tightest.bottleneckSections.join(" · ")}, leaving {tightest.bottleneckSpare} paths a week.
            </p>
          )}
          <p>
            <b className="text-slate-800">What the five years actually contain:</b> {yearlyStatement}
          </p>
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">Derived measures — formulas shown</h2>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            <li><code>practicalDaily = {derivedFormulas.practicalDaily}</code></li>
            <li><code>dailyAvailable = {derivedFormulas.dailyAvailable}</code></li>
            <li><code>weeklyPractical = {derivedFormulas.weeklyPractical}</code></li>
            <li><code>weeklyAllocated = {derivedFormulas.weeklyAllocated}</code></li>
            <li><code>weeklySpare = {derivedFormulas.weeklySpare}</code></li>
          </ul>
          <p className="mt-2 text-[11px] text-slate-500">
            The practical-daily formula was verified against all sampled rows of the workbook&apos;s own
            &quot;Capacity Statement&quot; view (Capacity Factor {workbookSnapshot.capacityFactor}). Bottleneck
            marking is derived (minimum theoretical daily capacity). In the 2026-10-23 revision the
            workbook now fills its own &quot;Bottleneck Section(s)&quot; cell for the saved selection; the
            &quot;Constraint Indicator&quot; column is still blank in the file.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">Workbook snapshot — as delivered</h2>
          <p className="mt-1 text-xs text-slate-600">
            The &quot;Capacity Statement&quot; sheet was saved in the file with this selection state: FY{" "}
            <b>{workbookSnapshot.selectedFY}</b> · route <b>{workbookSnapshot.selectedRoute}</b> · Capacity
            Factor <b>{workbookSnapshot.capacityFactor}</b> · Route Spare Capacity{" "}
            <b>{workbookSnapshot.routeSpareCapacity}</b> · Bottleneck Section(s):{" "}
            {workbookSnapshot.bottleneckSections || "(empty in source)"}.
          </p>
          <p className="mt-2 text-[11px] text-slate-500">
            {workbookSnapshot.note} The snapshot holds {workbookSnapshot.rows.length} section rows for its saved
            selection; use the selectors above to browse the full Capacity_DB (all routes × all FYs).
          </p>
          <p className="mt-2 text-[11px] text-teal-700">
            Allocation columns (TSR / MA / infrastructure recovery / unused-from-TOC / TOC 1–15) are populated for
            all five fiscal years in the 2026-10-23 revision, retiring the former E-33B-01 sparse-cell caveat.
          </p>
        </div>

        {/* The operator's own position — the half of slot allocation that the
            published workbook cannot tell you, because it is about you. */}
        <CorridorCapacityPanel corridors={corridors} />
      </div>
    </div>
  );
}
