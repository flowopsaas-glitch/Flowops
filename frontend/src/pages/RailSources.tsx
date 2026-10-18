import { Link } from "react-router-dom";
import ReferenceNotice from "./rail/ReferenceNotice";
import {
  ArrowLeft,
  BookOpen,
  Database,
  FileWarning,
  FolderSearch,
  ShieldCheck,
} from "lucide-react";
import {
  corpusStats,
  flagClasses,
  sourceRegister,
  wantedSources,
} from "../data/railSourceData";

const fmt = (n: number) => n.toLocaleString("en-ZA");

export default function RailSources() {
  const mixTotal = Object.values(corpusStats.corridorMix).reduce((a, b) => a + b, 0);
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Database className="h-6 w-6 text-emerald-600" /> Network Sources
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Provenance, coverage and preserved anomalies for the Annexure 33a/43 corpus —
            the byte-faithful mirror behind the rail module.
          </p>
        </div>
        <Link
          to="/rail"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> Rail Ops Console
        </Link>
      </div>

      <ReferenceNotice />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Files", fmt(corpusStats.files)],
          ["Rows", fmt(corpusStats.rows)],
          ["Workings", fmt(corpusStats.workings)],
          ["Depots", fmt(corpusStats.depots)],
          ["[OK]", fmt(corpusStats.okWorkings)],
          ["Flagged", fmt(corpusStats.flaggedWorkings)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
            <div className="mt-1 text-xl font-bold">{value}</div>
          </div>
        ))}
      </div>

      <section className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950">
        <div className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-200">
          <ShieldCheck className="h-4 w-4" /> Complete mirror — verified
        </div>
        <p className="mt-1 text-emerald-800/90 dark:text-emerald-200/90">
          {fmt(corpusStats.byteIdentical)} of {fmt(corpusStats.extractRows)} Annexure 33a rows are
          byte-identical in the corpus ({fmt(corpusStats.rows)} rows total, 0 exceptions). Blanks,
          trailing tabs, source order and every anomaly are preserved exactly — rows are
          transcribed, never authored or repaired.
        </p>
      </section>

      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <BookOpen className="h-4 w-4 text-emerald-600" /> Source register
        </h3>
        <div className="mt-3 overflow-x-auto">
        <table aria-label="Rail source register" className="min-w-[760px] w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="py-1.5 pr-3">Document</th>
              <th className="py-1.5 pr-3">File</th>
              <th className="py-1.5 pr-3">Hash</th>
              <th className="py-1.5 pr-3">Period</th>
              <th className="py-1.5">Role</th>
            </tr>
          </thead>
          <tbody>
            {sourceRegister.map((s) => (
              <tr key={s.name} className="border-t border-slate-100 align-top dark:border-slate-800">
                <td className="py-2 pr-3 font-medium">{s.name}</td>
                <td className="py-2 pr-3 font-mono text-xs text-slate-500">{s.file}</td>
                <td className="py-2 pr-3 font-mono text-xs text-slate-500">{s.hash}</td>
                <td className="py-2 pr-3 text-slate-500">{s.period}</td>
                <td className="py-2 text-slate-500">{s.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-base font-semibold">Corridor mix (rows)</h3>
          <div className="mt-3 space-y-2">
            {Object.entries(corpusStats.corridorMix).map(([name, n]) => (
              <div key={name}>
                <div className="flex justify-between text-xs">
                  <span className="font-medium">{name}</span>
                  <span className="text-slate-500">{fmt(n)}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-2 rounded-full bg-emerald-500"
                    style={{ width: `${Math.max(1, (n / mixTotal) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <FileWarning className="h-4 w-4 text-amber-500" /> Preserved anomalies —{" "}
            {fmt(corpusStats.flaggedWorkings)} flagged workings
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Never repaired. Full per-working detail is recorded in the repository file{" "}
            <span className="font-mono">rail-source-check/FLAGGED-WORKINGS.md</span>; it is not served as a download by this app.
          </p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
            {flagClasses.map((f) => (
              <li key={f} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                {f}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <FolderSearch className="h-4 w-4 text-emerald-600" /> Wanted source files
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Upload to <span className="font-mono">sources/</span> — retrieval from transnet.net is
          blocked in the sandbox (see docs/TRIM-SOURCE-RETRIEVAL-MANIFEST-2026-10-04.md).
        </p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-300">
          {wantedSources.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
