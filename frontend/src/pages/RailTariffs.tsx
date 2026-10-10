import React, { useMemo, useState } from "react";
import {
  ancillaryCatalogue,
  ancillaryCounts,
  ancillarySource,
  type AncillaryGroup,
} from "../data/railAncillaryData";

/**
 * Tariffs & Charges page — built round 68 from Annexexure 40 (V4-07), the Ancillary Services
 * Catalogue 2026/27. Catalogue entries + units of measure are verbatim. The delivered catalogue
 * contains NO rates — the rates gap (E-TARIFF-01) is stated honestly on the page.
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
            <p className="mt-1 inline-flex items-center gap-2 text-[11px]">
              <span className="rounded-full bg-teal-50 px-2 py-0.5 font-medium text-teal-800">
                UOM: {it.uom}
              </span>
              {it.uom === "TBD" && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
                  TBD in source — preserved
                </span>
              )}
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">
                Rate: not in catalogue
              </span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function RailTariffs() {
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
          const hay = [
            g.name,
            String(g.n),
            ...g.items.flatMap((i) => [i.name ?? "", i.description, i.uom]),
          ]
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
          Annexexure 40 · Ancillary Services Catalogue 2026/27 (V4-07)
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Tariffs &amp; charges</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          The delivered ancillary services catalogue: {ancillaryCounts.groups} service groups across{" "}
          {ancillaryCounts.tiers} tiers ({ancillaryCounts.items} line items), with unit of measure for every
          service. Service names, descriptions and units of measure are verbatim from the source.
        </p>
      </div>

      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
        <b>E-TARIFF-01 · rates gap (open).</b> {ancillarySource.ratesStatus} Every service below shows
        &quot;Rate: not in catalogue&quot; — rates must come from the approved ancillary tariff schedule once
        delivered; nothing is estimated or filled in here. Source:{" "}
        <code className="rounded bg-white px-1">{ancillarySource.file}</code> ({ancillarySource.pages} pages ·
        sha256 {ancillarySource.sha256.slice(0, 16)}… · period label &quot;{ancillarySource.periodLabel}&quot;).
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
        &quot;TBD&quot; (items 34 Future Digital Telecommunication Services and 40 Staging) — preserved as
        delivered and flagged, never normalised. Item 3&apos;s source UOM carries an unbalanced parenthesis
        (&quot;Per Radio (monthly subscription))&quot;) — kept as delivered. Cross-references to
        &quot;List of Yards.xlsx&quot; and &quot;List of Terminals.xlsx&quot; inside items 1–2 are attachments named
        by the catalogue but not included in the delivered PDF (recorded as a source gap).
      </div>
    </div>
  );
}
