import React, { useEffect, useMemo, useState } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableRow, TableContainer,
  Badge, Search, Filter, AlertTriangle, Clock, Truck, FileText, RefreshCw,
  Menu, MoreHorizontal, Edit3, Trash2,
} from "lucide-react";
import { api } from "../api/client";

type TransactionRecord = {
  id: string;
  entityType: "waybill" | "trip" | "shipment" | "invoice" | "collection" | "return";
  entityId: string;
  entityReference: string;
  action: "created" | "updated" | "status_changed" | "deleted" | "approved" | "rejected";
  fieldChanged: string | null;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string | null;
  changedByName: string | null;
  changedAt: string;
  companyId: string;
  ipAddress: string | null;
  userAgent: string | null;
};

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  created: { label: "Created", color: "bg-green-100 text-green-800" },
  updated: { label: "Updated", color: "bg-blue-100 text-blue-800" },
  status_changed: { label: "Status Changed", color: "bg-amber-100 text-amber-800" },
  deleted: { label: "Deleted", color: "bg-red-100 text-red-800" },
  approved: { label: "Approved", color: "bg-green-100 text-green-800" },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-800" },
};

const ENTITY_ICONS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  waybill: FileText,
  trip: Truck,
  shipment: Package,
  invoice: Receipt,
  collection: Truck,
  return: AlertTriangle,
};

function Package({ size, strokeWidth, className }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={className}>
      <path d="M21 15V4a2 2 0 00-2-2H5a2 2 0 00-2 2v4l4 2 4 2zM3 10l5 2.5M7 15l5 2.5M3 10l5-2.5M7 15l5-2.5m0 0v5m0-5v-5m5 5v-2.5m-5 2.5v5m-5-2.5v-5m5 2.5v-2.5m-5-2.5v5" />
    </svg>
  );
}

function Receipt({ size, strokeWidth, className }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={className}>
      <path d="M9 17h3m-3 3h3m-3 0h.01M9 17V5m0 0L6 9m3 3l-3 3m3-3V9m0 0l3 3m-3 3h.01M16 17h3m-3 3h.01M16 17V9m0 0l3 3m-3-3h.01M12 13v8m0-13V1m0 0l3 3m-3 3V1m0 0l-3 3m3 3v8m0-13V1" />
    </svg>
  );
}

export default function TransactionLog() {
  const [records, setRecords] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [entityFilter, setEntityFilter] = useState<string>("");
  const [actionFilter, setActionFilter] = useState<string>("");

  useEffect(() => {
    let alive = true;
    api.get<{ data: TransactionRecord[] }>("/audit/transactions")
      .then((r) => { if (alive) setRecords(r.data?.data ?? r.data ?? []); })
      .catch((e) => { if (alive) setError(e.message ?? "Failed to load transaction log"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      const matchesQuery = query === "" ||
        r.entityReference.toLowerCase().includes(query.toLowerCase()) ||
        r.action.toLowerCase().includes(query.toLowerCase()) ||
        (r.changedByName ?? "").toLowerCase().includes(query.toLowerCase()) ||
        (r.fieldChanged ?? "").toLowerCase().includes(query.toLowerCase());
      const matchesEntity = entityFilter === "" || r.entityType === entityFilter;
      const matchesAction = actionFilter === "" || r.action === actionFilter;
      return matchesQuery && matchesEntity && matchesAction;
    });
  }, [records, query, entityFilter, actionFilter]);

  const stats = useMemo(() => ({
    total: records.length,
    created: records.filter(r => r.action === "created").length,
    updated: records.filter(r => r.action === "updated").length,
    statusChanged: records.filter(r => r.action === "status_changed").length,
  }), [records]);

  return (
    <div className="p-6 bg-[#07111f] min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white mb-1">Transaction Log</h1>
          <p className="text-sm text-white/50">Audit trail of all waybill, trip, and shipment changes</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setLoading(true); api.get("/audit/transactions").then(() => {}).finally(() => setLoading(false)); }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm hover:bg-white/10 transition"
          >
            <RefreshCw size={16} strokeWidth={2} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Events" value={stats.total} icon={<FileText size={24} strokeWidth={2} />} color="text-blue-400" />
        <StatCard title="Created" value={stats.created} icon={<Plus size={24} strokeWidth={2} />} color="text-green-400" />
        <StatCard title="Updated" value={stats.updated} icon={<Edit3 size={24} strokeWidth={2} />} color="text-blue-400" />
        <StatCard title="Status Changes" value={stats.statusChanged} icon={<AlertTriangle size={24} strokeWidth={2} />} color="text-amber-400" />
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 text-white/40 size={16}" />
          <input
            type="text"
            placeholder="Search entity reference, action, or user..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 pl-9 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 transition"
        >
          <option value="">All Entities</option>
          <option value="waybill">Waybill</option>
          <option value="trip">Trip</option>
          <option value="shipment">Shipment</option>
          <option value="invoice">Invoice</option>
          <option value="collection">Collection</option>
          <option value="return">Return</option>
        </select>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 transition"
        >
          <option value="">All Actions</option>
          <option value="created">Created</option>
          <option value="updated">Updated</option>
          <option value="status_changed">Status Changed</option>
          <option value="deleted">Deleted</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <TableContainer className="bg-white/5 border border-white/10 rounded-xl">
          <Table>
            <TableHead>
              <TableRow className="text-xs text-white/50 border-b border-white/10">
                <TableCell className="font-semibold px-4 py-3">Entity</TableCell>
                <TableCell className="font-semibold px-4 py-3">Reference</TableCell>
                <TableCell className="font-semibold px-4 py-3">Action</TableCell>
                <TableCell className="font-semibold px-4 py-3">Field Changed</TableCell>
                <TableCell className="font-semibold px-4 py-3 text-right">Old Value</TableCell>
                <TableCell className="font-semibold px-4 py-3 text-right">New Value</TableCell>
                <TableCell className="font-semibold px-4 py-3 text-right">Changed By</TableCell>
                <TableCell className="font-semibold px-4 py-3 text-right">Time</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((r) => {
                const actionInfo = ACTION_LABELS[r.action];
                const Icon = ENTITY_ICONS[r.entityType] || FileText;
                const changedAt = new Date(r.changedAt);

                return (
                  <TableRow
                    key={r.id}
                    className="border-b border-white/5 hover:bg-white/5 transition group"
                  >
                    <TableCell className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Icon size={14} strokeWidth={2} className="text-white/50" />
                        <span className="text-white/70 capitalize">{r.entityType}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-white font-mono">
                      {r.entityReference}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm">
                      <Badge className={actionInfo.color}>{actionInfo.label}</Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-white/50 font-mono">
                      {r.fieldChanged ?? <span className="italic">—</span>}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-white/40 font-mono text-right truncate max-w-[80px]">
                      {r.oldValue ?? <span className="italic">—</span>}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-white font-mono text-right truncate max-w-[80px]">
                      {r.newValue ?? <span className="italic text-white/40">—</span>}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-white/70">
                      {r.changedByName ?? <span className="text-white/40 italic">System</span>}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm font-mono text-right text-white/50">
                      {changedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="px-4 py-8 text-center text-white/40">
                    No transaction records found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </div>

      {loading && (
        <div className="mt-8 flex items-center justify-center text-white/40 text-sm">
          Loading transaction log…
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