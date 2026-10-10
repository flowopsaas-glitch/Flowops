import React, { useState } from "react";
import {
  accessSources,
  adHocSlots,
  applicationForm,
  capacityStatement29b,
  disputeProcess,
  handshakeProcess,
  publicationNotice,
} from "../data/railAccessData";

/**
 * Access & Disputes page — built round 72 from Annexure 28 (Daily Handshake Process v2.5),
 * Annexure 29a (Network Access Application Form), Annexure 29b (Network Capacity Statement —
 * V3-era, period-caveated), Annexure 35 (Dispute Resolution v01) and the NS V4 Publication Notice
 * (V4-11); round 73 added Annexure 32 (Ad Hoc TOC Slot Requests). Process steps transcribed from
 * the flowcharts; quirks preserved and flagged.
 */

function Steps({ steps, accent }: { steps: Array<{ n: string; text: string }>; accent: string }) {
  return (
    <div className="grid gap-2 lg:grid-cols-2">
      {steps.map((s, i) => (
        <div key={`${s.n}-${i}`} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${accent}`}
          >
            {s.n}
          </span>
          <p className="text-xs text-slate-700">{s.text}</p>
        </div>
      ))}
    </div>
  );
}

export default function RailAccess() {
  const [tab, setTab] = useState<"application" | "handshake" | "disputes" | "timelines" | "adhoc">("timelines");

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Annexure 28 · 29a · 29b · 32 · 35 · Publication Notice
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Access &amp; disputes</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          How to apply for network access (29a/29b), ad hoc slot requests (32), the daily IM↔TOC
          handshake (28), how disputes escalate to the Regulator (35), and the official V4
          application timelines (Publication Notice, V4-11).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["timelines", "Timelines & notice (V4-11)"],
            ["application", "Application (29a / 29b)"],
            ["adhoc", "Ad hoc slots (32)"],
            ["handshake", "Daily handshake (28)"],
            ["disputes", "Dispute resolution (35)"],
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

      {tab === "timelines" && (
        <>
          <div className="rounded-xl border border-teal-300 bg-teal-50 p-3 text-xs text-teal-900">
            <b>{publicationNotice.headline}</b> — {publicationNotice.enhancements}
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2">Milestone</th>
                  <th className="px-3 py-2">Timeline</th>
                </tr>
              </thead>
              <tbody>
                {publicationNotice.timelines.map((t) => (
                  <tr key={t.milestone} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 font-medium text-slate-800">{t.milestone}</td>
                    <td className="px-3 py-2 font-semibold tabular-nums text-slate-700">{t.timeline}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
              {publicationNotice.timelineNote}
            </p>
          </div>
          <p className="text-[11px] text-slate-500">
            Source: <code className="rounded bg-slate-100 px-1">{accessSources.fileNotice}</code> ·
            sha256 {accessSources.sha256_notice.slice(0, 16)}… · {publicationNotice.author}.
          </p>
        </>
      )}

      {tab === "application" && (
        <>
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
            <b>POPIA notice (verbatim).</b> {applicationForm.popia}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-800">
              Network Access Application Form (Annexure 29a) — sections
            </h2>
            <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
              {applicationForm.sections.map((s) => (
                <li key={s} className="border-l-2 border-teal-200 pl-2">{s}</li>
              ))}
            </ul>
            <h3 className="mt-3 text-sm font-semibold text-slate-800">
              Section 3 en-route stoppage types (verbatim list)
            </h3>
            <ol className="mt-1 list-inside list-decimal text-xs text-slate-600">
              {applicationForm.stoppageTypes.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <b>{capacityStatement29b.title} — {capacityStatement29b.periodLabel}</b>
            <p className="mt-1">Contents: {capacityStatement29b.contents.join(" · ")}</p>
            <p className="mt-1">{capacityStatement29b.author}</p>
          </div>
          <p className="text-[11px] text-slate-500">
            Sources: <code className="rounded bg-slate-100 px-1">{accessSources.file29a}</code> (sha256{" "}
            {accessSources.sha256_29a.slice(0, 16)}…) ·{" "}
            <code className="rounded bg-slate-100 px-1">{accessSources.file29b}</code> (sha256{" "}
            {accessSources.sha256_29b.slice(0, 16)}…).
          </p>
        </>
      )}

      {tab === "handshake" && (
        <>
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
            <b>Purpose (verbatim).</b> {handshakeProcess.purpose}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
            <b className="text-slate-800">Systems:</b> {handshakeProcess.systems}
            <p className="mt-1"><b className="text-slate-800">Lanes:</b> {handshakeProcess.lanes.join(" · ")}</p>
            <p className="mt-1">
              <b className="text-slate-800">Responsible parties (as printed):</b>{" "}
              {handshakeProcess.responsibleParties.join(" · ")}
            </p>
            <p className="mt-1">
              <b className="text-slate-800">Versions:</b> {handshakeProcess.versionHistory.join(" · ")}
            </p>
          </div>
          <Steps steps={handshakeProcess.steps} accent="bg-teal-700" />
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
            {handshakeProcess.quirks}
          </div>
          <p className="text-[11px] text-slate-500">
            Source: <code className="rounded bg-slate-100 px-1">{accessSources.file28}</code> · sha256{" "}
            {accessSources.sha256_28.slice(0, 16)}…. Escalation ladder: 24h → 48h → 72h → Route
            Logistics Forum → Regulator; resolution window 72–96h; TOC invoice/guarantee mechanics
            on resolution.
          </p>
        </>
      )}

      {tab === "disputes" && (
        <>
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
            <b>Scope (verbatim).</b> {disputeProcess.scope}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
            <b className="text-slate-800">Lanes:</b> {disputeProcess.lanes.join(" · ")}
            <p className="mt-1"><b className="text-slate-800">Versions:</b> {disputeProcess.versionHistory.join(" · ")}</p>
            <p className="mt-1">
              <b className="text-slate-800">End state:</b> the Regulator&apos;s decision is final and
              binding on all parties (step 22).
            </p>
          </div>
          <Steps steps={disputeProcess.steps} accent="bg-rose-700" />
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
            {disputeProcess.quirks}
          </div>
          <p className="text-[11px] text-slate-500">
            Source: <code className="rounded bg-slate-100 px-1">{accessSources.file35}</code> · sha256{" "}
            {accessSources.sha256_35.slice(0, 16)}….
          </p>
        </>
      )}

      {tab === "adhoc" && (
        <>
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
            <b>Annexure 32 — Apply for Ad Hoc Slot ({adHocSlots.title}).</b> Ad hoc train-path
            requests: TOC submits at least <b>21 days before execution</b>; slot application and
            allocation assessed <b>within 7 days</b>. Lanes: {adHocSlots.lanes.join(" · ")}.
            Revisions as printed: {adHocSlots.revisionHistory.join(" · ")}.
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {adHocSlots.timings.map((t) => (
              <div key={t.anchor} className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-800">{t.anchor}</p>
                <p className="mt-0.5 text-xs text-slate-600">{t.detail}</p>
              </div>
            ))}
          </div>
          <Steps steps={adHocSlots.steps} accent="bg-teal-700" />
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
            <b>E-ANX32-01 / E-ANX32-02 (preserved).</b> {adHocSlots.quirks} Notes:{" "}
            {adHocSlots.notes.join(" ")}
          </div>
          <p className="text-[11px] text-slate-500">
            Source: <code className="rounded bg-slate-100 px-1">{adHocSlots.file}</code> · sha256{" "}
            {adHocSlots.sha256.slice(0, 16)}….
          </p>
        </>
      )}
    </div>
  );
}
