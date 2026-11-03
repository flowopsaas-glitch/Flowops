import React, { useState } from "react";
import ReferenceNotice from "./rail/ReferenceNotice";
import {
  accountabilityMatrix,
  activationDisciplinesDepot,
  activationDisciplinesNational,
  activationLevels,
  applicability,
  corridors,
  distribution,
  drillCadence,
  ecc,
  emergencyCaveats,
  emergencySource,
  emergencyTeams,
  emergencyTeamsLegend,
  fatalityProtocol,
  hazmatContacts,
  interfaces,
  nccDuties,
  objectives,
  offsiteManagement,
  onSiteOffSite,
  postOccurrence,
  preliminaryReportForm,
  purpose,
  referenceStandards,
  referencedAnnexures,
  ricDuties,
  ricRioMatrix,
  ricRiRulings,
  sceneSafety,
  scenarios,
  tribunal,
  versionControl,
  wagonDepots,
} from "../data/railEmergencyData";

/**
 * Emergency Response page — Annexure 36, TFR 013-TFR-COR-HFES-15007 v4 (73 pages).
 * Read-only reference. Every quote is source text; page cites are in the data module.
 */

type Tab = "levels" | "scenarios" | "command" | "tribunal" | "contacts" | "teams";

const TABS: Array<[Tab, string]> = [
  ["levels", "Activation levels"],
  ["scenarios", "Scenario matrix"],
  ["command", "Command & ECC"],
  ["tribunal", "Tribunal & NCC"],
  ["contacts", "Hazmat contacts"],
  ["teams", "Teams & depots"],
];

const toneClass: Record<string, string> = {
  red: "border-rose-300 bg-rose-50 text-rose-900",
  amber: "border-amber-300 bg-amber-50 text-amber-900",
  green: "border-emerald-300 bg-emerald-50 text-emerald-900",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      <div className="mt-2 space-y-2 text-xs text-slate-600">{children}</div>
    </section>
  );
}

export default function RailEmergency() {
  const [tab, setTab] = useState<Tab>("levels");

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Annexure 36 · {emergencySource.docId} · v{emergencySource.version}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Emergency response &amp; tribunals</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Transnet Freight Rail&apos;s Emergency Response Plan for multidisciplinary incident
          preparedness — {emergencySource.pages} pages, revised {emergencySource.revised}. Activation
          levels, the scenario matrix, on-site command at the Emergency Control Centre, the Tribunal
          that convenes off-site, and the hazmat/emergency-team directory.
        </p>
      </div>

      <ReferenceNotice>
        This is a TFR internal procedure, not an access-regime document — see the guardrails below
        before relying on any contact or capability in it.
      </ReferenceNotice>

      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
        <b>Guardrails.</b>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          {emergencyCaveats.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Emergency response reference sections">
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

      {tab === "levels" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
            <b>Purpose (verbatim).</b> {purpose}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {activationLevels.map((l) => (
              <div key={l.code} className={`rounded-xl border p-3 ${toneClass[l.tone]}`}>
                <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
                  {l.code} · {l.colour}
                </p>
                <p className="mt-0.5 text-sm font-semibold">{l.name}</p>
                <p className="mt-1 text-xs">{l.definition}</p>
                <p className="mt-1 text-[10px] opacity-60">Source pp. {l.page}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Section title="Main objectives">
              <ul className="list-disc space-y-1 pl-4">
                {objectives.main.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </Section>
            <Section title="Secondary objectives">
              <ul className="list-disc space-y-1 pl-4">
                {objectives.secondary.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </Section>
          </div>

          <Section title="Scope — primary outcomes">
            <ul className="list-disc space-y-1 pl-4">
              {objectives.scopePrimary.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          </Section>

          <Section title="The fatality / injury rule that overrides service recovery">
            <p className="font-semibold text-slate-800">{fatalityProtocol.headline}</p>
            <ul className="list-disc space-y-1 pl-4">
              {fatalityProtocol.rules.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            <p className="mt-2 rounded-lg bg-slate-50 p-2 text-[11px]">
              <b>Exemption relied on:</b> {fatalityProtocol.exemption}
            </p>
          </Section>

          <Section title="Operational corridors (v4 naming)">
            <div className="grid gap-2 md:grid-cols-2">
              {corridors.map((c) => (
                <div key={c.name} className="rounded-lg border border-slate-200 p-2">
                  <p className="text-xs font-semibold text-slate-800">{c.name}</p>
                  <p className="mt-1 text-[11px]">{c.places.join(" · ")}</p>
                  {c.note && <p className="mt-1 text-[10px] italic text-slate-500">{c.note}</p>}
                </div>
              ))}
            </div>
          </Section>

          <div className="grid gap-3 lg:grid-cols-2">
            <Section title="Applicability &amp; distribution">
              <p>{applicability}</p>
              <ul className="mt-1 grid grid-cols-1 gap-0.5 pl-4 sm:grid-cols-2">
                {distribution.map((d) => (
                  <li key={d} className="list-disc">{d}</li>
                ))}
              </ul>
            </Section>
            <Section title="Version control (own table)">
              <ul className="space-y-1">
                {versionControl.slice(1).map((v, i) => (
                  <li key={i} className="border-l-2 border-teal-200 pl-2">
                    <span className="font-semibold text-slate-800">{v.change}</span>
                    <span className="text-slate-500"> — {v.where}</span>
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          <Section title="Drills, exercises and review cadence">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-1.5 pr-3">Activity</th>
                    <th className="py-1.5 pr-3">Frequency</th>
                    <th className="py-1.5">Page</th>
                  </tr>
                </thead>
                <tbody>
                  {drillCadence.map((d) => (
                    <tr key={d.activity} className="border-b border-slate-100 last:border-0">
                      <td className="py-1.5 pr-3 font-medium text-slate-800">{d.activity}</td>
                      <td className="py-1.5 pr-3">{d.frequency}</td>
                      <td className="py-1.5 tabular-nums text-slate-500">{d.page}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}

      {tab === "scenarios" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
            Five scenario families (A–E) with the code each attracts. Codes drive who commands the
            scene and whether the Tribunal convenes — see <b>Command &amp; ECC</b>. The source prints
            these as a wide grid; the trigger text and codes below are transcribed per cell.
          </div>
          {scenarios.map((s) => (
            <section key={s.id} className="rounded-xl border border-slate-200 bg-white">
              <header className="flex items-baseline gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
                <span className="rounded-full bg-teal-700 px-2 py-0.5 text-[10px] font-semibold text-white">
                  Scenario {s.id}
                </span>
                <h2 className="text-sm font-semibold text-slate-800">{s.group}</h2>
              </header>
              <div className="divide-y divide-slate-100">
                {s.cells.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-start gap-2 px-3 py-2 text-xs">
                    <span className="w-8 shrink-0 font-mono text-[11px] font-semibold text-slate-500">{c.id}</span>
                    <p className="min-w-[14rem] flex-1 text-slate-700">{c.trigger}</p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                      {c.code}
                    </span>
                    {c.action && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800">
                        {c.action}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
          <Section title="Scene safety rules">
            <p className="font-semibold text-slate-800">General</p>
            <ul className="list-disc space-y-1 pl-4">
              {sceneSafety.general.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
            <p className="mt-2 font-semibold text-slate-800">Safety guidelines</p>
            <ul className="list-disc space-y-1 pl-4">
              {sceneSafety.guidelines.map((g, i) => (
                <li key={i} className={g.startsWith("Overhead") ? "font-semibold text-rose-800" : ""}>
                  {g}
                </li>
              ))}
            </ul>
            <p className="mt-2 font-semibold text-slate-800">Hazmat handling</p>
            <ul className="list-disc space-y-1 pl-4">
              {sceneSafety.hazmat.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      {tab === "command" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
            <b>Area classification drives rank.</b> Red 3 / Orange 2 / Green 1 — the plan assigns a
            different Rail Incident Commander and Officer for each code, on main lines versus branch
            lines and yards.
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2">Area</th>
                  <th className="px-3 py-2">Red 3</th>
                  <th className="px-3 py-2">Orange 2</th>
                  <th className="px-3 py-2">Green 1</th>
                </tr>
              </thead>
              <tbody>
                {ricRioMatrix.map((r) => (
                  <tr key={r.area} className="border-b border-slate-100 last:border-0 align-top">
                    <td className="px-3 py-2 font-semibold text-slate-800">{r.area}</td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-800">{r.red3.ric}</p>
                      <p className="text-slate-500">RIO: {r.red3.rio}</p>
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-800">{r.orange2.ric}</p>
                      <p className="text-slate-500">RIO: {r.orange2.rio}</p>
                    </td>
                    <td className="px-3 py-2">{r.green1.ric}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Section title="Who takes charge">
            <ul className="list-disc space-y-1 pl-4">
              {ricRiRulings.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </Section>

          <div className="grid gap-3 lg:grid-cols-2">
            <Section title="Emergency Control Centre (on-site)">
              <p>{ecc.rule}</p>
              <p className="mt-1">
                <b>Siting:</b> {ecc.siting}
              </p>
              <p>
                <b>Marking:</b> {ecc.marking}
              </p>
              <p>
                <b>Identification:</b> {ecc.identification}
              </p>
            </Section>
            <Section title="RIC duties">
              <ul className="list-disc space-y-1 pl-4">
                {ricDuties.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </Section>
          </div>

          <Section title="ECC general rules">
            <ul className="list-disc space-y-1 pl-4">
              {ecc.general.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </Section>

          <Section title="ECC operating rules">
            <ul className="list-disc space-y-1 pl-4">
              {ecc.operatingRules.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </Section>

          <Section title="ECC equipment checklist">
            <ul className="grid gap-0.5 pl-4 sm:grid-cols-2">
              {ecc.equipment.map((e) => (
                <li key={e} className="list-disc">{e}</li>
              ))}
            </ul>
          </Section>

          <div className="grid gap-3 lg:grid-cols-2">
            <Section title="On-site responsibilities">
              <ul className="grid gap-0.5">
                {onSiteOffSite.onSite.map((o) => (
                  <li key={o} className="border-l-2 border-teal-200 pl-2">{o}</li>
                ))}
              </ul>
            </Section>
            <Section title="Off-site responsibilities">
              <ul className="grid gap-0.5">
                {onSiteOffSite.offSite.map((o) => (
                  <li key={o} className="border-l-2 border-amber-200 pl-2">{o}</li>
                ))}
              </ul>
            </Section>
          </div>

          <Section title="Interface management — who commands when another party owns the scene">
            <div className="space-y-3">
              {interfaces.map((i) => (
                <div key={i.party} className="rounded-lg border border-slate-200 p-2">
                  <p className="text-xs font-semibold text-slate-800">{i.party}</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {i.rules.map((r, k) => (
                      <li key={k}>{r}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Post-occurrence processes">
            <ul className="grid gap-0.5 pl-4 sm:grid-cols-2">
              {postOccurrence.map((p) => (
                <li key={p} className="list-disc">{p}</li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      {tab === "tribunal" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
            <b>The Tribunal is not a structure.</b> {tribunal.definition}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Section title="What the Tribunal does">
              <ul className="list-disc space-y-1 pl-4">
                {tribunal.functions.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </Section>
            <Section title="What it decides">
              <ul className="list-disc space-y-1 pl-4">
                {tribunal.decidesOn.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </Section>
          </div>

          <Section title="Life cycle">
            <ol className="space-y-1">
              {tribunal.lifeCycle.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-700 text-[10px] font-semibold text-white">
                    {i + 1}
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            <p className="mt-2 rounded-lg bg-slate-50 p-2 text-[11px] italic">{tribunal.guardrail}</p>
          </Section>

          <div className="grid gap-3 lg:grid-cols-2">
            <Section title="National Command Centre (NCC) duties">
              <ul className="list-disc space-y-1 pl-4">
                {nccDuties.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </Section>
            <Section title="Off-site management">
              <ul className="list-disc space-y-1 pl-4">
                {offsiteManagement.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </Section>
          </div>

          <Section title="Accountability, responsibility and authority (v4 redefined)">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-1.5 pr-3">Role</th>
                    <th className="py-1.5 pr-3">Position</th>
                    <th className="py-1.5">Duties</th>
                  </tr>
                </thead>
                <tbody>
                  {accountabilityMatrix.map((r) => (
                    <tr key={r.role} className="border-b border-slate-100 align-top last:border-0">
                      <td className="py-2 pr-3 font-semibold text-slate-800">{r.role}</td>
                      <td className="py-2 pr-3 text-slate-600">{r.holds}</td>
                      <td className="py-2">
                        <ul className="list-disc space-y-0.5 pl-4">
                          {r.duties.map((d, i) => (
                            <li key={i}>{d}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Activation control sheet — national disciplines logged by the NCC">
            <p className="text-[11px] text-slate-500">
              NCC tel. 011 544 9094 (source: “Update list cancelled + reside with NCC”).
            </p>
            <ul className="mt-1 grid gap-0.5 pl-4 sm:grid-cols-2 lg:grid-cols-3">
              {activationDisciplinesNational.map((d) => (
                <li key={d} className="list-disc">{d}</li>
              ))}
            </ul>
          </Section>

          <Section title="Depot-level activation control sheet">
            <ul className="grid gap-0.5 pl-4 sm:grid-cols-2 lg:grid-cols-3">
              {activationDisciplinesDepot.map((d) => (
                <li key={d} className="list-disc">{d}</li>
              ))}
            </ul>
          </Section>

          <Section title="Preliminary Investigation Report (4.12B)">
            <p className="text-[11px] italic text-slate-500">{preliminaryReportForm.note}</p>
            <div className="mt-1 grid gap-2 md:grid-cols-2">
              {preliminaryReportForm.sections.map((s) => (
                <div key={s.title} className="rounded-lg border border-slate-200 p-2">
                  <p className="text-xs font-semibold text-slate-800">{s.title}</p>
                  {s.fields.length > 0 && (
                    <p className="mt-0.5 text-[11px] text-slate-600">{s.fields.join(" · ")}</p>
                  )}
                </div>
              ))}
            </div>
          </Section>

          <Section title="Reference standards cited by the plan">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-1.5 pr-3">Standard / procedure</th>
                    <th className="py-1.5 pr-3">Reference</th>
                    <th className="py-1.5">Clause</th>
                  </tr>
                </thead>
                <tbody>
                  {referenceStandards.map((s) => (
                    <tr key={s.ref} className="border-b border-slate-100 last:border-0">
                      <td className="py-1.5 pr-3 text-slate-800">{s.name}</td>
                      <td className="py-1.5 pr-3 font-mono text-[11px] text-slate-600">{s.ref}</td>
                      <td className="py-1.5 text-slate-500">{s.clause}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Plan annexures not supplied in this repository">
            <ul className="grid gap-0.5 pl-4 sm:grid-cols-2">
              {referencedAnnexures.map((a) => (
                <li key={a} className="list-disc">{a}</li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      {tab === "contacts" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <b>Transcribed from an uncontrolled copy.</b> The source says to report incidents to the
            Centralised Traffic Control (CTC), which co-ordinates the response, and that this list is
            available on a 24-hour basis. Verify against the NCC&apos;s live activation list before relying
            on any number — the plan commits to monthly updates.
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2">Organisation</th>
                  <th className="px-3 py-2">Position</th>
                  <th className="px-3 py-2">Contact person</th>
                  <th className="px-3 py-2">Primary</th>
                  <th className="px-3 py-2">Alternative</th>
                </tr>
              </thead>
              <tbody>
                {hazmatContacts.map((c, i) => (
                  <tr key={`${c.org}-${c.position}-${i}`} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-1.5 font-medium text-slate-800">{c.org}</td>
                    <td className="px-3 py-1.5 text-slate-600">{c.position}</td>
                    <td className="px-3 py-1.5 text-slate-600">{c.person || "—"}</td>
                    <td className="px-3 py-1.5 tabular-nums text-slate-800">{c.primary || "—"}</td>
                    <td className="px-3 py-1.5 tabular-nums text-slate-500">{c.alt || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-500">
            Two rows (East London Act. Senior Fire Officer, Eastern Region Act. Manager Environment
            &amp; Hazmat Fire) are blank in the source — preserved as blank rather than filled in.
          </p>
        </div>
      )}

      {tab === "teams" && (
        <div className="space-y-3">
          <Section title="Legend (source markings)">
            <ul className="space-y-1">
              {emergencyTeamsLegend.map((l) => (
                <li key={l.mark}>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
                    {l.mark}
                  </span>{" "}
                  {l.meaning}
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Emergency teams by area">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-1.5 pr-3">Area</th>
                    <th className="py-1.5 pr-3">Place</th>
                    <th className="py-1.5 pr-1">Crane</th>
                    <th className="py-1.5 pr-1">Lorry</th>
                    <th className="py-1.5 pr-1">Bulldozer</th>
                    <th className="py-1.5">Train</th>
                  </tr>
                </thead>
                <tbody>
                  {emergencyTeams.flatMap((a) =>
                    a.places.map((p, i) => (
                      <tr key={`${a.area}-${p.place}`} className="border-b border-slate-100 last:border-0">
                        <td className="py-1.5 pr-3 font-semibold text-slate-700">
                          {i === 0 ? a.area : ""}
                        </td>
                        <td className="py-1.5 pr-3 text-slate-800">{p.place}</td>
                        <td className="py-1.5 pr-1 tabular-nums text-slate-600">{p.crane || "·"}</td>
                        <td className="py-1.5 pr-1 tabular-nums text-slate-600">{p.lorry || "·"}</td>
                        <td className="py-1.5 pr-1 tabular-nums text-slate-600">{p.bulldozer || "·"}</td>
                        <td className="py-1.5 tabular-nums text-slate-600">{p.train || "·"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Wagon maintenance depots by controlling station">
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
              {wagonDepots.map((d) => (
                <div key={d.controller} className="rounded-lg border border-slate-200 p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-700">
                    {d.controller}
                  </p>
                  <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600">
                    {d.places.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              “# CONTROLLING STATION” is the source&apos;s own footnote marker. Place names are
              transcribed with the source&apos;s spelling (“Richardsbaai”, “Beaufort-wes”, “De aar”).
            </p>
          </Section>
        </div>
      )}

      <p className="text-[11px] text-slate-500">
        Source: <code className="rounded bg-slate-100 px-1">{emergencySource.file}</code> ·{" "}
        {emergencySource.pages} pp · sha256 {emergencySource.sha256.slice(0, 16)}… ·{" "}
        {emergencySource.issuer} · {emergencySource.classificationNote}
      </p>
    </div>
  );
}
