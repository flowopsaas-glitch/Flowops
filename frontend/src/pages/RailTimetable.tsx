import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, RefreshCw, Search, Train, Upload } from "lucide-react";
import {
  importRailTimetable,
  listRailTimetableImports,
  listRailTimetableRows,
  type RailTimetableImport,
  type RailTimetableRow,
} from "../api/railApi";
import { useToast } from "../components/ToastProvider";

const PAGE_SIZE = 100;
const cell = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === "" ? "—" : String(value);
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export default function RailTimetable() {
  const { showToast } = useToast();
  const [imports, setImports] = useState<RailTimetableImport[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [rows, setRows] = useState<RailTimetableRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [loadingImports, setLoadingImports] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [uploading, setUploading] = useState(false);

  const loadImports = useCallback(async (preferId?: string) => {
    try {
      const result = await listRailTimetableImports();
      setImports(result);
      setSelectedId((current) => {
        const desired = preferId ?? current;
        return result.some((item) => item.id === desired) ? desired : result[0]?.id ?? "";
      });
    } catch (error: unknown) {
      showToast(`Could not load timetable imports: ${errorMessage(error)}`, "error");
    } finally {
      setLoadingImports(false);
    }
  }, [showToast]);

  const loadRows = useCallback(async () => {
    if (!selectedId) {
      setRows([]);
      setTotal(0);
      return;
    }
    try {
      const result = await listRailTimetableRows(selectedId, {
        q: query.trim() || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setRows(result.data);
      setTotal(result.total);
    } catch (error: unknown) {
      showToast(`Could not load timetable rows: ${errorMessage(error)}`, "error");
    } finally {
      setLoadingRows(false);
    }
  }, [page, query, selectedId, showToast]);

  useEffect(() => {
    void Promise.resolve().then(() => loadImports());
  }, [loadImports]);

  useEffect(() => {
    void Promise.resolve().then(() => loadRows());
  }, [loadRows]);

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setLoadingRows(true);
    setLoadingImports(true);
    try {
      const created = await importRailTimetable(file);
      setPage(1);
      setQuery("");
      await loadImports(created.id);
      showToast(`Imported ${created.rowCount.toLocaleString()} timetable rows`, "success");
    } catch (error: unknown) {
      setLoadingRows(false);
      showToast(`Could not import timetable: ${errorMessage(error)}`, "error");
    } finally {
      setUploading(false);
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selected = imports.find((item) => item.id === selectedId);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link to="/rail" className="mb-3 inline-flex items-center gap-2 text-sm text-emerald-300 hover:text-emerald-200">
            <ArrowLeft className="h-4 w-4" /> Rail operations
          </Link>
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl border border-emerald-500/30 bg-emerald-500/15">
              <Train className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">Rail Timetable</h1>
              <p className="text-sm text-slate-400">Import and search Annexure 33a train workings and station stops.</p>
            </div>
          </div>
        </div>
        <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400 ${uploading ? "pointer-events-none opacity-60" : ""}`}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? "Importing…" : "Import timetable"}
          <input
            type="file"
            accept=".txt,.tsv,.csv,text/plain,text/tab-separated-values"
            className="hidden"
            disabled={uploading}
            onChange={upload}
          />
        </label>
      </div>

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-300">Imports</h2>
            <button
              onClick={() => { setLoadingImports(true); void loadImports(); }}
              className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
              aria-label="Refresh timetable imports"
            >
              <RefreshCw className={`h-4 w-4 ${loadingImports ? "animate-spin" : ""}`} />
            </button>
          </div>
          {imports.length === 0 && !loadingImports && (
            <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-500">
              No timetable imports yet. Upload a tab-separated .txt or .tsv file.
            </p>
          )}
          <div className="space-y-2">
            {imports.map((item) => (
              <button
                key={item.id}
                onClick={() => { setSelectedId(item.id); setPage(1); setLoadingRows(true); }}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  selectedId === item.id
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : "border-white/5 bg-white/[0.02] hover:bg-white/[0.05]"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="block truncate text-sm font-semibold text-slate-100">{item.sourceName}</span>
                  {item.companyId === null && (
                    <span className="shrink-0 rounded bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cyan-300">
                      Shared
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-xs text-slate-400">
                  {item.rowCount.toLocaleString()} rows · {new Date(item.importedAt).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.02]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4">
            <div>
              <h2 className="font-bold text-white">{selected?.sourceName ?? "Schedule rows"}</h2>
              <p className="text-xs text-slate-400">{total.toLocaleString()} matching rows</p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                value={query}
                onChange={(event) => { setQuery(event.target.value); setPage(1); setLoadingRows(true); }}
                placeholder="Search origin, train, station…"
                className="w-56 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1800px] w-full text-left text-xs">
              <thead className="bg-white/[0.03] text-[10px] uppercase tracking-wider text-slate-400">
                <tr>
                  {["#", "Origin", "Train", "Node", "Corridor", "Station / siding", "Arrival", "Departure",
                    "Point runtime", "Standing", "Reason", "Destination", "Origin depart", "Destination arrive",
                    "Sched", "Frequency", "Train type", "Throughput runtime", "Depart day", "Distance km"].map((heading) => (
                    <th key={heading} className="whitespace-nowrap px-3 py-3 font-semibold">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-white/[0.025]">
                    <td className="px-3 py-2 text-slate-500">{row.sourceRow}</td>
                    <td className="px-3 py-2">{row.origin}</td>
                    <td className="px-3 py-2 font-semibold text-white">{row.train}</td>
                    <td className="px-3 py-2">{cell(row.nodeSequence)}</td>
                    <td className="px-3 py-2">{cell(row.corridor)}</td>
                    <td className="px-3 py-2 font-medium text-slate-100">{row.station}</td>
                    <td className="px-3 py-2">{cell(row.arrivalTime)}</td>
                    <td className="px-3 py-2">{cell(row.departureTime)}</td>
                    <td className="px-3 py-2">{cell(row.pointToPointRuntime)}</td>
                    <td className="px-3 py-2">{cell(row.standingTime)}</td>
                    <td className="max-w-48 truncate px-3 py-2" title={row.standingReason ?? undefined}>{cell(row.standingReason)}</td>
                    <td className="px-3 py-2">{cell(row.destination)}</td>
                    <td className="px-3 py-2">{cell(row.originDepartureTime)}</td>
                    <td className="px-3 py-2">{cell(row.destinationArrivalTime)}</td>
                    <td className="px-3 py-2">{cell(row.scheduleCode)}</td>
                    <td className="px-3 py-2">{cell(row.frequency)}</td>
                    <td className="px-3 py-2">{cell(row.trainType)}</td>
                    <td className="px-3 py-2">{cell(row.throughputRuntime)}</td>
                    <td className="px-3 py-2">{cell(row.departDay)}</td>
                    <td className="px-3 py-2">{cell(row.distanceKm)}</td>
                  </tr>
                ))}
                {!loadingRows && rows.length === 0 && (
                  <tr>
                    <td colSpan={20} className="px-4 py-12 text-center text-slate-500">
                      {selectedId ? "No schedule rows match this search." : "Import a timetable to browse train workings."}
                    </td>
                  </tr>
                )}
                {loadingRows && (
                  <tr><td colSpan={20} className="px-4 py-12 text-center text-slate-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading timetable…
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-xs text-slate-400">
            <span>Page {page} of {pages}</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1 || loadingRows}
                onClick={() => { setPage((current) => current - 1); setLoadingRows(true); }}
                className="rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              >Previous</button>
              <button
                disabled={page >= pages || loadingRows}
                onClick={() => { setPage((current) => current + 1); setLoadingRows(true); }}
                className="rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              >Next</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
