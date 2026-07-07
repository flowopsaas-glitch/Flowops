import React, { useState, useCallback, useRef } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Download,
  Loader2,
  FileText,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { api } from "../api/client";

// ── Types ───────────────────────────────────────────────────────
type ImportStatus = "idle" | "previewing" | "uploading" | "done" | "error";

type RowResult = {
  row: number;
  status: "created" | "failed" | "duplicate";
  trackingNumber?: string;
  error?: string;
};

type ImportResult = {
  created: number;
  failed: number;
  duplicates: number;
  results: RowResult[];
};

// ── CSV column definitions ──────────────────────────────────────
const REQUIRED_COLUMNS = [
  "senderName",
  "senderPhone",
  "senderAddress",
  "recipientName",
  "recipientPhone",
  "recipientAddress",
];

const OPTIONAL_COLUMNS = [
  "recipientEmail",
  "weight",
  "description",
  "codAmount",
  "totalAmount",
  "dimensions",
];

const ALL_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];

const TEMPLATE_HEADERS =
  "senderName,senderPhone,senderAddress,recipientName,recipientPhone,recipientAddress,recipientEmail,weight,description,codAmount,totalAmount";

const TEMPLATE_ROW =
  '"John Smith","+27821234567","123 Main Rd, JHB","Jane Doe","+27831234567","456 Oak Ave, PTA","jane@example.com","2.5","Electronics","150","350"';

// ── Helpers ─────────────────────────────────────────────────────
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(parseCSVLine);
  return { headers, rows };
}

// ── Component ───────────────────────────────────────────────────
export default function BulkImport() {
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File selection ──────────────────────────────────────────
  const handleFile = useCallback((f: File | null) => {
    if (!f) return;
    if (!f.name.endsWith(".csv")) {
      setErrorMessage("Please upload a .csv file");
      return;
    }

    setFile(f);
    setErrorMessage(null);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCSV(text);
      setPreviewHeaders(headers);
      setPreviewRows(rows.slice(0, 5));
      setTotalRows(rows.length);
      setStatus("previewing");
    };
    reader.onerror = () => {
      setErrorMessage("Failed to read file");
      setStatus("error");
    };
    reader.readAsText(f);
  }, []);

  // ── Drag & Drop ─────────────────────────────────────────────
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const droppedFile = e.dataTransfer.files[0];
      handleFile(droppedFile);
    },
    [handleFile]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  // ── Upload ──────────────────────────────────────────────────
  const handleImport = async () => {
    if (!file) return;
    setStatus("uploading");
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await api.post("/waybills/bulk-import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const data: any = (result as any)?.data ?? result;
      setImportResult({
        created: data.created ?? 0,
        failed: data.failed ?? 0,
        duplicates: data.duplicates ?? 0,
        results: data.results ?? [],
      });
      setStatus("done");
    } catch (err: any) {
      setErrorMessage(err?.message || "Import failed. Please try again.");
      setStatus("error");
    }
  };

  // ── Template Download ───────────────────────────────────────
  const downloadTemplate = () => {
    const content = `${TEMPLATE_HEADERS}\n${TEMPLATE_ROW}`;
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "flowops-bulk-import-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ── Reset ───────────────────────────────────────────────────
  const reset = () => {
    setFile(null);
    setPreviewHeaders([]);
    setPreviewRows([]);
    setTotalRows(0);
    setImportResult(null);
    setErrorMessage(null);
    setStatus("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_28%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8 overflow-y-auto">
      <div className="mx-auto max-w-[960px] space-y-6">
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="rounded-[30px] border border-white/10 bg-white/[0.06] p-6 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500/15 ring-1 ring-sky-500/25">
                <FileSpreadsheet className="h-5 w-5 text-sky-400" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-white tracking-tight">
                  Bulk CSV Import
                </h1>
                <p className="text-xs text-white/45">
                  Upload a CSV file to create multiple waybills at once
                </p>
              </div>
            </div>
            <button
              onClick={downloadTemplate}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white/70 hover:bg-white/10 transition"
            >
              <Download className="h-4 w-4" />
              Download Template
            </button>
          </div>
        </div>

        {/* ── Help Section (Collapsible) ─────────────────────── */}
        <div className="rounded-[24px] border border-white/10 bg-white/[0.05] overflow-hidden transition-all duration-300">
          <button
            onClick={() => setHelpOpen(!helpOpen)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.02] transition"
          >
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-sky-400" />
              <span className="text-sm font-bold text-white/80">
                CSV Format & Column Reference
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-white/40 transition-transform duration-300 ${
                helpOpen ? "rotate-180" : ""
              }`}
            />
          </button>
          <div
            className={`overflow-hidden transition-all duration-300 ${
              helpOpen ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <div className="px-5 pb-5 space-y-4">
              <div>
                <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-300/80 mb-2">
                  Required Columns
                </h3>
                <div className="flex flex-wrap gap-2">
                  {REQUIRED_COLUMNS.map((col) => (
                    <span
                      key={col}
                      className="inline-flex items-center rounded-xl border border-emerald-400/20 bg-emerald-500/8 px-3 py-1.5 text-xs font-mono font-bold text-emerald-300"
                    >
                      {col}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-white/50 mb-2">
                  Optional Columns
                </h3>
                <div className="flex flex-wrap gap-2">
                  {OPTIONAL_COLUMNS.map((col) => (
                    <span
                      key={col}
                      className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-mono text-white/60"
                    >
                      {col}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-[11px] font-bold text-white/40 mb-1">
                  Example CSV:
                </p>
                <pre className="text-[11px] text-white/60 font-mono overflow-x-auto whitespace-pre-wrap">
{TEMPLATE_HEADERS}
{TEMPLATE_ROW}
                </pre>
              </div>
            </div>
          </div>
        </div>

        {/* ── Upload Zone ────────────────────────────────────── */}
        {(status === "idle" || status === "error") && (
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`group cursor-pointer rounded-[24px] border-2 border-dashed p-12 text-center transition-all duration-300 ${
              dragOver
                ? "border-sky-400 bg-sky-500/10 scale-[1.01]"
                : "border-white/15 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.05]"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] || null)}
            />
            <div className="flex flex-col items-center gap-4">
              <div
                className={`grid h-16 w-16 place-items-center rounded-2xl transition-all duration-300 ${
                  dragOver
                    ? "bg-sky-500/20 ring-2 ring-sky-400/40"
                    : "bg-white/5 ring-1 ring-white/10 group-hover:bg-sky-500/10 group-hover:ring-sky-500/20"
                }`}
              >
                <Upload
                  className={`h-7 w-7 transition-colors ${
                    dragOver ? "text-sky-400" : "text-white/40 group-hover:text-sky-400"
                  }`}
                />
              </div>
              <div>
                <p className="text-sm font-bold text-white/80">
                  Drag & drop your CSV file here
                </p>
                <p className="text-xs text-white/40 mt-1">
                  or click to browse — accepts .csv files only
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Error Message ──────────────────────────────────── */}
        {errorMessage && (
          <div className="flex items-center gap-3 rounded-[24px] border border-rose-400/20 bg-rose-500/8 px-5 py-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400" />
            <p className="text-sm font-medium text-rose-200 flex-1">
              {errorMessage}
            </p>
            <button onClick={() => setErrorMessage(null)} className="text-rose-300/60 hover:text-rose-300 transition">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ── Preview Table ──────────────────────────────────── */}
        {status === "previewing" && (
          <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black text-white">
                  Preview — {totalRows} row{totalRows !== 1 ? "s" : ""} detected
                </h2>
                <p className="text-xs text-white/40 mt-0.5">
                  Showing first {Math.min(5, previewRows.length)} rows
                </p>
              </div>
              <button
                onClick={reset}
                className="flex items-center gap-1.5 text-xs text-white/40 hover:text-rose-400 transition"
              >
                <X className="h-3.5 w-3.5" /> Remove
              </button>
            </div>

            {/* File badge */}
            <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <FileSpreadsheet className="h-4 w-4 text-sky-400" />
              <span className="text-xs font-mono text-white/70">
                {file?.name}
              </span>
              <span className="text-[10px] text-white/30">
                ({(file?.size ?? 0 / 1024).toFixed(1)} KB)
              </span>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.03]">
                    <th className="px-3 py-2.5 text-left font-black text-white/50 uppercase tracking-wider text-[10px]">
                      #
                    </th>
                    {previewHeaders.map((h, i) => (
                      <th
                        key={i}
                        className={`px-3 py-2.5 text-left font-black uppercase tracking-wider text-[10px] ${
                          REQUIRED_COLUMNS.includes(h)
                            ? "text-emerald-300/70"
                            : "text-white/50"
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, ri) => (
                    <tr
                      key={ri}
                      className="border-b border-white/5 hover:bg-white/[0.02] transition"
                    >
                      <td className="px-3 py-2 text-white/30 font-mono">
                        {ri + 1}
                      </td>
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          className="px-3 py-2 text-white/70 max-w-[200px] truncate"
                        >
                          {cell || (
                            <span className="text-white/20 italic">empty</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Import button */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={reset}
                className="rounded-2xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-white/60 hover:bg-white/10 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                className="inline-flex items-center gap-2 rounded-2xl bg-sky-500 hover:bg-sky-400 px-6 py-2.5 text-sm font-black text-white shadow-lg shadow-sky-500/20 transition"
              >
                <Upload className="h-4 w-4" />
                Import All ({totalRows} row{totalRows !== 1 ? "s" : ""})
              </button>
            </div>
          </div>
        )}

        {/* ── Uploading State ────────────────────────────────── */}
        {status === "uploading" && (
          <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-10 text-center animate-in fade-in duration-300">
            <Loader2 className="h-10 w-10 text-sky-400 animate-spin mx-auto mb-4" />
            <p className="text-sm font-bold text-white/80">
              Importing {totalRows} waybill{totalRows !== 1 ? "s" : ""}…
            </p>
            <p className="text-xs text-white/40 mt-1">
              This may take a moment for large files
            </p>
          </div>
        )}

        {/* ── Results ────────────────────────────────────────── */}
        {status === "done" && importResult && (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-3 duration-500">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-[24px] border border-emerald-400/20 bg-emerald-500/8 p-5 text-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-400 mx-auto mb-2" />
                <div className="text-3xl font-black text-emerald-300">
                  {importResult.created}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300/60 mt-1">
                  Created
                </div>
              </div>
              <div className="rounded-[24px] border border-rose-400/20 bg-rose-500/8 p-5 text-center">
                <AlertTriangle className="h-6 w-6 text-rose-400 mx-auto mb-2" />
                <div className="text-3xl font-black text-rose-300">
                  {importResult.failed}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-rose-300/60 mt-1">
                  Failed
                </div>
              </div>
              <div className="rounded-[24px] border border-amber-400/20 bg-amber-500/8 p-5 text-center">
                <FileText className="h-6 w-6 text-amber-400 mx-auto mb-2" />
                <div className="text-3xl font-black text-amber-300">
                  {importResult.duplicates}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300/60 mt-1">
                  Duplicates
                </div>
              </div>
            </div>

            {/* Per-row results */}
            {importResult.results.length > 0 && (
              <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
                <h3 className="text-sm font-black text-white mb-3">
                  Row-by-Row Results
                </h3>
                <div className="max-h-[360px] overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                  {importResult.results.map((r) => (
                    <div
                      key={r.row}
                      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all duration-200 ${
                        r.status === "created"
                          ? "border-emerald-400/20 bg-emerald-500/5"
                          : r.status === "failed"
                          ? "border-rose-400/20 bg-rose-500/5"
                          : "border-amber-400/20 bg-amber-500/5"
                      }`}
                    >
                      {/* Status icon */}
                      {r.status === "created" && (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      )}
                      {r.status === "failed" && (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                      )}
                      {r.status === "duplicate" && (
                        <FileText className="h-4 w-4 shrink-0 text-amber-400" />
                      )}

                      {/* Row number */}
                      <span className="text-xs font-mono text-white/40 w-12 shrink-0">
                        Row {r.row}
                      </span>

                      {/* Status badge */}
                      <span
                        className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                          r.status === "created"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : r.status === "failed"
                            ? "bg-rose-500/15 text-rose-300"
                            : "bg-amber-500/15 text-amber-300"
                        }`}
                      >
                        {r.status}
                      </span>

                      {/* Tracking number or error */}
                      <span className="ml-auto text-xs font-mono truncate max-w-[200px]">
                        {r.trackingNumber && (
                          <span className="text-white/70">
                            {r.trackingNumber}
                          </span>
                        )}
                        {r.error && (
                          <span className="text-rose-300/80">{r.error}</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Import another */}
            <div className="flex justify-center pt-2">
              <button
                onClick={reset}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-bold text-white/70 hover:bg-white/10 transition"
              >
                <Upload className="h-4 w-4" />
                Import Another File
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
