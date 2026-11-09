import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  RefreshCw, Truck, MapPin, Clock, Package,
  PackagePlus, AlertTriangle, LayoutList, Map as MapIcon, ExternalLink,
  CheckSquare, Square, MessageCircle, Users, CheckCircle2,
  XCircle, Zap,
} from "lucide-react";
import { MapContainer, Marker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { api } from '../api/client';
import { CommandCenterHeader } from "../components/premium/CommandCenterHeader";
import { useToast } from "../components/toast-context";
import { useSocket } from "../hooks/useSocket";
import { useAuth } from "../contexts/auth-context";
import { getMapCoordinates, hasMapCoordinates } from "../lib/mapCoordinates";
import OpenStreetMapLayer from "../components/maps/OpenStreetMapLayer";

// --- CUSTOM MAP ICONS ---
const jobIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});

const driverIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});

// --- STYLING ---
const softCard = "rounded-[26px] border border-white/10 bg-white/[0.04] shadow-[0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl fx-lift";

function StatCard({ label, value, hint }: { label: string; value: number | string; hint: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">{label}</div>
      <div className="mt-3 text-2xl font-black text-white">{value}</div>
      <div className="mt-2 text-sm text-white/65">{hint}</div>
    </div>
  );
}

function addressArea(address?: string | null) {
  const value = address?.split(",").pop()?.trim();
  return value ? value.toUpperCase() : "Area not provided";
}

const DEFAULT_MAP_CENTER: [number, number] = [-26.2041, 28.0473];

function FitDispatchPoints({
  positions,
  selected,
}: {
  positions: [number, number][];
  selected: [number, number] | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (selected) {
      map.setView(selected, 12);
    } else if (positions.length === 1) {
      map.setView(positions[0], 12);
    } else if (positions.length > 1) {
      map.fitBounds(positions, { padding: [36, 36], maxZoom: 12 });
    } else {
      map.setView(DEFAULT_MAP_CENTER, 6);
    }
  }, [map, positions, selected]);
  return null;
}

function AvailableDriverChooser({
  drivers,
  assigning,
  onAssign,
}: {
  drivers: Array<{ id: string; name: string; status: string }>;
  assigning: boolean;
  onAssign: (driverId: string) => void;
}) {
  const available = drivers.filter((driver) => driver.status === "AVAILABLE");
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/45">Assign manually</p>
      {available.length === 0 ? (
        <p role="status" className="text-xs text-white/55">No drivers are currently reported as available.</p>
      ) : (
        <div className="max-h-44 space-y-2 overflow-y-auto">
          {available.map((driver) => (
            <button
              key={driver.id}
              type="button"
              onClick={() => onAssign(driver.id)}
              disabled={assigning}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm font-bold text-white hover:border-sky-400/40 hover:bg-sky-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-50"
            >
              Assign {driver.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type DispatchJobRaw = { id: string | number; recipientPhone?: string | null };
type DispatchJob = {
  id: string; reference: string; customer: string; area: string;
  type: "DELIVERY" | "COLLECTION"; lat: number | null; lng: number | null; raw: DispatchJobRaw;
};
type DispatchDriver = {
  id: string; name: string; status: string; vehicle: string; phone: string;
  lat: number | null; lng: number | null; jobsActive: number;
};
type WaybillRow = {
  id: string | number; status: string; updatedAt?: string; trackingNumber?: string;
  recipientName?: string; recipientAddress?: string; recipientLat?: number | null; recipientLng?: number | null;
};
type CollectionRow = {
  id: string | number; status: string; driverId?: string | number | null; clientName?: string;
  pickupAddress?: string; pickupLat?: number | null; pickupLng?: number | null;
};
type DriverRow = {
  id: string | number; name?: string; status?: string; vehicleReg?: string; phone?: string;
  lastLat?: number | null; lastLng?: number | null;
};
type ShipmentRow = { driverId?: string | number | null; status?: string };

export default function DriverDispatch() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  useSocket(user?.companyId ?? ""); // connection + listeners only; socket handle unused here
  const [viewMode, setViewMode] = useState<'LIST' | 'MAP'>('LIST');
  const [jobs, setJobs] = useState<DispatchJob[]>([]);
  const [drivers, setDrivers] = useState<DispatchDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [offlineReason, setOfflineReason] = useState<'backend'|'session'>('backend');
  const [sourceErrors, setSourceErrors] = useState<string[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set()); // batch selection
  const [assigning, setAssigning] = useState(false);
  const [todayStats, setTodayStats] = useState({ assigned: 0, completed: 0, failed: 0, pending: 0 });

  // Unwrap both the TransformInterceptor envelope AND optional pagination wrapper.
  // Backend returns: { data: X, statusCode, message } (TransformInterceptor)
  // Waybills also return paginated: { data: { data: [], total: n, page: p, limit: l } }
  // Collections and drivers return plain arrays: { data: [] }
  const unwrapList = <T, >(val: unknown): T[] => {
    if (!val) return [];
    const d = (val as { data?: unknown }).data ?? val;  // strip TransformInterceptor envelope
    if (Array.isArray(d)) return d as T[];              // plain array → done
    const inner = d as { data?: unknown; items?: unknown; results?: unknown } | null;
    const d2 = inner?.data ?? inner?.items ?? inner?.results ?? d; // strip pagination wrapper
    return Array.isArray(d2) ? (d2 as T[]) : [];
  };

  const loadData = useCallback(() => (async () => {
    try {
      const [wbRes, collRes, driversTableRes, shipmentsRes] = await Promise.allSettled([
        api.get('/waybills'), api.get('/collections'), api.get('/drivers'), api.get('/shipments')
      ]);

      const sourceResults = [
        { name: 'Waybills', result: wbRes },
        { name: 'Collections', result: collRes },
        { name: 'Drivers', result: driversTableRes },
        { name: 'Shipments', result: shipmentsRes },
      ];
      const unavailableSources = sourceResults
        .filter(({ result }) => result.status === 'rejected')
        .map(({ name }) => name);
      setSourceErrors(unavailableSources);

      if (unavailableSources.length < sourceResults.length) setOffline(false);
      const allFailed = unavailableSources.length === sourceResults.length;
      if (allFailed) {
        const firstErr = [wbRes, collRes, driversTableRes, shipmentsRes].find(r => r.status === 'rejected');
        const status = (firstErr?.reason as { status?: number } | undefined)?.status;
        setOfflineReason(status === 401 || status === 403 ? 'session' : 'backend');
        setJobs([]);
        setDrivers([]);
        setSelectedJobId(null);
        setCheckedIds(new Set());
        setTodayStats({ assigned: 0, completed: 0, failed: 0, pending: 0 });
        setOffline(true);
        setLoading(false);
        return;
      }

      const allWb = unwrapList<WaybillRow>(wbRes.status === 'fulfilled' ? wbRes.value : null);

      // Today's progress stats
      const today = new Date(); today.setHours(0,0,0,0);
      setTodayStats({
        assigned:  allWb.filter((w) => ['IN_TRANSIT','OUT_FOR_DELIVERY','COLLECTED'].includes(w.status)).length,
        completed: allWb.filter((w) => w.status === 'DELIVERED' && w.updatedAt != null && new Date(w.updatedAt) >= today).length,
        failed:    allWb.filter((w) => ['FAILED_DELIVERY','RETURNED'].includes(w.status) && w.updatedAt != null && new Date(w.updatedAt) >= today).length,
        pending:   allWb.filter((w) => w.status === 'PENDING').length,
      });

      const waybillsData    = allWb;
      const collectionsData = unwrapList<CollectionRow>(collRes.status       === 'fulfilled' ? collRes.value      : null);
      const rawDriversTable = unwrapList<DriverRow>(driversTableRes.status === 'fulfilled' ? driversTableRes.value : null);
      const activeShipments = unwrapList<ShipmentRow>(shipmentsRes.status === 'fulfilled' ? shipmentsRes.value : null);

      // Build per-driver job count from IN_TRANSIT/PENDING shipments
      const jobsByDriver: Record<string, number> = {};
      for (const s of activeShipments) {
        if (s.driverId && ['PENDING', 'IN_TRANSIT'].includes(s.status ?? '')) {
          jobsByDriver[String(s.driverId)] = (jobsByDriver[String(s.driverId)] ?? 0) + 1;
        }
      }

      // FIX: Waybill has no driverId field — it links via Shipment.
      // Filter by status instead: PENDING and COLLECTED = unassigned to driver
      const deliveries = waybillsData
        .filter((w) => ['PENDING', 'COLLECTED'].includes(w.status))
        .map((w) => {
          const location = getMapCoordinates(w.recipientLat, w.recipientLng);
          return {
            id: `DEL-${w.id}`,
            reference: w.trackingNumber || `WB-${w.id}`,
            customer: w.recipientName || "Standard Delivery",
            area: addressArea(w.recipientAddress),
            type: 'DELIVERY' as const,
            lat: location?.lat ?? null,
            lng: location?.lng ?? null,
            raw: w,
          };
        });

      const collections = collectionsData
        .filter((c) => !c.driverId && c.status === 'PENDING')
        .map((c) => {
          const location = getMapCoordinates(c.pickupLat, c.pickupLng);
          return {
            id: `COL-${c.id}`,
            reference: c.clientName || `COL-${c.id}`,
            customer: c.clientName || "Pickup Request",
            area: addressArea(c.pickupAddress),
            type: 'COLLECTION' as const,
            lat: location?.lat ?? null,
            lng: location?.lng ?? null,
            raw: c,
          };
        });

      const fleet = rawDriversTable.map((d) => {
        const location = getMapCoordinates(d.lastLat, d.lastLng);
        return {
          id: String(d.id),
          name: d.name || "Driver",
          status: d.status ? String(d.status).toUpperCase() : "UNKNOWN",
          vehicle: d.vehicleReg || "Vehicle not specified",
          phone: d.phone || "",
          lat: location?.lat ?? null,
          lng: location?.lng ?? null,
          jobsActive: jobsByDriver[String(d.id)] ?? 0,
        };
      });

      setJobs([...deliveries, ...collections]);
      setDrivers(fleet);
      if (deliveries.length > 0) setSelectedJobId((current) => current || deliveries[0].id);
    } catch {
      setOfflineReason('backend');
      setSourceErrors(['Dispatch data']);
      setJobs([]);
      setDrivers([]);
      setSelectedJobId(null);
      setCheckedIds(new Set());
      setTodayStats({ assigned: 0, completed: 0, failed: 0, pending: 0 });
      setOffline(true);
    } finally {
      setLoading(false);
    }
  })(), []);

  useEffect(() => { loadData(); }, [loadData, refreshTick]);

  // 30-second auto-refresh for live dispatch view
  useEffect(() => {
    const timer = setInterval(() => setRefreshTick(v => v + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const stats = useMemo(() => ({
    total: jobs.length,
    ready: drivers.filter(d => d.status === 'AVAILABLE').length
  }), [jobs, drivers]);

  const selectedJob = useMemo(() => jobs.find(j => j.id === selectedJobId) || null, [jobs, selectedJobId]);
  const locatedJobs = useMemo(() => jobs.filter((job) => hasMapCoordinates(job)), [jobs]);
  const locatedDrivers = useMemo(() => drivers.filter((driver) => hasMapCoordinates(driver)), [drivers]);
  const mapPositions = useMemo<[number, number][]>(
    () => [...locatedJobs, ...locatedDrivers].flatMap((item) =>
      item.lat != null && item.lng != null ? [[item.lat, item.lng] as [number, number]] : []),
    [locatedJobs, locatedDrivers],
  );
  const selectedMapPosition = useMemo<[number, number] | null>(
    () => selectedJob && hasMapCoordinates(selectedJob) ? [selectedJob.lat, selectedJob.lng] : null,
    [selectedJob],
  );
  const unlocatedJobCount = jobs.length - locatedJobs.length;
  const unlocatedDriverCount = drivers.length - locatedDrivers.length;
  const jobDataUnavailable = sourceErrors.some((source) => ["Waybills", "Collections", "Dispatch data"].includes(source));
  const driverDataUnavailable = sourceErrors.some((source) => ["Drivers", "Dispatch data"].includes(source));
  const waybillStatsUnavailable = loading || offline || sourceErrors.includes("Waybills") || sourceErrors.includes("Dispatch data");

  const toggleCheck = useCallback((id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setCheckedIds(prev => prev.size === jobs.length ? new Set() : new Set(jobs.map(j => j.id)));
  }, [jobs]);

  // Batch assign all checked jobs to a driver
  const handleBatchAssign = async (driverId: string) => {
    const toAssign = jobs.filter(j => checkedIds.has(j.id));
    if (toAssign.length === 0) { showToast("Select jobs first", "error"); return; }
    setAssigning(true);
    let ok = 0; let fail = 0;
    for (const job of toAssign) {
      try {
        if (job.type === 'DELIVERY') {
          // Waybill has no driverId column — assign via the dedicated endpoint
          // which upserts a Shipment and advances the waybill status.
          await api.post(`/waybills/${job.raw.id}/assign`, { driverId: String(driverId) });
        } else {
          // Use the purpose-built assign-driver endpoint (validates the driver
          // belongs to this tenant + sets status to ASSIGNED). The generic PATCH
          // was rejecting a partial body against the create DTO.
          await api.post(`/collections/${job.raw.id}/assign-driver`, { driverId: String(driverId) });
        }
        ok++;
      } catch { fail++; }
    }
    showToast(`${ok} assigned${fail ? `, ${fail} failed` : ''}`, ok > 0 ? "success" : "error");
    setCheckedIds(new Set());
    setRefreshTick(v => v + 1);
    setAssigning(false);
  };

  const handleAssignment = async (driverId: string) => {
    const selectedIds = checkedIds.size > 0 ? checkedIds : selectedJobId ? new Set([selectedJobId]) : new Set<string>();
    if (selectedIds.size > 1) { await handleBatchAssign(driverId); return; }
    if (!selectedJob) return;
    try {
      setAssigning(true);
      const originalId = selectedJob.raw.id;
      if (selectedJob.type === 'DELIVERY') {
        // Waybill has no driverId column — assign via the dedicated endpoint
        // which upserts a Shipment and advances the waybill status to COLLECTED.
        await api.post(`/waybills/${originalId}/assign`, { driverId: String(driverId) });
      } else {
        // Purpose-built endpoint: validates tenant ownership + sets ASSIGNED.
        await api.post(`/collections/${originalId}/assign-driver`, { driverId: String(driverId) });
      }
      showToast(`Assigned ${selectedJob.reference}`, "success");
      setRefreshTick(v => v + 1);
    } catch (err) {
      // Surface the real backend message so failures are diagnosable, not a
      // generic "Failed to assign" that hides the cause.
      const msg = err?.response?.data?.message || err?.message || "Failed to assign";
      showToast(Array.isArray(msg) ? msg.join(", ") : String(msg), "error");
    }
    finally { setAssigning(false); }
  };

  // Quick WhatsApp contact for a driver
  const contactDriver = useCallback((driver: DispatchDriver) => {
    if (driver.phone) {
      // Normalise: strip non-digits, replace leading 0 with SA country code 27
      const phone = driver.phone.replace(/\D/g, '').replace(/^0/, '27');
      window.open(`https://wa.me/${phone}?text=Hi+${encodeURIComponent(driver.name)}%2C+you+have+new+job(s)+assigned.+Please+check+the+app.`, '_blank');
    }
  }, []);


  return (
    <div className="min-h-full bg-[#07111f]">
      <div className="mx-auto max-w-[1820px] space-y-6">

        <CommandCenterHeader
          eyebrow="Operations · Branch Dispatch"
          title="Control Tower"
          subtitle="Toggle between high-density list and tactical map routing."
        >
          <div className="flex items-center gap-4">
             <div className="bg-black/40 p-1.5 rounded-[22px] border border-white/10 flex gap-1">
                <button type="button" aria-pressed={viewMode === 'LIST'} onClick={() => setViewMode('LIST')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${viewMode === 'LIST' ? 'bg-sky-500 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>
                   <LayoutList size={16} /> LIST
                </button>
                <button type="button" aria-pressed={viewMode === 'MAP'} onClick={() => setViewMode('MAP')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${viewMode === 'MAP' ? 'bg-sky-500 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>
                   <MapIcon size={16} /> MAP
                </button>
             </div>
             <button
               type="button"
               onClick={() => setRefreshTick((value) => value + 1)}
               disabled={loading}
               aria-label="Refresh dispatch data"
               className="flex items-center gap-2 rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white/70 transition-all hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-wait disabled:opacity-50"
             >
               <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
               Refresh
             </button>

             <button type="button" onClick={() => navigate('/dashboard')} className="flex items-center gap-2 px-5 py-3 bg-white/5 border border-white/10 rounded-[20px] text-[10px] font-black text-white/70 hover:text-white transition-all uppercase tracking-widest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
               Global Map <ExternalLink size={14} className="text-sky-400" />
             </button>

             <div className="grid grid-cols-2 gap-3 min-w-[300px]">
                <StatCard label="In Queue" value={loading || offline || jobDataUnavailable ? "—" : stats.total} hint="Pending items" />
                <StatCard label="Fleet Ready" value={loading || offline || driverDataUnavailable ? "—" : stats.ready} hint="Active drivers" />
             </div>
          </div>
        </CommandCenterHeader>

        {/* ── Today's progress strip ── */}
        <div className="grid gap-4 sm:grid-cols-4">
          {[
            { label: "Pending",   value: waybillStatsUnavailable ? "—" : todayStats.pending,   icon: Clock,        color: "text-amber-300",  bg: "border-amber-500/20 bg-amber-500/6"    },
            { label: "In Transit",value: waybillStatsUnavailable ? "—" : todayStats.assigned,  icon: Truck,        color: "text-cyan-300",   bg: "border-cyan-500/20 bg-cyan-500/6"      },
            { label: "Delivered", value: waybillStatsUnavailable ? "—" : todayStats.completed, icon: CheckCircle2, color: "text-emerald-300",bg: "border-emerald-500/20 bg-emerald-500/6" },
            { label: "Failed",    value: waybillStatsUnavailable ? "—" : todayStats.failed,    icon: XCircle,      color: "text-rose-300",   bg: "border-rose-500/20 bg-rose-500/6"      },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className={`rounded-[22px] border ${bg} flex items-center gap-4 px-5 py-4`}>
              <Icon className={`h-5 w-5 ${color} flex-shrink-0`} />
              <div>
                <div className={`text-2xl font-black ${color}`}>{value}</div>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40 mt-0.5">{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Offline banner ── */}
        {offline && (
          <div className="rounded-2xl border border-rose-500/25 bg-rose-500/8 px-5 py-4 flex items-center gap-3 text-sm text-rose-300">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-rose-400" />
            {offlineReason === 'session'
              ? <span><strong>Session expired</strong> — please reload the page and log in again.</span>
              : <span><strong>Backend offline</strong> — start the backend server to load dispatch data.</span>
            }
            <button onClick={() => { setOffline(false); setRefreshTick(v => v + 1); }} className="ml-auto rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-1.5 text-xs font-bold hover:bg-rose-500/20 transition">Retry</button>
          </div>
        )}
        {!offline && sourceErrors.length > 0 && (
          <div role="alert" className="rounded-2xl border border-amber-500/25 bg-amber-500/8 px-5 py-4 text-sm text-amber-200">
            Some dispatch data could not be loaded: <strong>{sourceErrors.join(", ")}</strong>. Counts and empty states may be incomplete; refresh to retry.
          </div>
        )}

        {viewMode === 'LIST' ? (
          <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr_1fr] animate-in fade-in zoom-in-95 duration-300">
            {/* COLUMN 1: QUEUE */}
            <div className={`${softCard} p-6 h-[75vh] overflow-y-auto custom-scrollbar`}>
              <h2 className="text-xl font-black text-white mb-4 flex items-center gap-2 font-mono italic underline decoration-sky-500/50">
                <Clock className="h-5 w-5 text-sky-400" /> UNASSIGNED QUEUE
              </h2>
              {jobs.length > 0 && (
                <div className="flex items-center gap-3 mb-3 pb-3 border-b border-white/10">
                  <button onClick={toggleAll} className="flex items-center gap-2 text-xs font-bold text-white/50 hover:text-white transition">
                    {checkedIds.size === jobs.length ? <CheckSquare className="h-4 w-4 text-sky-400" /> : <Square className="h-4 w-4" />}
                    {checkedIds.size > 0 ? `${checkedIds.size} selected` : "Select all"}
                  </button>
                  {checkedIds.size > 0 && (
                    <span className="ml-auto rounded-full bg-sky-500/20 border border-sky-500/30 px-2.5 py-1 text-[10px] font-black text-sky-300">
                      {checkedIds.size} job{checkedIds.size !== 1 ? "s" : ""} ready to batch assign
                    </span>
                  )}
                </div>
              )}
              <div className="space-y-3">
              {jobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <Package className="h-8 w-8 text-white/15 mb-3" />
                  <p role={loading ? "status" : undefined} className="text-sm text-white/50">
                    {loading ? "Loading dispatch jobs…" : jobDataUnavailable ? "Job queue unavailable" : "No unassigned jobs"}
                  </p>
                  <p className="text-xs text-white/35 mt-1">
                    {loading
                      ? "Checking pending waybills and collections"
                      : jobDataUnavailable
                        ? "One or more job sources failed, so an empty queue cannot be confirmed."
                        : "Pending waybills and collections appear here"}
                  </p>
                </div>
              ) : (
                jobs.map(job => (
                  <div key={job.id}
                    className={`p-4 rounded-2xl border transition-all ${selectedJobId === job.id ? 'bg-sky-500/20 border-sky-500 shadow-xl' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                    <div className="flex items-start gap-3">
                      <button onClick={(e) => { e.stopPropagation(); toggleCheck(job.id); }} className="mt-0.5 shrink-0">
                        {checkedIds.has(job.id)
                          ? <CheckSquare className="h-4 w-4 text-sky-400" />
                          : <Square className="h-4 w-4 text-white/30" />}
                      </button>
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedJobId(job.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (() => setSelectedJobId(job.id))(); } }} role="button" tabIndex={0}>
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-2">
                            {job.type === 'DELIVERY' ? <Package className="text-cyan-400 shrink-0" size={16} /> : <PackagePlus className="text-indigo-400 shrink-0" size={16} />}
                            <span className="font-black text-white text-base tracking-tight">{job.reference}</span>
                          </div>
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${job.type === 'DELIVERY' ? 'border-cyan-500/30 text-cyan-400' : 'border-indigo-500/30 text-indigo-400'}`}>{job.type}</span>
                        </div>
                        <div className="mt-1.5 text-xs text-white/50 truncate">{job.customer}</div>
                        <div className="mt-1 text-[11px] text-sky-300/70 font-bold flex items-center gap-1">
                          <MapPin className="h-3 w-3" />{job.area}
                        </div>
                        {!hasMapCoordinates(job) && (
                          <p role="note" className="mt-1 text-[10px] font-semibold text-amber-200">Location unavailable — not shown on map</p>
                        )}
                        {/* Notify customer button */}
                        {job.type === 'DELIVERY' && job.raw?.recipientPhone && (
                          <div className="mt-2 flex gap-2">
                            <a
                              href={`https://wa.me/${(job.raw.recipientPhone || '').replace(/\D/g,'').replace(/^0/,'27')}?text=${encodeURIComponent(`Hi, your FlowOps parcel (${job.reference}) is being prepared for dispatch. Track it: ${window.location.origin}/track/${job.reference}`)}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1 rounded-lg bg-emerald-500/15 border border-emerald-400/20 px-2.5 py-1 text-[10px] font-black text-emerald-300 hover:bg-emerald-500/25 transition-colors"
                            >
                              <MessageCircle className="h-3 w-3" /> Notify
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
              </div>
            </div>

            {/* COLUMN 2: AI */}
            <div className={`${softCard} p-6`}>
              <h2 className="text-xl font-black text-white mb-6 flex items-center gap-2"><Users className="h-5 w-5 text-sky-400" /> Job details & assignment</h2>
              {checkedIds.size > 1 ? (
                <div className="rounded-[22px] border border-sky-500/30 bg-sky-500/8 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="h-5 w-5 text-sky-400" />
                    <span className="font-black text-white">Batch Assign</span>
                  </div>
                  <p className="text-sm text-white/60 mb-4">{checkedIds.size} jobs selected. Pick a driver below to assign all at once.</p>
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-sky-300">
                    <Users className="h-4 w-4" />
                    <span className="font-bold">Select driver in Active Fleet →</span>
                  </div>
                </div>
              ) : selectedJob ? (
                <div className="space-y-4">
                  <div className="p-5 bg-white/5 rounded-2xl border border-white/10">
                    <div className="text-xl font-black text-white">{selectedJob.reference}</div>
                    <p className="text-xs text-sky-400 font-bold">{selectedJob.area}</p>
                    <p className="text-xs text-white/40 mt-1">{selectedJob.customer}</p>
                  </div>
                  <AvailableDriverChooser
                    drivers={drivers}
                    assigning={assigning}
                    onAssign={(driverId) => void handleAssignment(driverId)}
                  />
                </div>
              ) : <div className="text-center py-20 text-white/20 italic">Select job to start analysis</div>}
            </div>

            {/* COLUMN 3: FLEET */}
            <div className={`${softCard} p-6 h-[75vh] overflow-y-auto custom-scrollbar`}>
              <h2 className="text-xl font-black text-white mb-6 flex items-center gap-2"><Truck className="h-5 w-5 text-sky-400" /> Active Fleet</h2>
              <div className="space-y-3">
              {drivers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <Truck className="h-8 w-8 text-white/15 mb-3" />
                  <p role={loading ? "status" : undefined} className="text-sm text-white/50">
                    {loading ? "Loading drivers…" : driverDataUnavailable ? "Driver list unavailable" : "No drivers registered"}
                  </p>
                  <p className="text-xs text-white/35 mt-1">
                    {loading
                      ? "Checking driver availability"
                      : driverDataUnavailable
                        ? "The driver source failed, so an empty fleet cannot be confirmed."
                        : "Add drivers to start dispatching"}
                  </p>
                </div>
              ) : (
                drivers.map((driver) => (
                  <div key={driver.id} className="p-5 bg-white/5 rounded-2xl border border-white/10">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-white text-base">{driver.name}</div>
                        <div className="text-[10px] text-white/40 uppercase font-bold mt-0.5">{driver.vehicle}</div>
                        {!hasMapCoordinates(driver) && <p role="note" className="mt-1 text-[10px] font-semibold text-amber-200">Location unavailable — not shown on map</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`px-2 py-0.5 rounded text-[10px] font-black ${driver.status === 'AVAILABLE' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>{driver.status}</div>
                        {driver.jobsActive > 0 && (
                          <div className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 text-[10px] font-black">
                            {driver.jobsActive} active
                          </div>
                        )}
                        <button type="button" onClick={() => contactDriver(driver)} title={driver.phone ? "WhatsApp driver" : "No driver phone number on file"} aria-label={`WhatsApp ${driver.name}`} disabled={!driver.phone}
                          className="p-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 disabled:cursor-not-allowed disabled:opacity-40">
                          <MessageCircle className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={assigning || driver.status !== 'AVAILABLE'}
                      onClick={() => checkedIds.size > 0 ? handleBatchAssign(driver.id) : handleAssignment(driver.id)}
                      className="mt-4 w-full py-2.5 bg-white/5 rounded-xl text-white text-[10px] font-black tracking-widest hover:bg-sky-500 transition-all uppercase disabled:opacity-40">
                      {checkedIds.size > 1 ? `Assign ${checkedIds.size} Jobs` : "Manual Assign"}
                    </button>
                  </div>
                ))
              )}
              </div>
            </div>
          </section>
        ) : (
          /* 🚀 MAP VIEW MODE */
          <div className="w-full h-[75vh] rounded-[32px] overflow-hidden border border-white/10 shadow-2xl relative animate-in fade-in zoom-in-95 duration-300">
            <MapContainer center={DEFAULT_MAP_CENTER} zoom={6} style={{ height: '100%', width: '100%', background: '#0b1a2b' }}>
              <OpenStreetMapLayer />
              <FitDispatchPoints positions={mapPositions} selected={selectedMapPosition} />

              <MarkerClusterGroup>
                {locatedJobs.map((job) => (
                  <Marker key={`job-${job.id}`} position={[job.lat, job.lng]} icon={jobIcon} eventHandlers={{ click: () => setSelectedJobId(job.id) }}>
                    <Popup>
                      <div className="font-bold">{job.reference}</div>
                      <div className="text-xs">{job.customer}</div>
                    </Popup>
                  </Marker>
                ))}

                {locatedDrivers.map((driver) => (
                  <Marker key={`driver-${driver.id}`} position={[driver.lat, driver.lng]} icon={driverIcon}>
                    <Popup>
                      <div className="font-bold">{driver.name}</div>
                      <div className="text-xs">Status: {driver.status}</div>
                    </Popup>
                  </Marker>
                ))}
              </MarkerClusterGroup>
            </MapContainer>

            <div role="status" className="absolute left-5 top-5 z-[1000] max-w-[min(26rem,calc(100%-2.5rem))] rounded-xl border border-white/10 bg-slate-950/90 px-4 py-3 text-xs text-white/80 shadow-xl">
              {locatedJobs.length + locatedDrivers.length === 0
                ? "No job or driver coordinates are available to plot. Use List view to review dispatch records."
                : `${locatedJobs.length} located job${locatedJobs.length === 1 ? "" : "s"} · ${locatedDrivers.length} located driver${locatedDrivers.length === 1 ? "" : "s"}.`}
              {(unlocatedJobCount + unlocatedDriverCount) > 0 && (
                <span className="mt-1 block text-amber-200">
                  {unlocatedJobCount + unlocatedDriverCount} record{unlocatedJobCount + unlocatedDriverCount === 1 ? "" : "s"} not plotted because coordinates are missing or invalid; they remain in List view.
                </span>
              )}
            </div>

            <div className="absolute bottom-8 right-8 z-[1000] w-80">
               {selectedJob && (
                 <div className="max-h-[70vh] overflow-y-auto rounded-[24px] border border-white/10 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-xl">
                    <p className="mb-2 text-sm font-black text-white">{selectedJob.reference}</p>
                    <p className="mb-3 text-xs text-white/55">Choose an available driver. Assignment is confirmed by the server.</p>
                    <AvailableDriverChooser
                      drivers={drivers}
                      assigning={assigning}
                      onAssign={(driverId) => void handleAssignment(driverId)}
                    />
                 </div>
               )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
