import React, { useMemo, useState } from "react";
import {
  cancellationDecisions,
  cancellationExit,
  cancellationLanes,
  cancellationReasons,
  cancellationSource,
  cancellationSteps,
  cancellationSystems,
  clearinghouse,
} from "../data/railCancellationData";

/**
 * Cancellations page — built round 71 from Annexure 20a (Cancel or Re-Plan/Re-Schedule TOC Train
 * Process v4) and Annexure 20b (Cancellation reasons v1.3). Process steps and reason rows are
 * transcribed/verbatim; version history and the TFR-confidential sign-off marker preserved.
 * Round 73 added Annexure 21 (Clearinghouse Process Narrative v5) — the reason-allocation and
 * dispute layer over 20a/20b.
 */

const PARTY_STYLES: Record<string, string> = {
  "Rail Operations": "bg-sky-50 text-sky-800",
  "Infrastructure Manager": "bg-teal-50 text-teal-800",
  "Force Majeure": "bg-rose-50 text-rose-800",
};

export default function RailCancellation() {
  const [query, setQuery] = useState("");
  const [party, setParty] = useState("All");

  const parties = useMemo(() => {
    const ps = Array.from(new Set(cancellationReasons.map((r) => r.party)));
    return ["All", ...ps];
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cancellationReasons.filter((r) => {
      if (party !== "All" && r.party !== party) return false;
      if (!q) return true;
      return (r.reason + " " + r.party).toLowerCase().includes(q);
    });
  }, [query, party]);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Annexure 20a &amp; 20b · Cancellation process &amp; reasons
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Cancellations</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          {cancellationSource.title20a} — the governed process for cancelling, re-planning and
          re-scheduling TOC trains, and {cancellationSource.title20b.toLowerCase()} — the
          reason-to-responsibility allocation used to attribute cancellations.
        </p>
      </div>

      <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
        <b>The 15-minute rule (step 1, verbatim substance).</b> The cancellation notice must be
        issued <b>within 15 minutes</b> of the event&apos;s occurrence or as soon as it is discovered
        that there will be a TOC Mainline Slot Compromise due to incidents, operational issues, or
        resource constraints. Authorised TOC personnel must contact the IM Customer Liaison Officer
        directly and the request must also be submitted via <b>TOL</b> (systems:{" "}
        {cancellationSystems}). Process exit: <b>TOC Charges and Penalties Process</b> — see{" "}
        <a className="font-semibold underline" href="/rail/tariffs">
          Tariffs &amp; charges
        </a>{" "}
        (Tables 21–22, §5.2.11).
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">Who can request a cancellation</h2>
          <p className="mt-1 text-xs text-slate-600">
            Five request lanes feed the process (steps 1–5): TOC (with reasons, via TOL + direct
            contact), Yard Operator (on behalf of IM), TRIM (any TRIM department incl. Asset
            Maintenance &amp; Management, Security, Network Service Planning, Network Operations,
            Safety), TPT / Port Terminal Operator, and PRASA Over-Border IM / Other IM. Full lane
            set: {cancellationLanes.join(" · ")}.
          </p>
          <h3 className="mt-3 text-sm font-semibold text-slate-800">Decision gates</h3>
          <ul className="mt-1 space-y-1.5 text-xs text-slate-600">
            {cancellationDecisions.map((d) => (
              <li key={d.question} className="border-l-2 border-amber-200 pl-2">
                <b>{d.question}</b> — {d.note}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">Version history (as printed)</h2>
          <ul className="mt-1 list-inside list-disc text-xs text-slate-600">
            {cancellationSource.versionHistory.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-slate-500">
            {cancellationSource.author20a} · {cancellationSource.signOff}
          </p>
          <p className="mt-2 text-[11px] text-slate-500">
            Reason table source: {cancellationSource.source20b}.
          </p>
          <p className="mt-2 text-[11px] text-slate-500">{cancellationExit}</p>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-800">
          Process steps 1–24 — transcribed from the flowchart
        </h2>
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          {cancellationSteps.map((s) => (
            <div key={s.n} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-semibold text-white">
                {s.n}
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {s.lane}
                </p>
                <p className="mt-0.5 text-xs text-slate-700">{s.text}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Step 22 is not printed in the source flowchart (numbering jumps 21 → 23) — preserved as
          delivered.
        </p>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-800">
          Annexure 20b — cancellation reasons → responsible party ({cancellationReasons.length} rows,
          verbatim)
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {parties.map((p) => (
            <button
              key={p}
              onClick={() => setParty(p)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                party === p ? "bg-teal-700 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {p === "All" ? "All parties" : p}
            </button>
          ))}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reasons…"
            className="ml-2 w-72 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <span className="text-xs text-slate-500">{filtered.length} shown</span>
        </div>
        <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">Cancellation reason</th>
                <th className="px-3 py-2">Responsible party</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.reason} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-1.5 font-medium text-slate-800">{r.reason}</td>
                  <td className="px-3 py-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        PARTY_STYLES[r.party] ?? "bg-amber-50 text-amber-800"
                      }`}
                    >
                      {r.party}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Mixed attributions ("Could be Force Majeure, Infrastructure Manager or Rail Operations" ·
          "Could be Infrastructure Manager or Rail Operations") are preserved exactly as printed —
          never normalised to a single party.
        </p>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-800">
          Annexure 21 — Clearinghouse Process Narrative v5 (30 Sep 2024)
        </h2>
        <div className="mt-2 rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
          <b>{clearinghouse.title} · {clearinghouse.headerQuirk}</b>
          <p className="mt-1">{clearinghouse.overview}</p>
          <p className="mt-1">{clearinghouse.linkNote}</p>
        </div>
        <div className="mt-2 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-800">Definitions · inputs · outputs</h3>
            <ul className="mt-1 space-y-1.5 text-xs text-slate-600">
              {clearinghouse.definitions.map((d) => (
                <li key={d} className="border-l-2 border-teal-200 pl-2">{d}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-600">
              <b className="text-slate-800">Inputs:</b> {clearinghouse.inputs.join(" · ")}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              <b className="text-slate-800">Outputs:</b> {clearinghouse.outputs.join(" · ")}
            </p>
            <p className="mt-2 text-[11px] text-slate-500">
              Owner: {clearinghouse.owner} · Compilers: {clearinghouse.compilers.join(", ")} ·
              Approvals: {clearinghouse.approvals.join(" · ")}.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-800">Business rules (verbatim)</h3>
            <ul className="mt-1 space-y-1.5 text-xs text-slate-600">
              {clearinghouse.businessRules.map((r) => (
                <li key={r} className="border-l-2 border-amber-200 pl-2">{r}</li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-slate-500">
              Version history as printed: {clearinghouse.revisions.join(" · ")}.
            </p>
          </div>
        </div>
        <h3 className="mt-3 text-sm font-semibold text-slate-800">
          Daily Clearinghouse process — SQM → Corridor → National
        </h3>
        <ol className="mt-2 space-y-1.5">
          {clearinghouse.process.map((p, i) => (
            <li key={i} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-semibold text-white">
                {i + 1}
              </span>
              <p className="text-xs text-slate-700">{p}</p>
            </li>
          ))}
        </ol>
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
          <b>E-ANX21-01 (preserved).</b> The page-2 header prints "CLEARINGHOUSE PROCESS NARRATIVE
          V4" beneath the v5 cover — kept as delivered, never corrected.
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Source: <code className="rounded bg-slate-100 px-1">{clearinghouse.file}</code> · sha256{" "}
          {clearinghouse.sha256.slice(0, 16)}… · CONFIDENTIAL.
        </p>
      </div>
    </div>
  );
}
