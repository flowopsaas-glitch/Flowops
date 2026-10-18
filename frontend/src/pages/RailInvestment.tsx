import React from "react";
import ReferenceNotice from "./rail/ReferenceNotice";
import {
  corridorCopex,
  corridorCopexNote,
  expansionInitiatives,
  investmentCategories,
  investmentDefinitions,
  investmentProgrammes,
  investmentSource,
  investmentYears,
  supplementaryFunding,
} from "../data/railInvestmentData";

/**
 * Investment Plan page — built round 69 from Annexure 17 (Investment Plan, July 2026).
 * All figures verbatim in R'bn; "PSP" / "–" preserved as printed.
 */

function YearTable({
  title,
  rows,
  note,
}: {
  title: string;
  rows: Array<{ name: string; values: string[]; total: string }>;
  note?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      <div className="mt-2 overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="py-1.5 pr-2">Category (R billion)</th>
              {investmentYears.map((y) => (
                <th key={y} className="px-2 py-1.5 text-right">{y}</th>
              ))}
              <th className="px-2 py-1.5 text-right">Total 5-year</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-b border-slate-100 last:border-0">
                <td className="py-1.5 pr-2 font-medium text-slate-700">{r.name}</td>
                {r.values.map((v, i) => (
                  <td key={i} className="px-2 py-1.5 text-right tabular-nums">
                    {v === "PSP" ? (
                      <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">PSP</span>
                    ) : (
                      v
                    )}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <p className="mt-2 text-[11px] text-slate-500">{note}</p>}
    </div>
  );
}

export default function RailInvestment() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Annexure 17 · Investment Plan (July 2026)
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Investment plan</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          {investmentSource.title}. Horizon: {investmentSource.horizon}. All amounts in{" "}
          {investmentSource.unit}.
        </p>
      </div>

      <ReferenceNotice />

      <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
        <b>Total approved capital investment (2026/27 – 2030/31): R 46.343 billion</b> — R 32.724bn
        capitalised operating expenditure · R 11.914bn sustaining · R 1.705bn expansionary.
        Period discipline: figures are labelled with their financial year and never substituted
        across periods. {investmentSource.roundingNote}
      </div>

      <YearTable title="1. Approved capital investment summary" rows={investmentCategories} />
      <YearTable title="2. Key programmes and line items" rows={investmentProgrammes} />
      <YearTable
        title="3. Corridor breakdown of infrastructure COPEX"
        rows={corridorCopex}
        note={corridorCopexNote}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">
            5. Supplementary funding mechanisms and investment acceleration
          </h2>
          <ul className="mt-2 space-y-2 text-xs text-slate-600">
            {supplementaryFunding.map((f, i) => (
              <li key={i} className="border-l-2 border-teal-200 pl-2">{f}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">7. Definitions</h2>
          <dl className="mt-2 space-y-2 text-xs">
            {investmentDefinitions.map((d) => (
              <div key={d.term}>
                <dt className="font-semibold text-slate-800">{d.term}</dt>
                <dd className="text-slate-600">{d.meaning}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-800">6. Expansion capital plan — key strategic initiatives</h2>
        <div className="mt-2 grid gap-3 lg:grid-cols-2">
          {expansionInitiatives.map((e) => (
            <div key={e.name} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-800">
                {e.code && <span className="mr-1 rounded bg-white px-1.5 py-0.5 font-mono text-[10px]">{e.code}</span>}
                {e.name}
              </p>
              <p className="mt-1 text-xs text-slate-600">{e.scope}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Context (as delivered): the expansion projects reflect the current TRIM Expansion Programme
          pipeline based on the current allocated funding plan, to be executed over the next five
          years. Programme funds will also be supplemented by the private sector at a business case
          level.
        </p>
      </div>

      <p className="text-[11px] text-slate-500">
        Source: <code className="rounded bg-slate-100 px-1">{investmentSource.file}</code> · sha256{" "}
        {investmentSource.sha256.slice(0, 16)}… · {investmentSource.pages} pages ·{" "}
        {investmentSource.author}.
      </p>
    </div>
  );
}
