import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Gauge,
  GitCompareArrows,
  Info,
  Layers,
  Table2,
  Target,
  TrendingDown,
} from "lucide-react";
import {
  corridors,
  frameworks,
  type CorridorKpis,
  type KpiRow,
} from "../data/railKpiData";

const isTransit = (k: KpiRow) => k.kind === "transit";

function TransitRow({ row }: { row: Extract<KpiRow, { kind: "transit" }> }) {
  const b = row.baseline;
  const t = row.target;
  const improvement =
    b && t && b.hours > 0 ? Math.round(((b.hours - t.hours) / b.hours) * 100) : null;
  return (
    <tr className="border-t border-slate-100 dark:border-slate-800">
      <td className="px-3 py-2 font-mono text-xs text-slate-500">{row.id}</td>
      <td className="px-3 py-2 text-sm">
        <span className="font-medium">{b?.hhmmss ?? "—"}</span>
        <span className="ml-1 text-xs text-slate-400">h ({b?.serial.slice(0, 8)})</span>
      </td>
      <td className="px-3 py-2 text-sm">
        <span className="font-medium text-emerald-600 dark:text-emerald-400">{t?.hhmmss ?? "—"}</span>
        <span className="ml-1 text-xs text-slate-400">h ({t?.serial.slice(0, 8)})</span>
      </td>
      <td className="px-3 py-2 text-sm">
        {improvement !== null ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <TrendingDown className="h-3 w-3" /> {improvement}% faster
          </span>
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}

function MeasureRow({ row }: { row: Extract<KpiRow, { kind: "measure" }> }) {
  return (
    <tr className="border-t border-slate-100 dark:border-slate-800">
      <td className="px-3 py-2 text-sm" colSpan={1}>
        <span className="font-medium">{row.label}</span>
        {row.comment ? (
          <div className="mt-0.5 text-xs text-slate-400">{row.comment}</div>
        ) : null}
      </td>
      <td className="px-3 py-2 text-sm">{row.baseline || "—"}</td>
      <td className="px-3 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
        {row.target || "—"}
      </td>
      <td className="px-3 py-2 text-xs text-slate-400">baseline → target</td>
    </tr>
  );
}

function CorridorCard({ c }: { c: CorridorKpis }) {
  const m = c.corpusMatch;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Target className="h-4 w-4 text-emerald-600" /> {c.sheet}
          </h3>
          <p className="mt-1 text-sm text-slate-500">{c.path}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {c.kpis.filter(isTransit).length} transit · {c.kpis.filter((k) => !isTransit(k)).length} track KPIs
        </span>
      </div>

      <table className="mt-4 w-full">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="px-3 py-1.5">KPI</th>
            <th className="px-3 py-1.5">Baseline</th>
            <th className="px-3 py-1.5">Target</th>
            <th className="px-3 py-1.5">Movement</th>
          </tr>
        </thead>
        <tbody>
          {c.kpis.map((k, i) =>
            isTransit(k) ? <TransitRow key={i} row={k} /> : <MeasureRow key={i} row={k as never} />,
          )}
        </tbody>
      </table>

      <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
          <GitCompareArrows className="h-3.5 w-3.5" /> Planned vs target — corpus match
          <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] dark:bg-slate-800">
            {m.count} workings
          </span>
        </div>
        {m.count > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-slate-500">
            <span>min <b className="text-slate-700 dark:text-slate-200">{m.min}</b></span>
            <span>median <b className="text-slate-700 dark:text-slate-200">{m.median}</b></span>
            <span>max <b className="text-slate-700 dark:text-slate-200">{m.max}</b></span>
            <span className="text-slate-400">
              e.g. {m.sample.slice(0, 3).map((s) => `${s.origin} ${s.train} (${s.runtime})`).join(" · ")}
            </span>
          </div>
        ) : (
          <div className="mt-1.5 text-slate-500">
            {m.note || "No corpus workings match the path endpoints as named in the annexure."}
          </div>
        )}
        <div className="mt-1.5 text-slate-400">{m.note}</div>
      </div>
    </section>
  );
}

function FrameworkTable({ rows }: { rows: string[][] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
          <th className="px-3 py-1.5">Category</th>
          <th className="px-3 py-1.5">KPI / measure</th>
          <th className="px-3 py-1.5">Unit</th>
          <th className="px-3 py-1.5">Attribution</th>
          <th className="px-3 py-1.5">Frequency / level</th>
        </tr>
      </thead>
      <tbody>
        {rows
          .filter((r) => r[0] !== "KPI CATEGORY" && r[0] !== "Definitions" && r[0] !== "NRP" && r[0] !== "Pilot" && r[0] !== "References")
          .map((r, i) => (
            <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-3 py-2 font-medium">{r[0]}</td>
              <td className="px-3 py-2">{r[1]}</td>
              <td className="px-3 py-2">{r[2]}</td>
              <td className="px-3 py-2">{r[3]}</td>
              <td className="px-3 py-2 text-slate-500">{r[4]}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

export default function RailKpis() {
  const [tab, setTab] = useState<"paths" | "current" | "future">("paths");
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Gauge className="h-6 w-6 text-emerald-600" /> Corridor KPIs
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Annexure 43 baselines → targets per train path (FY2026/27–FY2027/28), joined to the
            Annexure 33a working-timetable corpus. Values verbatim from source.
          </p>
        </div>
        <Link
          to="/rail"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> Rail Ops Console
        </Link>
      </div>

      <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div>
          <b>E-43-01 (recorded, not resolved):</b> the annexure's unit row says “Average transit
          times (hours)” but values are stored as Excel day fractions — both the serial and the
          ×24 HH:MM:SS reading are shown. Transit KPI IDs (50–82) are the annexure's own row IDs.
          Planned-vs-target “corpus match” columns are mechanical OD-name matches over working
          header runtimes — indicative, not a KPI computation. The Actual leg needs operational
          data (SPRINT) that is not in the annexure set.
        </div>
      </div>

      <div className="mb-5 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm dark:bg-slate-800">
        {(
          [
            ["paths", "Train paths", Target],
            ["current", "Current framework", Layers],
            ["future", "Future framework", Table2],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 font-medium transition ${
              tab === key
                ? "bg-white text-slate-900 shadow dark:bg-slate-900 dark:text-white"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "paths" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {corridors.map((c) => (
            <CorridorCard key={c.sheet} c={c} />
          ))}
        </div>
      )}
      {tab === "current" && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-base font-semibold">Current KPI Framework</h3>
          <FrameworkTable rows={frameworks["Current KPI Framework"] ?? []} />
        </section>
      )}
      {tab === "future" && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-base font-semibold">Future KPI Framework</h3>
          <FrameworkTable rows={frameworks["Future KPI Framework"] ?? []} />
        </section>
      )}
    </div>
  );
}
