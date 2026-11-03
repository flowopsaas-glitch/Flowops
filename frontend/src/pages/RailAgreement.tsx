import React, { useState } from "react";
import ReferenceNotice from "./rail/ReferenceNotice";
import {
  accessFeeNote,
  accessFeeTable,
  additionalCharges,
  agreementCaveats,
  agreementSource,
  annexureIndex,
  applicationFees,
  approvedCargo,
  clauseGroups,
  conditionsPrecedent,
  keyClauses,
  liabilityCarveOut,
  penalties,
  readinessChecklist,
  yardUsageRule,
} from "../data/railAgreementData";

/**
 * Rail Access Agreement page — Annexure 15 (95 pp, 49 clauses, Annexures A–J).
 * Read-only reference. The supplied instrument is an UNEXECUTED FORM: placeholders are shown
 * as placeholders rather than filled in, and Annexure C rates are flagged as non-final.
 */

type Tab = "readiness" | "clauses" | "annexures" | "charges";

const TABS: Array<[Tab, string]> = [
  ["readiness", "Readiness & key clauses"],
  ["clauses", "Clause map"],
  ["annexures", "Annexures A–J"],
  ["charges", "Charges & penalties"],
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      <div className="mt-2 space-y-2 text-xs text-slate-600">{children}</div>
    </section>
  );
}

export default function RailAgreement() {
  const [tab, setTab] = useState<Tab>("readiness");

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Annexure 15 · Rail Access Agreement
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Access agreement &amp; readiness</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          The contract a TOC signs with the Infrastructure Manager — {agreementSource.pages} pages,{" "}
          {agreementSource.clauses} clauses, Annexures {agreementSource.annexures}. What it obliges,
          what it costs, what must be true before services may start, and where the supplied copy is
          still blank.
        </p>
      </div>

      <ReferenceNotice>
        The supplied instrument is an <b>unexecuted form</b>; nothing here evidences an operator&apos;s
        rights or allocations.
      </ReferenceNotice>

      <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900">
        <b>Status of the source copy.</b> {agreementSource.executedEvidence}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Access agreement reference sections">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={tab === k}
            onClick={() => setTab(k)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium ${
              tab === k
                ? "bg-teal-700 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "readiness" && (
        <div className="space-y-3">
          <Section title="Parties (as printed)">
            <p>
              <b>IM:</b> {agreementSource.parties.im}
            </p>
            <p>
              <b>Access Seeker:</b>{" "}
              <span className="rounded bg-rose-100 px-1 font-mono text-[11px] text-rose-800">
                {agreementSource.parties.seeker}
              </span>
            </p>
          </Section>

          <Section title="Read first — the clauses that change the business case">
            <div className="space-y-2">
              {keyClauses.map((c) => (
                <div key={c.ref} className="rounded-lg border border-slate-200 p-2">
                  <p className="text-xs font-semibold text-slate-800">
                    <span className="mr-2 rounded bg-teal-700 px-1.5 py-0.5 text-[10px] text-white">
                      {c.ref}
                    </span>
                    {c.title}
                  </p>
                  <p className="mt-1 border-l-2 border-slate-200 pl-2 italic text-slate-600">“{c.text}”</p>
                  <p className="mt-1 text-[11px] text-slate-700">{c.why}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Seven suspensive conditions (clause 4.1)">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-1.5 pr-3">Ref</th>
                    <th className="py-1.5">Condition</th>
                  </tr>
                </thead>
                <tbody>
                  {conditionsPrecedent.map((c) => (
                    <tr key={c.ref} className="border-b border-slate-100 align-top last:border-0">
                      <td className="py-1.5 pr-3 font-mono text-[11px] font-semibold text-slate-600">{c.ref}</td>
                      <td className="py-1.5 text-slate-700">{c.condition}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Where each condition lands in FlowOps">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-1.5 pr-3">Item</th>
                    <th className="py-1.5 pr-3">Flows to</th>
                    <th className="py-1.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {readinessChecklist.map((r) => (
                    <tr key={r.item} className="border-b border-slate-100 align-top last:border-0">
                      <td className="py-1.5 pr-3 text-slate-800">{r.item}</td>
                      <td className="py-1.5 pr-3 text-slate-600">{r.flows}</td>
                      <td className="py-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            r.status.startsWith("blocked")
                              ? "bg-rose-100 text-rose-800"
                              : r.status.startsWith("partially")
                                ? "bg-amber-100 text-amber-800"
                                : r.status.startsWith("customer")
                                  ? "bg-sky-100 text-sky-800"
                                  : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Caveats carried with this view">
            <ul className="list-disc space-y-1 pl-4">
              {agreementCaveats.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      {tab === "clauses" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
            All {agreementSource.clauses} clauses, grouped by what they govern. Clause titles are the
            source&apos;s own headings.
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {clauseGroups.map((g) => (
              <section key={g.group} className="rounded-xl border border-slate-200 bg-white">
                <header className="border-b border-slate-200 bg-slate-50 px-3 py-2">
                  <h2 className="text-sm font-semibold text-slate-800">{g.group}</h2>
                </header>
                <ul className="divide-y divide-slate-100">
                  {g.clauses.map((c) => (
                    <li key={c.n + c.title} className="flex gap-3 px-3 py-1.5 text-xs">
                      <span className="w-10 shrink-0 font-mono text-[11px] font-semibold text-slate-500">
                        {c.n}
                      </span>
                      <span className="text-slate-700">{c.title}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}

      {tab === "annexures" && (
        <div className="space-y-3">
          <Section title="Annexure index">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-1.5 pr-3">Ref</th>
                    <th className="py-1.5 pr-3">Title</th>
                    <th className="py-1.5">Status in supplied copy</th>
                  </tr>
                </thead>
                <tbody>
                  {annexureIndex.map((a) => (
                    <tr key={a.ref} className="border-b border-slate-100 last:border-0">
                      <td className="py-1.5 pr-3 font-mono font-semibold text-slate-600">{a.ref}</td>
                      <td className="py-1.5 pr-3 text-slate-800">{a.title}</td>
                      <td className="py-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            a.status.includes("blank") || a.status.includes("to be fully updated")
                              ? "bg-rose-100 text-rose-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {a.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Annexure B — approved cargo categories (verbatim)">
            <ul className="grid gap-0.5 pl-4 sm:grid-cols-2">
              {approvedCargo.map((c) => (
                <li key={c} className="list-disc">{c}</li>
              ))}
            </ul>
            <p className="mt-1 text-[11px] text-slate-500">
              The asterisk on “Intermodal &amp; Motor Vehicles*” is printed in the source without a
              visible footnote in the extracted text.
            </p>
          </Section>
        </div>
      )}

      {tab === "charges" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-teal-300 bg-teal-50 p-3 text-xs text-teal-900">
            <b>Audit finding — the heading is stale.</b> Annexure C is headed “SECTION TO BE FULLY
            UPDATED WITH FINALISED CHARGES”, yet all ten rows below reconcile <b>exactly</b> against
            NS V4 Table 17, the tariff in force from 1 August 2026. Cite <b>/rail/tariffs</b> as the
            controlled billing source; section capacity comes from Annexure 33b (<b>/rail/slots</b>).
          </div>

          <Section title="A. Rail access fee by cargo category (reconciles to NS V4 Table 17)">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-1.5 pr-3">Category</th>
                    <th className="py-1.5 pr-3 text-right">Tariff per train-km (Rand)</th>
                    <th className="py-1.5 text-right">Tariff per GTK (cents)</th>
                  </tr>
                </thead>
                <tbody>
                  {accessFeeTable.map((r) => (
                    <tr key={r.category} className="border-b border-slate-100 last:border-0">
                      <td className="py-1.5 pr-3 text-slate-800">{r.category}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-slate-700">{r.perTrainKm}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-700">{r.perGtkCents}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">{accessFeeNote}</p>
          </Section>

          <Section title="C. Application fees">
            <div className="space-y-2">
              {applicationFees.map((f) => (
                <div key={f.trigger} className="rounded-lg border border-slate-200 p-2">
                  <p className="text-xs font-semibold text-slate-800">{f.trigger}</p>
                  <p className="mt-0.5 font-medium text-slate-700">{f.basis}</p>
                  <p className="mt-0.5 text-[11px] text-slate-600">{f.covers}</p>
                </div>
              ))}
            </div>
          </Section>

          <div className="grid gap-3 lg:grid-cols-2">
            <Section title="E. IM penalties">
              <div className="space-y-2">
                {penalties.im.map((p) => (
                  <div key={p.item} className="rounded-lg border border-slate-200 p-2">
                    <p className="text-xs font-semibold text-slate-800">{p.item}</p>
                    <p className="mt-0.5 text-[11px] text-slate-600">
                      <b>Procedure:</b> {p.procedure}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-600">{p.principle}</p>
                    <p className="mt-0.5 text-[11px] text-slate-700">
                      <b>Charge:</b> {p.charge}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
            <Section title="E. Access Seeker penalties — the 72-hour rule">
              <div className="space-y-2">
                {penalties.accessSeeker.map((p) => (
                  <div key={p.item} className="rounded-lg border border-slate-200 p-2">
                    <p className="text-xs font-semibold text-slate-800">{p.item}</p>
                    <p className="mt-0.5 text-[11px] text-slate-600">{p.charge}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 rounded-lg bg-slate-50 p-2 text-[11px]">
                Cancellations are managed in accordance with Section 6.5.7 of the Network Statement.
              </p>
            </Section>
          </div>

          <Section title="F. Additional charges (eight trigger events)">
            <ul className="grid gap-0.5 pl-4 sm:grid-cols-2">
              {additionalCharges.map((c) => (
                <li key={c} className="list-disc">{c}</li>
              ))}
            </ul>
            <p className="mt-2 rounded-lg border-l-2 border-teal-300 bg-slate-50 p-2">{yardUsageRule}</p>
            <p className="mt-1 rounded-lg border-l-2 border-slate-300 bg-slate-50 p-2">{liabilityCarveOut}</p>
          </Section>
        </div>
      )}

      <p className="text-[11px] text-slate-500">
        Source: <code className="rounded bg-slate-100 px-1">{agreementSource.file}</code> ·{" "}
        {agreementSource.pages} pp · sha256 {agreementSource.sha256.slice(0, 16)}…
      </p>
    </div>
  );
}
