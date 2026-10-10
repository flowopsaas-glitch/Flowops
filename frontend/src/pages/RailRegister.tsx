import React from "react";
import {
  registerAnnexure33aNote,
  registerContents,
  registerPurpose,
  registerRoutes,
  registerRoutesAnomaly,
  registerScope,
  registerSource,
  criticalSections,
} from "../data/railRegisterData";

/**
 * Network Register page — built round 69 from Annexure 33 – Network Register (June 2026_v0.3).
 * Verbatim quotes and the E-33REG-01 route-list anomaly preserved exactly.
 */
export default function RailRegister() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Annexure 33 · Network Register (June 2026 v0.3)
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Network register</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          TRIM&apos;s declaration of network capacity and allocation criteria — {registerSource.docTitle},
          dated {registerSource.docDate}. {registerSource.applicability}. Validity:{" "}
          {registerSource.validity}
        </p>
      </div>

      <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
        <b>Note (as delivered):</b> {registerSource.note}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">Purpose</h2>
          <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
            {registerPurpose.map((p, i) => (
              <li key={i} className="border-l-2 border-teal-200 pl-2">{p}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">What the register contains</h2>
          <ul className="mt-2 space-y-2 text-xs text-slate-600">
            {registerContents.map((c) => (
              <li key={c.n} className="border-l-2 border-teal-200 pl-2">
                <span className="font-semibold text-slate-800">{c.n}.</span> {c.item}
                {c.status === "partial" && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                    data file still to be retrieved
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
        <b>Network availability &amp; capacity reliability (as delivered).</b> The register warns of low
        reliability and, in some cases, unavailability owing to continued and persistent theft and
        vandalism of infrastructure. Two critical sections:
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {criticalSections.map((s) => (
          <div key={s.name} className="rounded-xl border border-rose-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-rose-800">{s.name}</h3>
            <p className="mt-2 text-xs text-slate-600">{s.issue}</p>
            <p className="mt-2 text-xs text-slate-600">{s.mitigation}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">Routes — as printed in the register</h2>
          <ol className="mt-2 space-y-1 text-xs text-slate-600">
            {registerRoutes.map((r, i) => (
              <li key={i}>
                {i + 1}. {r}
              </li>
            ))}
          </ol>
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
            <b>E-33REG-01 (preserved, not corrected).</b> {registerRoutesAnomaly}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">Scope of infrastructure covered</h2>
          <p className="mt-2 text-xs text-slate-600">{registerScope}</p>
          <h3 className="mt-4 text-sm font-semibold text-slate-800">Annexure 33a relationship</h3>
          <p className="mt-1 text-xs text-slate-600">{registerAnnexure33aNote}</p>
        </div>
      </div>

      <p className="text-[11px] text-slate-500">
        Source: <code className="rounded bg-slate-100 px-1">{registerSource.file}</code> · sha256{" "}
        {registerSource.sha256.slice(0, 16)}… · {registerSource.pages} pages · {registerSource.author}.
        The section-by-section slot-capacity data file named in the register (appended to Annexure 33,
        with N1/N2 line classification) is a separate download and is not part of this PDF — recorded
        as an open retrieval want.
      </p>
    </div>
  );
}
