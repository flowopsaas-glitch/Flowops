import React, { useState } from "react";
import {
  annexureRegister,
  capacityFrameworkNotes,
  chargingPrinciples,
  legalFramework,
  statementChapters,
  statementSource,
} from "../data/railStatementData";

/**
 * Network Statement page — built round 70 from the NS V4 body (203 pages).
 * Chapter map, annexure register (have/want) and the governing framework notes.
 * The money tables (17–23) live on /rail/tariffs; annexure content lives on its own pages.
 */

export default function RailStatement() {
  const [open, setOpen] = useState<string>("4");
  const [onlyWanted, setOnlyWanted] = useState(false);

  const have = annexureRegister.filter((a) => a.have).length;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Network Statement V4 · September 2026 (V4-01)
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Network statement</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          {statementSource.title} — the governing rulebook behind every annexure in this product.
          {statementSource.pages} pages · 7 chapters · {annexureRegister.length} annexures, of which{" "}
          <b>{have}</b> are delivered into this product. {statementSource.prefaceNote}
        </p>
      </div>

      <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
        <b>The money is in the statement.</b> Chapter 5.2 carries the approved 2026/27 access
        tariffs (Table 17, effective 1 August 2026), the application fees (R125 000 freight /
        R42 000 passenger per Train Path) and the penalty regime — all live on{" "}
        <a className="font-semibold underline" href="/rail/tariffs">
          Tariffs &amp; charges
        </a>
        . Source: <code className="rounded bg-white px-1">{statementSource.file}</code> · sha256{" "}
        {statementSource.sha256.slice(0, 16)}… · {statementSource.author}.
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Chapters</h2>
          <div className="mt-2 space-y-2">
            {statementChapters.map((c) => {
              const isOpen = open === c.n;
              return (
                <div key={c.n} className="rounded-xl border border-slate-200 bg-white">
                  <button
                    onClick={() => setOpen(isOpen ? "" : c.n)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <span className="text-sm font-semibold text-slate-800">
                      Chapter {c.n} — {c.title}
                    </span>
                    <span className="text-[11px] text-slate-400">p{c.pages}</span>
                  </button>
                  {isOpen && (
                    <ul className="border-t border-slate-100 px-4 py-2 text-xs text-slate-600">
                      {c.sections.map((s) => (
                        <li key={s} className="py-0.5">
                          {s}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-800">
            2026/27 annexure register — delivered vs wanted
          </h2>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={onlyWanted}
              onChange={(e) => setOnlyWanted(e.target.checked)}
              className="rounded border-slate-300"
            />
            Show only not-yet-delivered annexures
          </label>
          <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-2 py-1.5">Ch.</th>
                  <th className="px-2 py-1.5">Annexure</th>
                  <th className="px-2 py-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {annexureRegister
                  .filter((a) => !onlyWanted || !a.have)
                  .map((a) => (
                    <tr key={a.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-2 py-1.5 text-slate-400">{a.chapter}</td>
                      <td className="px-2 py-1.5">
                        <span className="font-semibold text-slate-700">{a.id}:</span> {a.title}
                        {a.note && <p className="mt-0.5 text-[10px] text-slate-400">{a.note}</p>}
                      </td>
                      <td className="px-2 py-1.5">
                        {a.have ? (
                          <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-800">
                            delivered
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                            wanted
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">
            Capacity framework (Chapter 4) — how the corpus fits
          </h2>
          <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
            {capacityFrameworkNotes.map((n, i) => (
              <li key={i} className="border-l-2 border-teal-200 pl-2">
                {n}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">Charging &amp; tariff determination (5.2.1)</h2>
          <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
            {chargingPrinciples.map((n, i) => (
              <li key={i} className="border-l-2 border-teal-200 pl-2">
                {n}
              </li>
            ))}
          </ul>
          <h3 className="mt-4 text-sm font-semibold text-slate-800">Legal framework</h3>
          <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
            {legalFramework.map((n, i) => (
              <li key={i} className="border-l-2 border-slate-200 pl-2">
                {n}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
