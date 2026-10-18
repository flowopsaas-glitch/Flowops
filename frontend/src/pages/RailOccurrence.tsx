import React, { useMemo, useState } from "react";
import ReferenceNotice from "./rail/ReferenceNotice";
import {
  collabPolicyPoints,
  collabPolicySource,
  loadingProfileSource,
  occurrenceCategories,
  occurrenceCostRows,
  occurrenceRoleActivities,
  occurrenceRolesSource,
  occurrenceSource,
  occurrenceSourceQuirk,
  occurrenceTheftCostRows,
  reportingTimelines,
  type OccCategory,
  type RoleRow,
} from "../data/railOccurrenceData";

/**
 * Occurrence & Policy page — built round 69 from Annexure 41 (Occurrence Reporting Procedure)
 * and Annexure 42 (Customer Collaboration Policy). Category letters, items and Y/N flags are
 * verbatim; the "CATEGORY 0" source quirk (E-ANX41-01) is preserved. Round 73 added Annexure 18
 * (Roles and Responsibilities during Occurrence Management — V3-era) and Annexure 22 (Loading
 * Profiles = RSE/TE/LPR/0010 Rev 6 ore-loading specification).
 */

function RoleTable({ rows }: { rows: RoleRow[] }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full text-left text-xs">
        <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Activity</th>
            <th className="px-3 py-2">TOC&apos;s derailment</th>
            <th className="px-3 py-2">TOC&apos;s Level X</th>
            <th className="px-3 py-2">Collision: TOC ↔ TOC</th>
            <th className="px-3 py-2">Collision: TOC ↔ TFR Ops</th>
            <th className="px-3 py-2">Interface agreement</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.n} className="border-b border-slate-100 last:border-0">
              <td className="px-3 py-1.5 font-semibold tabular-nums text-slate-400">{r.n}</td>
              <td className="px-3 py-1.5 font-medium text-slate-800">{r.activity}</td>
              <td className="px-3 py-1.5 text-slate-600">{r.c1}</td>
              <td className="px-3 py-1.5 text-slate-600">{r.c2}</td>
              <td className="px-3 py-1.5 text-slate-600">{r.c3}</td>
              <td className="px-3 py-1.5 text-slate-600">{r.c4}</td>
              <td className="px-3 py-1.5 text-slate-500">{r.iface}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
  const [tab, setTab] = useState<"occurrence" | "policy" | "roles" | "loading">("occurrence");
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
          Annexure 18 · 22 · 41 &amp; 42 · Occurrence management · Loading · Policy
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Occurrence &amp; policy</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          RSR reportable occurrence categories with who reports what (TRIM / TOC), the statutory
          reporting timelines, occurrence roles &amp; cost accountability (18), ore loading profiles
          (22), and the Transnet Customer Collaboration Policy.
        </p>
      </div>

      <ReferenceNotice />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Occurrence and policy reference sections">
        {(
          [
            ["occurrence", "Occurrence reporting (Annexure 41)"],
            ["roles", "Roles & costs (Annexure 18)"],
            ["loading", "Loading profiles (Annexure 22)"],
            ["policy", "Collaboration policy (Annexure 42)"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={tab === k}
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

          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter occurrence categories by group">
            {groups.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={group === g}
                onClick={() => setGroup(g)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  group === g ? "bg-teal-700 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {g === "All" ? "All categories" : g}
              </button>
            ))}
            <input
              aria-label="Search occurrence items"
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
          {filtered.length === 0 && (
            <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
              No occurrence categories match the selected group and search.
            </p>
          )}

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

      {tab === "roles" && (
        <>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <b>E-ANX18-00 period caveat (preserved).</b> {occurrenceRolesSource.caveat}{" "}
            {occurrenceRolesSource.footnote}. Slash-pair cells in rows 1 and 17 (E-ANX18-01 /
            E-ANX18-02) are recovered from the PDF text layer and kept as printed — never
            normalised.
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              Table 1.1.1.1 — Responsibilities for key activities in Occurrence Management
            </h2>
            <p className="mt-1 text-[11px] text-slate-500">
              Scenario columns: {occurrenceRolesSource.scenarioCols.join(" · ")} — plus{" "}
              {occurrenceRolesSource.interfaceCol}.
            </p>
            <RoleTable rows={occurrenceRoleActivities} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              Table 1.1.1.2 — Accountability for costs if the TOC is found negligent
            </h2>
            <RoleTable rows={occurrenceCostRows} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              Table 1.1.1.3 — Costs if occurrence is caused by theft, vandalism, and force majeure
              (investigation to be conducted)
            </h2>
            <RoleTable rows={occurrenceTheftCostRows} />
          </div>
          <p className="text-[11px] text-slate-500">
            Source: <code className="rounded bg-slate-100 px-1">{occurrenceRolesSource.file}</code>{" "}
            · sha256 {occurrenceRolesSource.sha256.slice(0, 16)}… · {occurrenceRolesSource.pages}{" "}
            pages · {occurrenceRolesSource.title}.
          </p>
        </>
      )}

      {tab === "loading" && (
        <>
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
            <b>{loadingProfileSource.header}</b> — {loadingProfileSource.intro}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-800">
                Product densities (Table: Product / Density)
              </h2>
              <table className="mt-2 w-full text-left text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-slate-400">
                    <th className="py-1 pr-2">Product</th>
                    <th className="px-2 py-1">Density</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingProfileSource.products.map((p) => (
                    <tr key={p.product} className="border-t border-slate-100">
                      <td className="py-1 pr-2 font-medium text-slate-800">{p.product}</td>
                      <td className="px-2 py-1 text-slate-600">{p.density}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-slate-600">
                <b className="text-slate-800">Wagon requirements:</b>{" "}
                {loadingProfileSource.wagonTypes}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-800">
                Payload distribution &amp; safety limits
              </h2>
              <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
                {loadingProfileSource.limits.map((l) => (
                  <li key={l} className="border-l-2 border-teal-200 pl-2">{l}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-800">Shunting operations</h2>
              <p className="mt-1 text-xs text-slate-600">{loadingProfileSource.shunting}</p>
              <h3 className="mt-3 text-sm font-semibold text-slate-800">Figures (as printed)</h3>
              <ul className="mt-1 list-inside list-disc text-xs text-slate-600">
                {loadingProfileSource.figureNotes.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-800">
                Customer co-operation &amp; amendment
              </h2>
              <ul className="mt-1 space-y-1.5 text-xs text-slate-600">
                {loadingProfileSource.customer.map((c) => (
                  <li key={c} className="border-l-2 border-amber-200 pl-2">{c}</li>
                ))}
              </ul>
              <h3 className="mt-3 text-sm font-semibold text-slate-800">
                Schedule of amendments (as printed)
              </h3>
              <ul className="mt-1 list-inside list-disc text-[11px] text-slate-500">
                {loadingProfileSource.amendments.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
            <b>E-ANX22-01 (preserved).</b> Filename &quot;Loading Profiles&quot; vs printed document
            {loadingProfileSource.docNo} Rev {loadingProfileSource.revision} loading specification;
            amendments numbered 1–5 under &quot;Revision: 6&quot;. {loadingProfileSource.caveat}
          </div>
          <p className="text-[11px] text-slate-500">
            Source: <code className="rounded bg-slate-100 px-1">{loadingProfileSource.file}</code> ·
            sha256 {loadingProfileSource.sha256.slice(0, 16)}… · {loadingProfileSource.pages} pages.
          </p>
        </>
      )}
    </div>
  );
}
