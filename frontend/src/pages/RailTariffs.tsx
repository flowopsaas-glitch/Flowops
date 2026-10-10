import React, { useMemo, useState } from "react";
import {
  ancillaryCatalogue,
  ancillaryCounts,
  ancillarySource,
  type AncillaryGroup,
} from "../data/railAncillaryData";
import {
  accessFeeTable,
  additionalCharges,
  chargingPrinciples,
  furtherKpis,
  invoicingRules,
  marshallingCharges,
  penaltyRegime,
  statementSource,
} from "../data/railStatementData";

/**
 * Tariffs & Charges page — round 68 built the Annexexure 40 catalogue browser; round 70 added
 * the approved 2026/27 access tariffs from Network Statement V4 Table 17 (effective 1 Aug 2026)
 * plus application fees, invoicing rules and the penalty regime (Tables 18–22).
 * Rates and quotations verbatim; source quirks preserved.
 */

function GroupCard({ group, tier }: { group: AncillaryGroup; tier: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-2">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
          {tier}
        </span>
        <h3 className="text-sm font-semibold text-slate-800">
          {group.n}. {group.name}
        </h3>
      </div>
      <ul className="mt-2 space-y-2">
        {group.items.map((it, i) => (
          <li key={i} className="border-t border-slate-100 pt-2 first:border-0 first:pt-0">
            {it.name && <p className="text-xs font-medium text-slate-800">{it.name}</p>}
            <p className="mt-0.5 text-xs text-slate-600">{it.description}</p>
            <p className="mt-1 inline-flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-full bg-teal-50 px-2 py-0.5 font-medium text-teal-800">
                UOM: {it.uom}
              </span>
              {it.uom === "TBD" && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
                  TBD in source — preserved
                </span>
              )}
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">
                Ancillary rate: not yet published
              </span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function RailTariffs() {
  const [tab, setTab] = useState<"access" | "ancillary">("access");
  const [tierFilter, setTierFilter] = useState<string>("All");
  const [query, setQuery] = useState("");

  const tiers = useMemo(() => ["All", ...ancillaryCatalogue.map((t) => t.tier)], []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ancillaryCatalogue
      .filter((t) => tierFilter === "All" || t.tier === tierFilter)
      .map((t) => ({
        ...t,
        groups: t.groups.filter((g) => {
          if (!q) return true;
          const hay = [g.name, String(g.n), ...g.items.flatMap((i) => [i.name ?? "", i.description, i.uom])]
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        }),
      }))
      .filter((t) => t.groups.length > 0);
  }, [tierFilter, query]);

  const totalGroups = filtered.reduce((n, t) => n + t.groups.length, 0);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          NS V4 §5.2 · Annexexure 40 · Fees, charges &amp; penalties
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Tariffs &amp; charges</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          The approved 2026/27 rail access tariffs (Network Statement V4, Table 17), application
          fees, invoicing rules, the penalty regime, and the ancillary services catalogue.
        </p>
      </div>

      <div className="flex gap-2">
        {(
          [
            ["access", "Access fees & charges (NS V4 Table 17–22)"],
            ["ancillary", "Ancillary catalogue (Annexure 40)"],
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

      {tab === "access" && (
        <>
          <div className="rounded-xl border border-teal-300 bg-teal-50 p-3 text-xs text-teal-900">
            <b>E-TARIFF-01 status (updated round 70):</b> the approved <b>access</b> tariffs ARE
            published — Network Statement V4, {accessFeeTable.tableLabel}, effective{" "}
            {accessFeeTable.appliesFrom}. <b>Ancillary</b> service rates remain unpriced: the
            Annexexure 40 catalogue defines services and units of measure only, and NS §5.2.7 says
            the applicable charging framework for ancillary services "will be incorporated in the
            future version of the Network Statement" (Table 18 marshalling charges are "indicative").
            Nothing is estimated here. Source:{" "}
            <code className="rounded bg-white px-1">{statementSource.file}</code> (sha256{" "}
            {statementSource.sha256.slice(0, 16)}…).
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2 text-right">Tariff per Trainkm (Rand)</th>
                  <th className="px-3 py-2 text-right">Tariff per GTK (cents)</th>
                </tr>
              </thead>
              <tbody>
                {accessFeeTable.rows.map((r) => (
                  <tr key={r.category} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-1.5 font-medium text-slate-800">
                      {r.category.endsWith("*") ? (
                        <>
                          {r.category.slice(0, -1)}
                          <sup className="text-slate-400">*</sup>
                        </>
                      ) : (
                        r.category
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{r.trainKmRand}</td>
                    <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{r.gtkCents}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
              <b>{accessFeeTable.tableLabel}</b> — applies from {accessFeeTable.appliesFrom}; will be
              amended to coincide with the TRIM&apos;s financial reporting and planning cycle
              (1 April – 31 March) or as determined by the IRERC or TER.
              {accessFeeTable.notes.map((n) => (
                <p key={n} className="mt-1">
                  {n}
                </p>
              ))}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-800">Application &amp; additional charges (Table 20)</h2>
              <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
                {additionalCharges.applicationFee.map((n, i) => (
                  <li key={i} className="border-l-2 border-teal-200 pl-2">{n}</li>
                ))}
              </ul>
              <h3 className="mt-3 text-sm font-semibold text-slate-800">Traction electricity</h3>
              <p className="mt-1 text-xs text-slate-600">{additionalCharges.tractionElectricity}</p>
              <h3 className="mt-3 text-sm font-semibold text-slate-800">Occurrence management (Table 19)</h3>
              <p className="mt-1 text-xs text-slate-600">{additionalCharges.occurrenceManagement}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-800">Invoicing &amp; payment (5.2.4–5.2.5)</h2>
              <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
                {invoicingRules.map((n, i) => (
                  <li key={i} className="border-l-2 border-teal-200 pl-2">{n}</li>
                ))}
              </ul>
              <h3 className="mt-3 text-sm font-semibold text-slate-800">{marshallingCharges.label}</h3>
              <p className="mt-1 text-xs text-slate-600">{marshallingCharges.principle}</p>
              <ul className="mt-1 list-inside list-disc text-xs text-slate-600">
                {marshallingCharges.categories.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-amber-700">{marshallingCharges.note}</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-800">Penalties (Tables 21–22) &amp; framework status</h2>
            <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{penaltyRegime.frameworkStatus}</p>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold text-slate-800">{penaltyRegime.trimPenalties.label}</h3>
                <ul className="mt-1 space-y-1 text-xs text-slate-600">
                  {penaltyRegime.trimPenalties.items.map((n, i) => (
                    <li key={i} className="border-l-2 border-rose-200 pl-2">{n}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-slate-800">{penaltyRegime.accessSeekerPenalties.label}</h3>
                <ul className="mt-1 space-y-1 text-xs text-slate-600">
                  {penaltyRegime.accessSeekerPenalties.items.map((n, i) => (
                    <li key={i} className="border-l-2 border-amber-200 pl-2">{n}</li>
                  ))}
                </ul>
              </div>
            </div>
            <h3 className="mt-3 text-xs font-semibold text-slate-800">
              Additional charge events (5.2.11)
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              {penaltyRegime.additionalChargeEvents.join(" · ")}.
            </p>
            <p className="mt-1 text-xs text-slate-600">{penaltyRegime.yardUsageFormula}</p>
            <p className="mt-1 text-[11px] text-slate-500">{penaltyRegime.forceMajeure}</p>
            <p className="mt-2 text-[11px] text-slate-500">
              {furtherKpis.label} and the KPI pipeline live on{" "}
              <a className="underline" href="/rail/kpis">
                Corridor KPIs
              </a>
              .
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-800">Charging principles &amp; tariff determination (5.2.1)</h2>
            <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
              {chargingPrinciples.map((n, i) => (
                <li key={i} className="border-l-2 border-teal-200 pl-2">{n}</li>
              ))}
            </ul>
          </div>
        </>
      )}

      {tab === "ancillary" && (
        <>
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <b>E-TARIFF-01 · ancillary rates gap (open).</b> {ancillarySource.ratesStatus} NS V4
            §5.2.7: the applicable charging framework for these services "will be incorporated in
            the future version of the Network Statement". Every service below shows{" "}
            <span className="rounded-full bg-white px-1.5 py-0.5">Ancillary rate: not yet published</span>{" "}
            — nothing is estimated. Source:{" "}
            <code className="rounded bg-white px-1">{ancillarySource.file}</code> (
            {ancillarySource.pages} pages · sha256 {ancillarySource.sha256.slice(0, 16)}… · period
            label &quot;{ancillarySource.periodLabel}&quot;).
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {tiers.map((t) => (
              <button
                key={t}
                onClick={() => setTierFilter(t)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  tierFilter === t
                    ? "bg-teal-700 text-white"
                    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {t === "All" ? "All tiers" : t}
              </button>
            ))}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search services, descriptions, units…"
              className="ml-2 w-72 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
            <span className="text-xs text-slate-500">{totalGroups} groups shown</span>
          </div>

          {filtered.map((t) => (
            <div key={t.tier} className="space-y-3">
              <div>
                <h2 className="text-base font-semibold text-slate-800">{t.tier}</h2>
                <p className="text-xs text-slate-600">{t.title}</p>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {t.groups.map((g) => (
                  <GroupCard key={g.n} group={g} tier={t.tier} />
                ))}
              </div>
            </div>
          ))}

          {totalGroups === 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
              No catalogue entries match this filter.
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
            <b className="text-slate-800">Verbatim &amp; anomaly policy.</b> Two source UOM cells read
            &quot;TBD&quot; (items 34 and 40) — preserved as delivered. Item 3&apos;s source UOM carries
            an unbalanced parenthesis (&quot;Per Radio (monthly subscription))&quot;) — kept as delivered.
            &quot;List of Yards.xlsx&quot; and &quot;List of Terminals.xlsx&quot; are attachments named by
            the catalogue but not included in the delivered PDF.
          </div>
        </>
      )}
    </div>
  );
}
