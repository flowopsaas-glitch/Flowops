import React, { useState, useCallback } from "react";
import {
  CheckCircle2, AlertTriangle, Loader2, ScanLine, Trash2,
  Play, ChevronDown, RotateCcw,
} from "lucide-react";
import BarcodeQrScanner from "../components/BarcodeQrScanner";
import { api } from "../api/client";

// Status options a warehouse clerk can set in one batch
const STATUS_OPTIONS = [
  { value: "COLLECTED",        label: "Mark Collected",         desc: "Parcel received at hub" },
  { value: "IN_TRANSIT",       label: "Mark In-Transit",        desc: "Departed from hub" },
  { value: "OUT_FOR_DELIVERY", label: "Mark Out for Delivery",  desc: "Loaded on delivery vehicle" },
  { value: "DELIVERED",        label: "Mark Delivered",         desc: "Confirmed delivered" },
  { value: "FAILED_DELIVERY",  label: "Mark Failed Delivery",   desc: "Delivery attempt failed" },
  { value: "RETURNED",         label: "Mark Returned",          desc: "Returning to sender" },
];

type ScanResult = {
  trackingNumber: string;
  result: "updated" | "notFound" | "unchanged";
  id?: string;
};

export default function BatchScan() {
  const [queue, setQueue]         = useState<string[]>([]);
  const [targetStatus, setStatus] = useState("COLLECTED");
  const [results, setResults]     = useState<ScanResult[]>([]);
  const [history, setHistory]     = useState<Array<{ts: string; status: string; updated: number; notFound: number}>>(() => {
    try { return JSON.parse(localStorage.getItem("batchScanHistory") ?? "[]"); } catch { return []; }
  });
  const [processing, setProcessing] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [manualInput, setManualInput] = useState("");

  const addToQueue = useCallback((code: string) => {
    const cleaned = code.trim();
    if (!cleaned) return;
    setQueue((prev) => (prev.includes(cleaned) ? prev : [...prev, cleaned]));
  }, []);

  const onDetected = useCallback((code: string) => {
    addToQueue(code);
  }, [addToQueue]);

  const addManual = () => {
    manualInput.split(/[\s,\n]+/).forEach((t) => addToQueue(t));
    setManualInput("");
  };

  const removeFromQueue = (code: string) =>
    setQueue((prev) => prev.filter((c) => c !== code));

  const processAll = async () => {
    if (!queue.length) return;
    setProcessing(true);
    setResults([]);
    try {
      const raw = await api.post("/waybills/batch-scan", {
        trackingNumbers: queue,
        targetStatus,
      });
      const data = raw?.data ?? raw;
      const r: ScanResult[] = data?.results ?? [];
      setResults(r);
      // Save to history
      const entry = {
        ts: new Date().toLocaleString("en-ZA"),
        status: targetStatus,
        updated: r.filter(x => x.result === "updated").length,
        notFound: r.filter(x => x.result === "notFound").length,
      };
      const next = [entry, ...history].slice(0, 5);
      setHistory(next);
      localStorage.setItem("batchScanHistory", JSON.stringify(next));
      setQueue([]);
    } catch (err) {
      console.error("Batch scan failed:", err?.message);
    } finally {
      setProcessing(false);
    }
  };

  const selectedOption = STATUS_OPTIONS.find((o) => o.value === targetStatus) ?? STATUS_OPTIONS[0];
  const updated   = results.filter((r) => r.result === "updated").length;
  const notFound  = results.filter((r) => r.result === "notFound").length;
  const unchanged = results.filter((r) => r.result === "unchanged").length;

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_28%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8 overflow-y-auto">
      <div className="mx-auto max-w-[900px] space-y-6">

        {/* Header */}
        <div className="rounded-[30px] border border-white/10 bg-white/6 p-6 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div className="flex items-center gap-3 mb-1">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500/15 ring-1 ring-sky-500/25">
              <ScanLine className="h-5 w-5 text-sky-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">Batch Scan</h1>
              <p className="text-xs text-white/45">Scan multiple waybills at once — camera, image, or manual entry</p>
            </div>
          </div>
        </div>

        {/* Target status selector */}
        <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
          <label className="text-[11px] font-black uppercase tracking-[0.16em] text-white/50 block mb-3" htmlFor="field-target-action-applied-to-all-2">
            Target Action — applied to all scanned waybills
          </label>
          <div className="relative">
            <select id="field-target-action-applied-to-all-2"
              value={targetStatus}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full appearance-none rounded-2xl border border-white/10 bg-[#071224] px-4 py-3 pr-10 text-sm font-bold text-white outline-none focus:border-sky-400"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label} — {o.desc}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-white/40" />
          </div>
        </div>

        {/* Scanner + manual input */}
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5 space-y-3">
            <button
              onClick={() => setShowScanner((v) => !v)}
              className="w-full flex items-center justify-center gap-2 rounded-2xl border border-sky-400/30 bg-sky-500/10 py-3 text-sm font-bold text-sky-200 hover:bg-sky-500/20 transition"
            >
              <ScanLine className="h-4 w-4" />
              {showScanner ? "Hide Camera Scanner" : "Open Camera Scanner"}
            </button>
            {showScanner && (
              <BarcodeQrScanner onDetected={onDetected} />
            )}
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5 space-y-3">
            <label className="text-[11px] font-black uppercase tracking-[0.16em] text-white/50" htmlFor="field-manual-entry-one-per-line-or-1">
              Manual Entry (one per line or comma-separated)
            </label>
            <textarea id="field-manual-entry-one-per-line-or-1"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addManual(); } }}
              placeholder="FO2400001&#10;FO2400002&#10;FO2400003"
              rows={5}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-sky-400 resize-none font-mono"
            />
            <button
              onClick={addManual}
              disabled={!manualInput.trim()}
              className="w-full rounded-2xl border border-white/10 bg-white/5 py-2.5 text-sm font-bold text-white/70 hover:bg-white/10 disabled:opacity-40 transition"
            >
              Add to Queue
            </button>
          </div>
        </div>

        {/* Queue */}
        {queue.length > 0 && (
          <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="font-black text-white">{queue.length} waybill{queue.length !== 1 ? "s" : ""} queued</span>
                <span className="ml-2 text-xs text-white/40">→ {selectedOption.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setQueue([])}
                  className="flex items-center gap-1 text-xs text-white/40 hover:text-rose-400 transition"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Clear
                </button>
                <button
                  onClick={processAll}
                  disabled={processing}
                  className="inline-flex items-center gap-2 rounded-2xl bg-sky-500 hover:bg-sky-400 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50 transition shadow-lg shadow-sky-500/20"
                >
                  {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {processing ? "Processing…" : "Process All"}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {queue.map((code) => (
                <span key={code} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/20 px-3 py-1 text-xs font-mono text-white/70">
                  {code}
                  <button onClick={() => removeFromQueue(code)} className="text-white/30 hover:text-rose-400">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5 space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/8 p-3 text-center">
                <div className="text-2xl font-black text-emerald-300">{updated}</div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300/60">Updated</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center">
                <div className="text-2xl font-black text-white/60">{unchanged}</div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/30">Unchanged</div>
              </div>
              <div className="rounded-2xl border border-rose-400/20 bg-rose-500/8 p-3 text-center">
                <div className="text-2xl font-black text-rose-300">{notFound}</div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-rose-300/60">Not Found</div>
              </div>
            </div>

            {/* Per-waybill results */}
            <div className="space-y-2">
              {results.map((r) => (
                <div key={r.trackingNumber} className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${
                  r.result === "updated"   ? "border-emerald-400/20 bg-emerald-500/5" :
                  r.result === "notFound"  ? "border-rose-400/20 bg-rose-500/5" :
                                             "border-white/8 bg-white/3"
                }`}>
                  {r.result === "updated"   && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />}
                  {r.result === "notFound"  && <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />}
                  {r.result === "unchanged" && <CheckCircle2 className="h-4 w-4 shrink-0 text-white/30" />}
                  <span className="font-mono font-bold text-sm text-white">{r.trackingNumber}</span>
                  <span className={`ml-auto text-[11px] font-bold capitalize ${
                    r.result === "updated"   ? "text-emerald-300" :
                    r.result === "notFound"  ? "text-rose-300" : "text-white/30"
                  }`}>
                    {r.result === "updated"   ? "Status updated" :
                     r.result === "notFound"  ? "Not found" : "Already in status"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Session history */}
        {history.length > 0 && (
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/40 mb-3">Recent Sessions</div>
            <div className="space-y-2">
              {history.map((h, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-white/8 bg-black/20 px-4 py-2.5 text-xs">
                  <span className="text-white/30 shrink-0">{h.ts}</span>
                  <span className="font-bold text-white/60">{h.status}</span>
                  <span className="ml-auto text-emerald-300 font-bold">{h.updated} updated</span>
                  {h.notFound > 0 && <span className="text-rose-300 font-bold">{h.notFound} not found</span>}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
