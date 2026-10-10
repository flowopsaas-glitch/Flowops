import React, { useMemo, useState } from "react";
import {
  collabPolicyPoints,
  collabPolicySource,
  occurrenceCategories,
  occurrenceSource,
  occurrenceSourceQuirk,
  reportingTimelines,
  type OccCategory,
} from "../data/railOccurrenceData";

/**
 * Occurrence & Policy page — built round 69 from Annexure 41 (Occurrence Reporting Procedure)
 * and Annexure 42 (Customer Collaboration Policy). Category letters, items and Y/N flags are
 * verbatim; the "CATEGORY 0" source quirk (E-ANX41-01) is preserved.
 */

function TimelinePanel() {
  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
      <b>Reporting timelines (RSR) — as delivered.</b>
      <ul className="mt-2 space-y-1.5">
        {reportingTimelines.map((t) => (
          <li key={t.rule}>
            <b>{t.rule}:</b> {t.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CategoryCard({ c }: { c: OccCategory }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-2">
        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-white">
          {c.id}
        </span>
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{c.title}</h3>
          <p className="text-[10px] uppercase tracking-wider text-slate-400">{c.group}</p>
        </div>
      </div>
      <table className="mt-2 w-full text-left text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-slate-400">
            <th className="py-1 pr-2">Item</th>
            <th className="px-2 py-1 text-center">TRIM</th>
            <th className="px-2 py-1 text-center">TOC</th>
          </tr>
        </thead>
        <tbody>
          {c.items.map((it) => (
            <tr key={it.ref} className="border-t border-slate-100">
              <td className="py-1 pr-2 text-slate-600">
                <span className="mr-1 font-semibold text-slate-400">{it.ref}</span>
                {it.item}
              </td>
              <td className={`px-2 py-1 text-center font-semibold ${it.trim === "Y" ? "text-teal-700" : "text-slate-400"}`}>
                {it.trim}
              </td>
              <td className={`px-2 py-1 text-center font-semibold ${it.toc === "Y" ? "text-teal-700" : "text-slate-400"}`}>
                {it.toc}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RailOccurrence() {
  const [tab, setTab] = useState<"occurrence" | "policy">("occurrence");
  const [group, setGroup] = useState("All");
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const gs = Array.from(new Set(occurrenceCategories.map((c) => c.group)));
    return ["All", ...gs];
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return occurrenceCategories
      .filter((c) => group === "All" || c.group === group)
      .filter((c) => {
        if (!q) return true;
        const hay = [c.id, c.title, ...c.items.map((i) => i.item)].join(" ").toLowerCase();
        return hay.includes(q);
      });
  }, [group, query]);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Annexure 41 &amp; 42 · Occurrence reporting · Customer collaboration
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Occurrence &amp; policy</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          RSR reportable occurrence categories with who reports what (TRIM / TOC), the statutory
          reporting timelines, and the Transnet Customer Collaboration Policy.
        </p>
      </div>

      <div className="flex gap-2">
        {(
          [
            ["occurrence", "Occurrence reporting (Annexure 41)"],
            ["policy", "Collaboration policy (Annexure 42)"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium ${
              tab === k ? "bg-teal-700 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "occurrence" && (
        <>
          <TimelinePanel />

          <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
            <b className="text-slate-800">TO BE REPORTED BY (as delivered).</b> Every category item
            below carries its TRIM / TOC responsibility flags exactly as printed in Annexure 41
            (Y = reports, N = does not). {occurrenceSourceQuirk} Template:{" "}
            {occurrenceSource.template}.
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {groups.map((g) => (
              <button
                key={g}
                onClick={() => setGroup(g)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  group === g ? "bg-teal-700 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {g === "All" ? "All categories" : g}
              </button>
            ))}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search occurrence items…"
              className="ml-2 w-72 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
            <span className="text-xs text-slate-500">{filtered.length} categories shown</span>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {filtered.map((c) => (
              <CategoryCard key={c.group + c.id} c={c} />
            ))}
          </div>

          <p className="text-[11px] text-slate-500">
            Source: <code className="rounded bg-slate-100 px-1">{occurrenceSource.file}</code> · sha256{" "}
            {occurrenceSource.sha256.slice(0, 16)}… · {occurrenceSource.pages} pages ·{" "}
            {occurrenceSource.author}. Daily Occurrence Report tables referenced (Tables 1, 2, 3 and 5)
            are defined in the source document.
          </p>
        </>
      )}

      {tab === "policy" && (
        <>
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
            <b>
              Transnet SOC Ltd: Customer Collaboration Policy — {collabPolicySource.docDate}.
            </b>{" "}
            Owner: {collabPolicySource.owner} · Effective date: {collabPolicySource.effectiveDate} ·
            Version {collabPolicySource.version} · Review cycle: {collabPolicySource.reviewCycle}.
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-800">Policy framework — key points</h2>
            <ul className="mt-2 space-y-2 text-xs text-slate-600">
              {collabPolicyPoints.map((p, i) => (
                <li key={i} className="border-l-2 border-teal-200 pl-2">{p}</li>
              ))}
            </ul>
          </div>

          <p className="text-[11px] text-slate-500">
            Source: <code className="rounded bg-slate-100 px-1">{collabPolicySource.file}</code> ·
            sha256 {collabPolicySource.sha256.slice(0, 16)}… · {collabPolicySource.pages} pages ·{" "}
            {collabPolicySource.author}.
          </p>
        </>
      )}
    </div>
  );
}
