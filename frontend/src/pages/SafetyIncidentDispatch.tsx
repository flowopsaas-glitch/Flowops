import React, { useEffect, useMemo, useState } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableRow, TableContainer,
  Badge, Search, Filter, AlertTriangle, ShieldAlert, Clock, MapPin,
  RefreshCw, Plus, Users, FileText,
} from "lucide-react";
import { api } from "../api/client";

type SafetyIncident = {
  id: string;
  companyId: string;
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "REPORTED" | "CORROBORATED" | "VERIFIED" | "REJECTED" | "WITHDRAWN";
  reportedByDriverId: string | null;
  reportedByDriverName: string | null;
  reportedByUserId: string | null;
  reportedByUserName: string | null;
  reportedAt: string;
  reportLat: number;
  reportLng: number;
  locationSource: string;
  geohash6: string | null;
  narrative: string | null;
  verifiedByUserId: string | null;
  verifiedByUserName: string | null;
  verifiedAt: string | null;
  rejectedByUserId: string | null;
  rejectedByUserName: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  zoneId: string | null;
  broadcastCount: number;
  createdAt: string;
  updatedAt: string;
};

const SEVERITY_COLORS: Record<string, string> = {
  LOW: "bg-green-100 text-green-800",
  MEDIUM: "bg-blue-100 text-blue-800",
  HIGH: "bg-amber-100 text-amber-800",
  CRITICAL: "bg-red-100 text-red-800",
};

const STATUS_COLORS: Record<string, string> = {
  REPORTED: "bg-blue-100 text-blue-800",
  CORROBORATED: "bg-amber-100 text-amber-800",
  VERIFIED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  WITHDRAWN: "bg-slate-100 text-slate-800",
};

export default function SafetyIncidentDispatch() {
  const [incidents, setIncidents] = useState<SafetyIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  useEffect(() => {
    let alive = true;
    api.get<{ data: SafetyIncident[] }>("/safety-incidents")
      .then((r) => { if (alive) setIncidents(r.data?.data ?? r.data ?? []); })
      .catch((e) => { if (alive) setError(e.message ?? "Failed to load incidents"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    return incidents.filter((i) => {
      const matchesQuery = query === "" ||
        i.id.toLowerCase().includes(query.toLowerCase()) ||
        i.type.toLowerCase().includes(query.toLowerCase()) ||
        (i.reportedByDriverName ?? "").toLowerCase().includes(query.toLowerCase()) ||
        (i.reportedByUserName ?? "").toLowerCase().includes(query.toLowerCase()) ||
        (i.narrative ?? "").toLowerCase().includes(query.toLowerCase());
      const matchesStatus = statusFilter === "" || i.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [incidents, query, statusFilter]);

  const stats = useMemo(() => ({
    total: incidents.length,
    reported: incidents.filter(i => i.status === "REPORTED").length,
    verified: incidents.filter(i => i.status === "VERIFIED").length,
    critical: incidents.filter(i => i.severity === "CRITICAL").length,
  }), [incidents]);

  return (
    <div className="p-6 bg-[#07111f] min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white mb-1">Safety Incident Dispatch</h1>
          <p className="text-sm text-white/50">Review, verify, and action reported safety incidents</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {}}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm hover:bg-white/10 transition"
          >
            <AlertTriangle size={16} strokeWidth={2} className="text-red-400" />
            <span className="font-medium">Escalate Critical</span>
          </button>
          <button
            onClick={() => { setLoading(true); api.get("/safety-incidents").then(() => {}).finally(() => setLoading(false)); }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm hover:bg-white/10 transition"
          >
            <RefreshCw size={16} strokeWidth={2} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          {error}
        </Alert>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Incidents" value={stats.total} icon={<AlertTriangle size={24} strokeWidth={2} />} color="text-red-400" />
        <StatCard title="Reported" value={stats.reported} icon={<Clock size={24} strokeWidth={2} />} color="text-blue-400" />
        <StatCard title="Verified" value={stats.verified} icon={<ShieldAlert size={24} strokeWidth={2} />} color="text-green-400" />
        <StatCard title="Critical" value={stats.critical} icon={<MapPin size={24} strokeWidth={2} />} color="text-red-400" />
      </div>

      {/* Search & filter */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 text-white/40 size={16}" />
          <input
            type="text"
            placeholder="Search incident ID, type, reporter, or narrative..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 pl-9 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 transition"
        >
          <option value="">All Statuses</option>
          <option value="REPORTED">Reported</option>
          <option value="CORROBORATED">Corroborated</option>
          <option value="VERIFIED">Verified</option>
          <option value="REJECTED">Rejected</option>
          <option value="WITHDRAWN">Withdrawn</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <TableContainer className="bg-white/5 border border-white/10 rounded-xl">
          <Table>
            <TableHead>
              <TableRow className="text-xs text-white/50 border-b border-white/10">
                <TableCell className="font-semibold px-4 py-3">Incident ID</TableCell>
                <TableCell className="font-semibold px-4 py-3">Type</TableCell>
                <TableCell className="font-semibold px-4 py-3">Severity</TableCell>
                <TableCell className="font-semibold px-4 py-3">Status</TableCell>
                <TableCell className="font-semibold px-4 py-3">Reported By</TableCell>
                <TableCell className="font-semibold px-4 py-3">Narrative</TableCell>
                <TableCell className="font-semibold px-4 py-3 text-right">Reported At</TableCell>
                <TableCell className="font-semibold px-4 py-3 text-right">Broadcasts</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((i) => {
                const sevColor = SEVERITY_COLORS[i.severity];
                const statColor = STATUS_COLORS[i.status];
                const reportedBy = i.reportedByDriverName ?? i.reportedByUserName ?? "Unknown";
                const reportedAt = new Date(i.reportedAt);

                return (
                  <TableRow
                    key={i.id}
                    className="border-b border-white/5 hover:bg-white/5 transition group"
                  >
                    <TableCell className="px-4 py-3 text-sm text-white font-mono">
                      {i.id.slice(-8)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-white/70 capitalize">
                      {i.type.replace(/_/g, " ")}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm">
                      <Badge className={sevColor}>{i.severity}</Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm">
                      <Badge className={statColor}>{i.status}</Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-white/70">
                      {reportedBy}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-white/50 truncate max-w-[200px]">
                      {i.narrative ?? "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm font-mono text-right text-white/70">
                      {reportedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-white/50 text-right">
                      {i.broadcastCount}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="px-4 py-8 text-center text-white/40">
                    No incidents found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </div>

      {loading && (
        <div className="mt-8 flex items-center justify-center text-white/40 text-sm">
          Loading incidents…
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