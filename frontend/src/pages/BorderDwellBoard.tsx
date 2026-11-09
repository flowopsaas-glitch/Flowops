import React, { useEffect, useMemo, useState } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableRow, Alert,
} from "@/components/ui";
import { Badge, Search, Clock, Truck, MapPin, RefreshCw } from "lucide-react";
import { api } from "../api/client";

type DwellSession = {
  id: string;
  companyId: string;
  postId: string;
  postCode: string;
  postName: string;
  geofenceId: string;
  driverId: string | null;
  driverName: string | null;
  state: "CLOSED" | "GAPPED" | "OPEN";
  enteredAt: string;
  enteredFromFixAt: string | null;
  exitedAt: string | null;
  exitedFromFixAt: string | null;
  sampleCount: number;
  precisionSeconds: number | null;
  gapLargestSeconds: number | null;
  direction: "INBOUND" | "OUTBOUND";
  source: "GPS_PORTAL" | "MANUAL";
  createdAt: string;
  updatedAt: string;
};

const STATE_LABELS: Record<string, { label: string; color: string }> = {
  CLOSED: { label: "Closed", color: "bg-green-100 text-green-800" },
  GAPPED: { label: "Gapped", color: "bg-amber-100 text-amber-800" },
  OPEN: { label: "Open", color: "bg-blue-100 text-blue-800" },
};

const DIRECTION_LABELS: Record<string, string> = {
  INBOUND: "Inbound",
  OUTBOUND: "Outbound",
};

export default function BorderDwellBoard() {
  const [sessions, setSessions] = useState<DwellSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("");

  useEffect(() => {
    let alive = true;
    api.get<DwellSession[]>("/border-dwell/sessions")
      .then((r) => { if (alive) setSessions(r.data ?? []); })
      .catch((e) => { if (alive) setError(e.message ?? "Failed to load dwell sessions"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      const matchesQuery = query === "" ||
        s.postCode.toLowerCase().includes(query.toLowerCase()) ||
        s.postName.toLowerCase().includes(query.toLowerCase()) ||
        (s.driverName ?? "").toLowerCase().includes(query.toLowerCase()) ||
        s.id.toLowerCase().includes(query.toLowerCase());
      const matchesState = stateFilter === "" || s.state === stateFilter;
      return matchesQuery && matchesState;
    });
  }, [sessions, query, stateFilter]);

  const stats = useMemo(() => ({
    total: sessions.length,
    closed: sessions.filter(s => s.state === "CLOSED").length,
    gapped: sessions.filter(s => s.state === "GAPPED").length,
    open: sessions.filter(s => s.state === "OPEN").length,
  }), [sessions]);

  return (
    <div className="min-h-full bg-[#07111f]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white mb-1">Border Dwell Board</h1>
          <p className="text-sm text-white/50">Monitor border dwell sessions across all posts</p>
        </div>
        <button
          onClick={() => { setLoading(true); api.get("/border-dwell/sessions").then(() => {}).finally(() => setLoading(false)); }}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm hover:bg-white/10 transition"
        >
          <RefreshCw size={16} strokeWidth={2} /> Refresh
        </button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          {error}
        </Alert>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Sessions" value={stats.total} icon={<Clock size={24} strokeWidth={2} />} color="text-blue-400" />
        <StatCard title="Closed" value={stats.closed} icon={<Truck size={24} strokeWidth={2} />} color="text-green-400" />
        <StatCard title="Gapped" value={stats.gapped} icon={<MapPin size={24} strokeWidth={2} />} color="text-amber-400" />
        <StatCard title="Open" value={stats.open} icon={<Search size={24} strokeWidth={2} />} color="text-red-400" />
      </div>

      {/* Search & filter */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 text-white/40 size={16}" />
          <input
            type="text"
            placeholder="Search post code, driver, or session ID..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 pl-9 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 transition"
        >
          <option value="">All States</option>
          <option value="CLOSED">Closed</option>
          <option value="GAPPED">Gapped</option>
          <option value="OPEN">Open</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <div className="bg-white/5 border border-white/10 rounded-xl">
          <Table>
            <TableHead>
              <TableRow className="text-xs text-white/50 border-b border-white/10">
                <TableCell className="font-semibold px-4 py-3">Session ID</TableCell>
                <TableCell className="font-semibold px-4 py-3">Post</TableCell>
                <TableCell className="font-semibold px-4 py-3">Driver</TableCell>
                <TableCell className="font-semibold px-4 py-3">State</TableCell>
                <TableCell className="font-semibold px-4 py-3">Direction</TableCell>
                <TableCell className="font-semibold px-4 py-3">Source</TableCell>
                <TableCell className="font-semibold px-4 py-3 text-right">Entered</TableCell>
                <TableCell className="font-semibold px-4 py-3 text-right">Exited</TableCell>
                <TableCell className="font-semibold px-4 py-3 text-right">Duration</TableCell>
                <TableCell className="font-semibold px-4 py-3 text-right">Samples</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((s) => {
                const stateInfo = STATE_LABELS[s.state];
                const entered = new Date(s.enteredAt);
                const exited = s.exitedAt ? new Date(s.exitedAt) : null;
                const durationMinutes = exited
                  ? Math.round((exited.getTime() - entered.getTime()) / 1000 / 60)
                  : null;

                return (
                  <TableRow
                    key={s.id}
                    className="border-b border-white/5 hover:bg-white/5 transition group"
                  >
                    <TableCell className="px-4 py-3 text-sm text-white font-mono">
                      {s.id.slice(-8)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm">
                      <div className="text-white font-medium">{s.postCode}</div>
                      <div className="text-xs text-white/40">{s.postName}</div>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm">
                      {s.driverName ?? <span className="text-white/40 italic">—</span>}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm">
                      <Badge className={stateInfo.color}>{stateInfo.label}</Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-white/70">
                      {DIRECTION_LABELS[s.direction]}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-white/50">
                      {s.source}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-white font-mono text-right">
                      {entered.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm font-mono text-right">
                      {exited
                        ? exited.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : <span className="text-white/40 italic">—</span>}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm font-mono text-right">
                      {durationMinutes !== null ? `${durationMinutes} min` : <span className="text-white/40 italic">—</span>}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-white/70 text-right">
                      {s.sampleCount}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="px-4 py-8 text-center text-white/40">
                    No dwell sessions found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {loading && (
        <div className="mt-8 flex items-center justify-center text-white/40 text-sm">
          Loading dwell sessions…
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