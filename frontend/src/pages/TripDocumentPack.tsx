import React, { useEffect, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableRow, Badge } from "@/components/ui";
import { Search, FileText, Upload, CheckCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { api } from "../api/client";

type TripDocument = {
  id: string;
  companyId: string;
  tripId: string;
  tripReference: string;
  documentType: "HS_ORIGIN" | "CERTIFICATE_OF_ORIGIN" | "DUTY_ESTIMATE" | "DUTY_ACTUAL" | "DECLARATION" | "OTHER";
  documentRef: string | null;
  hsCode: string | null;
  originStatus: "PREFERENTIAL" | "NON_PREFERENTIAL" | "UNKNOWN" | null;
  dutyEstimated: number | null;
  dutyActual: number | null;
  declarationRef: string | null;
  capturedBy: string | null;
  capturedByName: string | null;
  capturedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const DOC_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  HS_ORIGIN: { label: "HS Code + Origin", color: "bg-blue-100 text-blue-800" },
  CERTIFICATE_OF_ORIGIN: { label: "Certificate of Origin", color: "bg-green-100 text-green-800" },
  DUTY_ESTIMATE: { label: "Duty Estimate", color: "bg-amber-100 text-amber-800" },
  DUTY_ACTUAL: { label: "Duty Actual", color: "bg-purple-100 text-purple-800" },
  DECLARATION: { label: "Declaration", color: "bg-indigo-100 text-indigo-800" },
  OTHER: { label: "Other", color: "bg-slate-100 text-slate-800" },
};

export default function TripDocumentPack() {
  const [documents, setDocuments] = useState<TripDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [docTypeFilter, setDocTypeFilter] = useState<string>("");

  useEffect(() => {
    let alive = true;
    api.get<TripDocument[]>("/trip-documents")
      .then((r) => { if (alive) setDocuments(r.data ?? []); })
      .catch((e) => { if (alive) setError(e.message ?? "Failed to load documents"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    return documents.filter((d) => {
      const matchesQuery = query === "" ||
        d.id.toLowerCase().includes(query.toLowerCase()) ||
        d.tripReference.toLowerCase().includes(query.toLowerCase()) ||
        (d.documentRef ?? "").toLowerCase().includes(query.toLowerCase()) ||
        (d.hsCode ?? "").toLowerCase().includes(query.toLowerCase()) ||
        (d.capturedByName ?? "").toLowerCase().includes(query.toLowerCase());
      const matchesType = docTypeFilter === "" || d.documentType === docTypeFilter;
      return matchesQuery && matchesType;
    });
  }, [documents, query, docTypeFilter]);

  const stats = useMemo(() => ({
    total: documents.length,
    hsOrigin: documents.filter(d => d.documentType === "HS_ORIGIN").length,
    dutyEstimate: documents.filter(d => d.documentType === "DUTY_ESTIMATE").length,
    dutyActual: documents.filter(d => d.documentType === "DUTY_ACTUAL").length,
  }), [documents]);

  return (
    <div className="p-6 bg-[#07111f] min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white mb-1">Trip Document Pack</h1>
          <p className="text-sm text-white/50">HS codes, origin status, and duty ESTIMATED vs ACTUAL records</p>
        </div>
        <button
          onClick={() => { setLoading(true); api.get("/trip-documents").then(() => {}).finally(() => setLoading(false)); }}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm hover:bg-white/10 transition"
        >
          <RefreshCw size={16} strokeWidth={2} /> Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Documents" value={stats.total} icon={<FileText size={24} strokeWidth={2} />} color="text-blue-400" />
        <StatCard title="HS + Origin" value={stats.hsOrigin} icon={<CheckCircle size={24} strokeWidth={2} />} color="text-green-400" />
        <StatCard title="Duty Estimate" value={stats.dutyEstimate} icon={<AlertTriangle size={24} strokeWidth={2} />} color="text-amber-400" />
        <StatCard title="Duty Actual" value={stats.dutyActual} icon={<Upload size={24} strokeWidth={2} />} color="text-purple-400" />
      </div>

      {/* Search & filter */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 text-white/40 size={16}" />
          <input
            type="text"
            placeholder="Search trip reference, document ref, HS code..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 pl-9 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          value={docTypeFilter}
          onChange={(e) => setDocTypeFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 transition"
        >
          <option value="">All Document Types</option>
          <option value="HS_ORIGIN">HS Code + Origin</option>
          <option value="CERTIFICATE_OF_ORIGIN">Certificate of Origin</option>
          <option value="DUTY_ESTIMATE">Duty Estimate</option>
          <option value="DUTY_ACTUAL">Duty Actual</option>
          <option value="DECLARATION">Declaration</option>
          <option value="OTHER">Other</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <div className="bg-white/5 border border-white/10 rounded-xl">
          <Table>
            <TableHead>
              <TableRow className="text-xs text-white/50 border-b border-white/10">
                <TableCell className="font-semibold px-4 py-3">Trip Reference</TableCell>
                <TableCell className="font-semibold px-4 py-3">Document Type</TableCell>
                <TableCell className="font-semibold px-4 py-3">HS Code</TableCell>
                <TableCell className="font-semibold px-4 py-3">Origin Status</TableCell>
                <TableCell className="font-semibold px-4 py-3 text-right">Duty Est.</TableCell>
                <TableCell className="font-semibold px-4 py-3 text-right">Duty Actual</TableCell>
                <TableCell className="font-semibold px-4 py-3 text-right">Variance</TableCell>
                <TableCell className="font-semibold px-4 py-3 text-right">Captured By</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((d) => {
                const docInfo = DOC_TYPE_LABELS[d.documentType];
                const variance = d.dutyEstimated !== null && d.dutyActual !== null
                  ? d.dutyActual - d.dutyEstimated
                  : null;

                return (
                  <TableRow
                    key={d.id}
                    className="border-b border-white/5 hover:bg-white/5 transition group"
                  >
                    <TableCell className="px-4 py-3 text-sm text-white font-mono">
                      {d.tripReference}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm">
                      <Badge className={docInfo.color}>{docInfo.label}</Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-white/70 font-mono">
                      {d.hsCode ?? <span className="text-white/40 italic">—</span>}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-white/70">
                      {d.originStatus ? d.originStatus.replace(/_/g, " ") : <span className="text-white/40 italic">—</span>}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm font-mono text-right text-white/70">
                      {d.dutyEstimated !== null ? `${d.dutyEstimated}` : <span className="text-white/40 italic">—</span>}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm font-mono text-right text-white/70">
                      {d.dutyActual !== null ? `${d.dutyActual}` : <span className="text-white/40 italic">—</span>}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm font-mono text-right">
                      {variance !== null
                        ? (variance >= 0 ? `+${variance}` : `${variance}`)
                        : <span className="text-white/40 italic">—</span>}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-white/70">
                      {d.capturedByName ?? <span className="text-white/40 italic">—</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="px-4 py-8 text-center text-white/40">
                    No documents found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {loading && (
        <div className="mt-8 flex items-center justify-center text-white/40 text-sm">
          Loading documents…
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon, color }: { title: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-white/40 uppercase tracking-wider font-bold">{title}</div>
          <div className="text-2xl font-black text-white mt-1">{value}</div>
        </div>
        <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
      </div>
    </div>
  );
}