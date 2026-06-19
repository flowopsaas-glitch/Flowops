import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Truck,
  RefreshCw,
  Save,
  Sparkles,
  Search,
  Bot,
  Filter,
} from "lucide-react";
import { api } from '../api/client';
import { exportCsv, csvFilename } from '../lib/exportCsv';

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

// Real Prisma enum values
type CollectionStatus = "PENDING" | "ASSIGNED" | "IN_PROGRESS" | "COLLECTED" | "FAILED" | "CANCELLED";
type StatusFilter = "ALL" | CollectionStatus;

// Matches the actual Prisma Collection model fields
type CollectionRow = {
  id: string;
  companyId: string;
  status: CollectionStatus;
  clientName?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  pickupAddress?: string | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  notes?: string | null;
  scheduledAt?: string | null;
  driverId?: string | null;
  driver?: { id: string; name: string; vehicleType?: string | null; status?: string | null } | null;
  createdAt?: string;
  updatedAt?: string;
};

type DriverRow = {
  id: string;
  name: string;
  phone?: string | null;
  vehicleType?: string | null;
  vehicleReg?: string | null;
  status?: string | null;
};

function pickArray<T>(payload: any): T[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return d.toISOString().slice(0, 16).replace("T", " ");
}

function statusPill(status: string) {
  const base = "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-extrabold border";
  if (status === "COMPLETED") return `${base} border-emerald-400/30 bg-emerald-500/10 text-emerald-200`;
  if (status === "IN_PROGRESS") return `${base} border-sky-400/30 bg-sky-500/10 text-sky-200`;
  return `${base} border-white/10 bg-white/10 text-white/80`;
}

export default function Collections() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<CollectionRow[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  // 🚀 AI Suggestion Engine States
  const [suggestion, setSuggestion] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Form States
  const [name, setName] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [collectionAddress, setCollectionAddress] = useState("");
  const [parcelCount, setParcelCount] = useState("0");
  const [palletCount, setPalletCount] = useState("0");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");

  async function loadAll(mode: "initial" | "refresh" = "initial") {
    try {
      if (mode === "initial") setLoading(true);
      if (mode === "refresh") setRefreshing(true);
      setError(""); // Clear previous errors to satisfy CLAW

      const [collectionsRes, driversRes] = await Promise.all([
        api.get("/collections"),
        api.get("/drivers"),
      ]);

      // api client auto-unwraps the HTTP body; don't access .data on top
      const collectionsData = pickArray<CollectionRow>(collectionsRes);
      const driversData = pickArray<DriverRow>(driversRes);

      setRows(collectionsData);
      setDrivers(driversData);

      // Auto-select first item if none is currently selected and we have data
      if (collectionsData.length > 0 && selectedId === null) {
        setSelectedId(collectionsData[0].id);
      }
    } catch (err: any) {
      console.error("Fetch Error:", err);
      setError("System Sync Failed: Check Backend Routes");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { loadAll("initial"); }, []);

  useEffect(() => {
    if (!rows.length) return;
    const requestedId = searchParams.get("collectionId");
    if (requestedId) {
      const found = rows.find((r) => String(r.id) === requestedId);
      if (found && selectedId !== found.id) setSelectedId(found.id);
      return;
    }
    if (selectedId === null && rows.length > 0) setSelectedId(rows[0].id);
  }, [rows, searchParams, selectedId]);

  useEffect(() => {
    if (selectedId === null) return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("collectionId", String(selectedId));
      return next;
    });
  }, [selectedId, setSearchParams]);

  const filtered = useMemo(() => rows.filter(r =>
    (showCancelled || r.status !== 'CANCELLED') &&
    (statusFilter === 'ALL' || r.status === statusFilter) &&
    (r.clientName ?? '').toLowerCase().includes(query.toLowerCase())
  ), [rows, query, showCancelled, statusFilter]);

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);

  const stats = useMemo(() => ({
    total:      rows.filter(r => r.status !== 'CANCELLED').length,
    pending:    rows.filter(r => r.status === 'PENDING').length,
    assigned:   rows.filter(r => r.status === 'ASSIGNED').length,
    inProgress: rows.filter(r => r.status === 'IN_PROGRESS').length,
    collected:  rows.filter(r => r.status === 'COLLECTED').length,
    failed:     rows.filter(r => r.status === 'FAILED').length,
    unassigned: rows.filter(r => !r.driverId && r.status === 'PENDING').length,
    drivers:    drivers.length,
    available:  drivers.filter(d => d.status === 'AVAILABLE').length,
  }), [rows, drivers]);

  async function handleAutoSuggest(id: string) {
    setIsAnalyzing(true);
    setSuggestion(null);
    setError("");
    try {
      const res: any = await api.get(`/collections/${id}/auto-suggest`);
      const suggestion = res?.data ?? res;
      if (suggestion && suggestion.id) {
        setSuggestion(suggestion);
      } else {
        setError("AI: No suitable drivers found.");
      }
    } catch {
      setError("AI Engine: Optimization service offline.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleAssignDriver(collectionId: string, nextDriverId: string) {
    setSaving(true);
    try {
      await api.patch(`/collections/${collectionId}`, {
        driverId: nextDriverId,
        status: "IN_PROGRESS",
      });
      setSuccess("Dispatch confirmed.");
      setSuggestion(null);
      loadAll("refresh");
    } catch (err: any) {
      setError(err?.message || "Failed to assign driver.");
    } finally { setSaving(false); }
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(43,76,168,0.16),transparent_30%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8 text-white">
      <div className="mx-auto max-w-[1700px] space-y-6">
        
        {/* STAT BAR */}
        <div className="rounded-[30px] border border-white/10 bg-white/6 p-6 shadow-2xl backdrop-blur-2xl">
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/85 ring-1 ring-white/15 mb-4">
                <Truck className="h-4 w-4" /> Tenant Collection + Driver Control
              </div>
              <h1 className="text-4xl font-black tracking-tight">Collections</h1>
            </div>
            <button onClick={() => loadAll("refresh")} className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 hover:bg-white/15 transition">
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} /> Refresh Workspace
            </button>
            <button
              onClick={() => exportCsv(
                rows.map((r) => ({
                  client:   r.clientName ?? "",
                  status:   r.status,
                  address:  r.pickupAddress ?? "",
                  phone:    r.clientPhone ?? "",
                  driver:   r.driver?.name ?? "",
                  created:  r.createdAt ?? "",
                })),
                csvFilename("collections"),
                [
                  { key: "client",  label: "Client"       },
                  { key: "status",  label: "Status"       },
                  { key: "address", label: "Address"      },
                  { key: "phone",   label: "Phone"        },
                  { key: "driver",  label: "Driver"       },
                  { key: "created", label: "Created"      },
                ]
              )}
              className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 hover:bg-white/15 transition text-sm font-bold text-white/70"
            >
              <Save className="h-4 w-4" /> CSV
            </button>
          </div>
          
          {error && <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400 font-bold">{error}</div>}
          {success && <div className="mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-sm text-emerald-400 font-bold">{success}</div>}

          <div className="grid grid-cols-9 gap-4 text-center">
             <StatCard label="Active" value={stats.total} />
             <StatCard label="Pending" value={stats.pending} />
             <StatCard label="Assigned" value={stats.assigned} />
             <StatCard label="In Progress" value={stats.inProgress} />
             <StatCard label="Collected" value={stats.collected} />
             <StatCard label="Failed" value={stats.failed} />
             <StatCard label="Unassigned" value={stats.unassigned} />
             <StatCard label="Drivers" value={stats.drivers} />
             <StatCard label="Available" value={stats.available} />
          </div>
        </div>

        {/* STATUS FILTER TABS */}
        <div className="flex flex-wrap gap-2">
          <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.2em] text-white/30 self-center mr-2">
            <Filter className="h-3 w-3" /> Filter
          </span>
          {(["ALL", "PENDING", "ASSIGNED", "IN_PROGRESS", "COLLECTED", "FAILED"] as StatusFilter[]).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-wider transition",
                statusFilter === s
                  ? s === "ALL" ? "border-sky-400/40 bg-sky-500/15 text-sky-300"
                    : s === "PENDING" ? "border-amber-400/40 bg-amber-500/15 text-amber-300"
                    : s === "ASSIGNED" ? "border-violet-400/40 bg-violet-500/15 text-violet-300"
                    : s === "IN_PROGRESS" ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-300"
                    : s === "COLLECTED" ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
                    : "border-rose-400/40 bg-rose-500/15 text-rose-300"
                  : "border-white/8 bg-white/3 text-white/40 hover:border-white/20 hover:text-white/70"
              )}
            >
              {s === "ALL" ? `All (${stats.total})` :
               s === "PENDING" ? `Pending (${stats.pending})` :
               s === "ASSIGNED" ? `Assigned (${stats.assigned})` :
               s === "IN_PROGRESS" ? `In Progress (${stats.inProgress})` :
               s === "COLLECTED" ? `Collected (${stats.collected})` :
               `Failed (${stats.failed})`}
            </button>
          ))}
        </div>

        {/* FORMS */}
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 shadow-xl">
            <h3 className="text-lg font-black mb-5">Create Collection</h3>
            <div className="grid gap-4">
              <Field label="Collection Name"><input value={name} onChange={e=>setName(e.target.value)} placeholder="GoGet Johannesburg Pickup" className="w-full rounded-2xl border border-white/10 bg-black/20 p-4 outline-none focus:border-blue-400/40" /></Field>
              <div className="grid grid-cols-2 gap-4">
                 <Field label="Reference No"><input value={referenceNo} onChange={e=>setReferenceNo(e.target.value)} placeholder="COL-2026-001" className="w-full rounded-2xl border border-white/10 bg-black/20 p-4 outline-none" /></Field>
                 <Field label="Company Name"><input value={companyName} onChange={e=>setCompanyName(e.target.value)} placeholder="GoGet Couriers" className="w-full rounded-2xl border border-white/10 bg-black/20 p-4 outline-none" /></Field>
              </div>
              <Field label="Collection Address"><textarea value={collectionAddress} onChange={e=>setCollectionAddress(e.target.value)} className="min-h-[90px] w-full rounded-2xl border border-white/10 bg-black/20 p-4 outline-none" /></Field>
              <button
                disabled={saving}
                onClick={async () => {
                  if (!name.trim() || !collectionAddress.trim()) {
                    setError("Client name and pickup address are required.");
                    return;
                  }
                  setSaving(true); setError(""); setSuccess("");
                  try {
                    await api.post("/collections", {
                      clientName:    name,
                      clientPhone:   driverPhone || "N/A",
                      pickupAddress: collectionAddress,
                      notes:         referenceNo || undefined,
                    });
                    setSuccess("Collection created.");
                    setName(""); setCollectionAddress(""); setReferenceNo(""); setCompanyName("");
                    loadAll("refresh");
                  } catch (err: any) {
                    setError(err?.message || "Failed to create collection.");
                  } finally { setSaving(false); }
                }}
                className="bg-blue-600 p-4 rounded-2xl font-bold flex justify-center gap-2 hover:bg-blue-500 transition-colors disabled:opacity-60"
              >
                <Save className="h-5 w-5"/> {saving ? "Creating…" : "Create Collection"}
              </button>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 shadow-xl">
            <h3 className="text-lg font-black mb-5">Tenant Driver Fleet + Tracking</h3>
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                 <Field label="Driver Name"><input value={driverName} onChange={e=>setDriverName(e.target.value)} placeholder="Sipho Dlamini" className="w-full rounded-2xl border border-white/10 bg-black/20 p-4 outline-none focus:border-emerald-400/40" /></Field>
                 <Field label="Phone"><input value={driverPhone} onChange={e=>setDriverPhone(e.target.value)} placeholder="0821234567" className="w-full rounded-2xl border border-white/10 bg-black/20 p-4 outline-none" /></Field>
              </div>
              <button
                disabled={saving || !driverName.trim()}
                onClick={async () => {
                  if (!driverName.trim()) {
                    setError("Driver name is required.");
                    return;
                  }
                  setSaving(true); setError(""); setSuccess("");
                  try {
                    await api.post("/drivers", {
                      name:  driverName.trim(),
                      phone: driverPhone.trim() || undefined,
                      status: "AVAILABLE",
                    });
                    setSuccess("Driver added to fleet.");
                    setDriverName(""); setDriverPhone("");
                    loadAll("refresh");
                  } catch (err: any) {
                    setError(err?.message || "Failed to add driver.");
                  } finally { setSaving(false); }
                }}
                className="bg-emerald-600 p-4 rounded-2xl font-bold flex justify-center gap-2 mt-4 hover:bg-emerald-500 transition-colors disabled:opacity-60"
              >
                <Save className="h-5 w-5"/> {saving ? "Adding…" : "Add Driver"}
              </button>
            </div>
          </div>
        </div>

        {/* DASHBOARD LIST & AI SELECTION */}
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-[28px] border border-white/10 bg-white/6 p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-lg">Collections Dashboard</h3>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-30" />
                <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search..." className="w-full bg-black/20 border border-white/10 rounded-xl py-2 pl-9 pr-4 text-sm outline-none focus:border-white/30" />
              </div>
            </div>
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {filtered.map(row => (
                <button key={row.id} onClick={()=>setSelectedId(row.id)} className={cn("w-full rounded-2xl p-5 text-left border transition-all", selectedId === row.id ? "bg-blue-500/15 border-blue-400/40 shadow-lg" : "bg-black/20 border-white/5 hover:border-white/20")}>
                  <div className="flex justify-between font-black uppercase text-xs tracking-widest">
                    <span>{row.clientName ?? "—"}</span>
                    <span className={statusPill(row.status)}>{row.status}</span>
                  </div>
                  <div className="text-[10px] mt-2 opacity-40 uppercase tracking-widest">{row.pickupAddress || "No Address Provided"}</div>
                  {row.driver && (
                    <div className="text-[10px] mt-1 text-cyan-400/70 font-bold">
                      Driver: {row.driver.name}
                    </div>
                  )}
                </button>
              ))}
              {filtered.length === 0 && !loading && (
                <div className="text-center p-10 text-white/30 font-bold uppercase tracking-widest text-sm">No collections found.</div>
              )}
            </div>
          </div>

          <div className="min-h-[500px]">
            {selected ? (
              <div className="rounded-[28px] border border-white/10 bg-white/6 p-8 shadow-2xl animate-in fade-in duration-300 h-full flex flex-col">
                <h2 className="text-3xl font-black tracking-tighter mb-8">{selected.clientName ?? "Collection"}</h2>
                
                {/* 🚀 AI Suggestion Module */}
                <div className="space-y-6 flex-1">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.3em] opacity-30">Logistics AI Layer</label>
                    <button onClick={() => handleAutoSuggest(selected.id)} disabled={isAnalyzing} className="flex w-full items-center justify-center gap-3 rounded-2xl border border-fuchsia-500/40 bg-fuchsia-500/10 py-5 text-sm font-black text-fuchsia-200 hover:bg-fuchsia-500/20 disabled:opacity-50 transition-all shadow-lg active:scale-95">
                      <Sparkles className={cn("h-5 w-5", isAnalyzing && "animate-spin")} />
                      {isAnalyzing ? "Analyzing Asset Proximity..." : "Ask FlowOps AI for Best Fit"}
                    </button>
                  </div>

                  {suggestion && (
                    <div className="rounded-3xl border-2 border-emerald-500/30 bg-emerald-500/5 p-7 animate-in slide-in-from-top-6 duration-500 backdrop-blur-3xl">
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2 text-[10px] font-black text-emerald-400 tracking-[0.2em]"><Bot className="h-5 w-5"/> AI RECOMMENDATION</div>
                        <div className="bg-emerald-500 text-black px-4 py-1.5 rounded-full text-[11px] font-black">{suggestion.matchScore || 98}% MATCH</div>
                      </div>
                      <div className="text-2xl font-black mb-1">{suggestion.name}</div>
                      <div className="text-sm font-bold opacity-50 mb-6 uppercase tracking-widest">{suggestion.vehicleType || "Standard Vehicle"} • {suggestion.zone || "Local"}</div>
                      <div className="grid gap-3">
                        <button onClick={() => handleAssignDriver(selected.id, suggestion.id)} disabled={saving} className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-black py-4 rounded-2xl transition-all shadow-xl active:scale-95 disabled:opacity-50">
                          {saving ? "DISPATCHING..." : "CONFIRM AI DISPATCH"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            navigate(
                              `/driver-dispatch?collectionId=${encodeURIComponent(String(selected.id))}&reference=${encodeURIComponent(
                                selected.clientName || selected.id || ""
                              )}`
                            )
                          }
                          className="w-full rounded-2xl border border-white/10 bg-white/10 py-4 text-sm font-semibold text-white transition hover:bg-white/15"
                        >
                          Open in Dispatch
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="pt-6 border-t border-white/5 mt-auto">
                    <label className="text-[10px] font-black uppercase tracking-[0.3em] opacity-20 mb-4 block">Manual Override</label>
                    <DriverAssignButton drivers={drivers} disabled={saving} onAssign={(did)=>handleAssignDriver(selected.id, did)} />
                  </div>
                </div>

                <div className="mt-8 grid grid-cols-2 gap-4 font-mono text-[10px]">
                   <div className="bg-black/30 p-4 rounded-2xl border border-white/5 uppercase"><div className="opacity-30 mb-1">Status</div>{selected.status}</div>
                   <div className="bg-black/30 p-4 rounded-2xl border border-white/5 uppercase truncate"><div className="opacity-30 mb-1">Address</div>{selected.pickupAddress || "N/A"}</div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-[40px] h-full text-white/10 p-20 text-center uppercase tracking-widest font-black opacity-20">
                {loading ? "Syncing Workspace..." : "Select request to initialize dispatch"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string, value: string | number }) {
  return (
    <div className="rounded-[18px] border border-white/5 bg-black/20 p-4">
      <div className="text-[10px] font-extrabold uppercase tracking-widest opacity-40 mb-1">{label}</div>
      <div className="text-2xl font-black">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-30 ml-1">{label}</span>
      {children}
    </label>
  );
}

function DriverAssignButton({ drivers, disabled, onAssign }: { drivers: any[], disabled: boolean, onAssign: (id: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <div className="flex gap-4">
      <select value={val} onChange={(e)=>setVal(e.target.value)} className="flex-1 bg-black/60 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm outline-none">
        <option value="">Manual fleet asset...</option>
        {drivers.map(d => <option key={d.id} value={String(d.id)}>{d.name} — {d.vehicleType || 'No Vehicle'}</option>)}
      </select>
      <button disabled={disabled || !val} onClick={()=>{onAssign(val); setVal("");}} className="bg-blue-600 px-10 rounded-2xl font-black text-xs uppercase tracking-[0.2em] active:scale-95 transition-all hover:bg-blue-500 disabled:opacity-50">Assign</button>
    </div>
  );
}
