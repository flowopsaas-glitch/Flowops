import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  RefreshCw, Sparkles, Truck, MapPin, Clock, Package,
  PackagePlus, AlertTriangle, LayoutList, Map as MapIcon, ExternalLink,
  CheckSquare, Square, MessageCircle, Users, TrendingUp, CheckCircle2,
  XCircle, Zap, ChevronRight,
} from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ── Standardised dark tile source (CartoDB Dark Matter) ──
const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const DARK_TILE_ATTR = '&copy; <a href="https://carto.com">CartoDB</a> &copy; <a href="https://openstreetmap.org">OSM</a>';

import { api } from '../api/client';
import { CommandCenterHeader } from "../components/premium/CommandCenterHeader";
import { useToast } from "../components/ToastProvider";
import { useSocket } from "../hooks/useSocket";
import { useAuth } from "../contexts/AuthContext";

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

function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  map.setView(center);
  return null;
}

export default function DriverDispatch() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { socket } = useSocket(user?.companyId ?? "");
  const [viewMode, setViewMode] = useState<'LIST' | 'MAP'>('LIST');
  const [jobs, setJobs] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [offlineReason, setOfflineReason] = useState<'backend'|'session'>('backend');
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set()); // batch selection
  const [assigning, setAssigning] = useState(false);
  const [todayStats, setTodayStats] = useState({ assigned: 0, completed: 0, failed: 0, pending: 0 });

  const branchCenter: [number, number] = [-26.2041, 28.0473];

  // Unwrap both the TransformInterceptor envelope AND optional pagination wrapper.
  // Backend returns: { data: X, statusCode, message } (TransformInterceptor)
  // Waybills also return paginated: { data: { data: [], total: n, page: p, limit: l } }
  // Collections and drivers return plain arrays: { data: [] }
  const unwrapList = (val: any): any[] => {
    if (!val) return [];
    const d = val?.data ?? val;                        // strip TransformInterceptor envelope
    if (Array.isArray(d)) return d;                    // plain array → done
    const d2 = d?.data ?? d?.items ?? d?.results ?? d; // strip pagination wrapper
    return Array.isArray(d2) ? d2 : [];
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setOffline(false);
      const [wbRes, collRes, driversTableRes, shipmentsRes] = await Promise.allSettled([
        api.get('/waybills'), api.get('/collections'), api.get('/drivers'), api.get('/shipments')
      ]);

      const allFailed = [wbRes, collRes, driversTableRes, shipmentsRes].every(r => r.status === 'rejected');
      if (allFailed) {
        const firstErr: any = [wbRes, collRes, driversTableRes, shipmentsRes].find(r => r.status === 'rejected');
        const status = (firstErr as any)?.reason?.status;
        setOfflineReason(status === 401 || status === 403 ? 'session' : 'backend');
        setOffline(true);
        setLoading(false);
        return;
      }

      const allWb = unwrapList(wbRes.status === 'fulfilled' ? wbRes.value : null);

      // Today's progress stats
      const today = new Date(); today.setHours(0,0,0,0);
      setTodayStats({
        assigned:  allWb.filter((w: any) => ['IN_TRANSIT','OUT_FOR_DELIVERY','COLLECTED'].includes(w.status)).length,
        completed: allWb.filter((w: any) => w.status === 'DELIVERED' && new Date(w.updatedAt) >= today).length,
        failed:    allWb.filter((w: any) => ['FAILED_DELIVERY','RETURNED'].includes(w.status) && new Date(w.updatedAt) >= today).length,
        pending:   allWb.filter((w: any) => w.status === 'PENDING').length,
      });

      const waybillsData    = allWb;
      const collectionsData = unwrapList(collRes.status       === 'fulfilled' ? collRes.value      : null);
      const rawDriversTable = unwrapList(driversTableRes.status === 'fulfilled' ? driversTableRes.value : null);
      const activeShipments = unwrapList(shipmentsRes.status === 'fulfilled' ? shipmentsRes.value : null);

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
        .filter((w: any) => ['PENDING', 'COLLECTED'].includes(w.status))
        .map((w: any) => ({
          id: `DEL-${w.id}`,
          reference: w.trackingNumber || `WB-${w.id}`,
          customer: w.recipientName || "Standard Delivery",
          area: (w.recipientAddress || "GENERAL ZONE").split(',').pop()?.trim().toUpperCase() ?? "GENERAL ZONE",
          type: 'DELIVERY' as const,
          lat: w.recipientLat ?? -26.15,
          lng: w.recipientLng ?? 28.00,
          raw: w,
        }));

      const collections = collectionsData
        .filter((c: any) => !c.driverId && c.status === 'PENDING')
        .map((c: any) => ({
          id: `COL-${c.id}`,
          reference: c.clientName || `COL-${c.id}`,
          customer: c.clientName || "Pickup Request",
          area: (c.pickupAddress || "GENERAL ZONE").split(',').pop()?.trim().toUpperCase() ?? "GENERAL ZONE",
          type: 'COLLECTION' as const,
          lat: c.pickupLat ?? -26.25,
          lng: c.pickupLng ?? 28.10,
          raw: c,
        }));

      const fleet = rawDriversTable.map((d: any) => ({
        id: String(d.id),
        name: d.name || "Driver",
        status: (d.status || "AVAILABLE").toUpperCase(),
        vehicle: d.vehicleReg || "Van",
        phone: d.phone || "",
        zone: "GENERAL ZONE",
        lat: d.lastLat ?? -26.20,
        lng: d.lastLng ?? 28.05,
        jobsActive: jobsByDriver[String(d.id)] ?? 0,
      }));

      setJobs([...deliveries, ...collections]);
      setDrivers(fleet);
      if (deliveries.length > 0 && !selectedJobId) setSelectedJobId(deliveries[0].id);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [refreshTick]);

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

  const recommendedDrivers = useMemo(() => {
    if (!selectedJob) return [];
    return drivers.map(d => {
        let score = 50;
        if (d.zone.toUpperCase() === selectedJob.area.toUpperCase()) score += 40;
        if (d.status === "AVAILABLE") score += 10;
        return { driver: d, score };
    }).sort((a, b) => b.score - a.score);
  }, [drivers, selectedJob]);

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
          await api.patch(`/collections/${job.raw.id}`, { driverId: String(driverId), status: 'IN_PROGRESS' });
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
        await api.patch(`/collections/${originalId}`, { driverId: String(driverId), status: 'IN_PROGRESS' });
      }
      showToast(`Assigned ${selectedJob.reference}`, "success");
      setRefreshTick(v => v + 1);
    } catch { showToast("Failed to assign", "error"); }
    finally { setAssigning(false); }
  };

  // Quick WhatsApp contact for a driver
  const contactDriver = useCallback((driver: any) => {
    if (driver.phone) {
      // Normalise: strip non-digits, replace leading 0 with SA country code 27
      const phone = driver.phone.replace(/\D/g, '').replace(/^0/, '27');
      window.open(`https://wa.me/${phone}?text=Hi+${encodeURIComponent(driver.name)}%2C+you+have+new+job(s)+assigned.+Please+check+the+app.`, '_blank');
    }
  }, []);

  // Haversine distance (km) between two lat/lng pairs
  const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  // Estimate ETA for a job → nearest available driver at 40 km/h average
  const etaForJob = useMemo(() => {
    if (!selectedJob || drivers.length === 0) return null;
    const nearest = [...drivers].sort((a, b) => {
      if (a.status !== 'AVAILABLE') return 1;
      if (b.status !== 'AVAILABLE') return -1;
      return haversineKm(a.lat, a.lng, selectedJob.lat, selectedJob.lng)
           - haversineKm(b.lat, b.lng, selectedJob.lat, selectedJob.lng);
    })[0];
    if (!nearest || nearest.status !== 'AVAILABLE') return null;
    const km = haversineKm(nearest.lat, nearest.lng, selectedJob.lat, selectedJob.lng);
    const mins = Math.round(km / 40 * 60);
    return mins < 60 ? `~${mins} min` : `~${Math.floor(mins/60)}h ${mins%60}m`;
  }, [selectedJob, drivers]);

  // Notify customer with stops-ahead ETA via POST /waybills/:id/notify-eta
  const notifyEta = useCallback(async (job: any, stopsAhead: number) => {
    if (job.type !== 'DELIVERY') return;
    try {
      await (api as any).post(`/waybills/${job.raw.id}/notify-eta`, { stopsAhead, etaMinutes: 30 });
      showToast(`Customer notified: ${stopsAhead} stop${stopsAhead !== 1 ? 's' : ''} ahead`, "success");
    } catch {
      showToast("Notification failed", "error");
    }
  }, [showToast]);

  return (
    <div className="min-h-screen bg-[#07111f] p-7">
      <div className="mx-auto max-w-[1820px] space-y-6">
        
        <CommandCenterHeader
          eyebrow="Operations · Branch Dispatch"
          title="Control Tower"
          subtitle="Toggle between high-density list and tactical map routing."
        >
          <div className="flex items-center gap-4">
             <div className="bg-black/40 p-1.5 rounded-[22px] border border-white/10 flex gap-1">
                <button onClick={() => setViewMode('LIST')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black transition-all ${viewMode === 'LIST' ? 'bg-sky-500 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>
                   <LayoutList size={16} /> LIST
                </button>
                <button onClick={() => setViewMode('MAP')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black transition-all ${viewMode === 'MAP' ? 'bg-sky-500 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>
                   <MapIcon size={16} /> MAP
                </button>
             </div>
             
             <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 px-5 py-3 bg-white/5 border border-white/10 rounded-[20px] text-[10px] font-black text-white/70 hover:text-white transition-all uppercase tracking-widest">
               Global Map <ExternalLink size={14} className="text-sky-400" />
             </button>

             <div className="grid grid-cols-2 gap-3 min-w-[300px]">
                <StatCard label="In Queue" value={stats.total} hint="Pending items" />
                <StatCard label="Fleet Ready" value={stats.ready} hint="Active drivers" />
             </div>
          </div>
        </CommandCenterHeader>

        {/* ── Today's progress strip ── */}
        <div className="grid gap-4 sm:grid-cols-4">
          {[
            { label: "Pending",   value: todayStats.pending,   icon: Clock,        color: "text-amber-300",  bg: "border-amber-500/20 bg-amber-500/6"    },
            { label: "In Transit",value: todayStats.assigned,  icon: Truck,        color: "text-cyan-300",   bg: "border-cyan-500/20 bg-cyan-500/6"      },
            { label: "Delivered", value: todayStats.completed, icon: CheckCircle2, color: "text-emerald-300",bg: "border-emerald-500/20 bg-emerald-500/6" },
            { label: "Failed",    value: todayStats.failed,    icon: XCircle,      color: "text-rose-300",   bg: "border-rose-500/20 bg-rose-500/6"      },
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
                  <p className="text-sm text-white/30">No unassigned jobs</p>
                  <p className="text-xs text-white/20 mt-1">Pending waybills and collections appear here</p>
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
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedJobId(job.id)}>
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
              <h2 className="text-xl font-black text-white mb-6 flex items-center gap-2"><Sparkles className="h-5 w-5 text-sky-400" /> AI Optimization</h2>
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
                  {recommendedDrivers.length > 0 && (
                    <div className="p-6 bg-sky-500/10 border border-sky-500/30 rounded-[24px]">
                      <div className="font-bold text-white text-xl text-center">{recommendedDrivers[0].driver.name}</div>
                      <div className="flex items-center justify-center gap-2 mt-1">
                        <div className="w-full bg-white/10 rounded-full h-1.5 mt-2">
                          <div className="bg-sky-400 h-1.5 rounded-full" style={{width: `${recommendedDrivers[0].score}%`}} />
                        </div>
                        <span className="text-xs text-sky-300 font-black shrink-0">{recommendedDrivers[0].score}%</span>
                      </div>
                      <button onClick={() => handleAssignment(recommendedDrivers[0].driver.id)} disabled={assigning}
                        className="mt-6 w-full rounded-xl bg-sky-500 py-4 text-sm font-black text-white transition hover:bg-sky-400 shadow-lg active:scale-95 flex items-center justify-center gap-2">
                        {assigning ? <RefreshCw className="animate-spin" size={18} /> : <Sparkles size={18} />} AUTO-ASSIGN
                      </button>
                    </div>
                  )}
                  {recommendedDrivers.slice(1, 3).length > 0 && (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35 mb-2">Alternates</p>
                      {recommendedDrivers.slice(1, 3).map(({ driver, score }) => (
                        <button key={driver.id} onClick={() => handleAssignment(driver.id)}
                          className="w-full flex items-center justify-between rounded-xl border border-white/8 bg-black/20 px-4 py-2.5 mb-2 hover:border-white/20 hover:bg-white/5 transition">
                          <span className="text-sm font-bold text-white">{driver.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-white/40">{score}%</span>
                            <ChevronRight className="h-3.5 w-3.5 text-white/20" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
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
                  <p className="text-sm text-white/30">No drivers registered</p>
                  <p className="text-xs text-white/20 mt-1">Add drivers to start dispatching</p>
                </div>
              ) : (
                drivers.map((driver) => (
                  <div key={driver.id} className="p-5 bg-white/5 rounded-2xl border border-white/10">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-white text-base">{driver.name}</div>
                        <div className="text-[10px] text-white/40 uppercase font-bold mt-0.5">{driver.vehicle}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`px-2 py-0.5 rounded text-[10px] font-black ${driver.status === 'AVAILABLE' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>{driver.status}</div>
                        {driver.jobsActive > 0 && (
                          <div className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 text-[10px] font-black">
                            {driver.jobsActive} active
                          </div>
                        )}
                        <button onClick={() => contactDriver(driver)} title="WhatsApp driver"
                          className="p-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition">
                          <MessageCircle className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <button
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
            <MapContainer center={branchCenter} zoom={12} style={{ height: '100%', width: '100%', background: '#0b1a2b' }} zoomControl={false} attributionControl={false}>
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
              <ChangeView center={selectedJob ? [selectedJob.lat, selectedJob.lng] : branchCenter} />
              
              {jobs.map(job => (
                <Marker key={job.id} position={[job.lat, job.lng]} icon={jobIcon} eventHandlers={{ click: () => setSelectedJobId(job.id) }}>
                  <Popup>
                    <div className="font-bold">{job.reference}</div>
                    <div className="text-xs">{job.customer}</div>
                  </Popup>
                </Marker>
              ))}

              {drivers.map(driver => (
                <Marker key={driver.id} position={[driver.lat, driver.lng]} icon={driverIcon}>
                  <Popup>
                    <div className="font-bold">{driver.name}</div>
                    <div className="text-xs">Status: {driver.status}</div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>

            <div className="absolute bottom-8 right-8 z-[1000] w-80">
               {selectedJob && recommendedDrivers.length > 0 && (
                 <div className="bg-slate-900/95 backdrop-blur-xl border border-sky-500/30 p-6 rounded-[24px] shadow-2xl animate-in slide-in-from-right-4">
                    <p className="text-[10px] font-black text-sky-400 uppercase mb-2">Map Recommendation</p>
                    <p className="text-white font-black text-lg mb-1">{recommendedDrivers[0].driver.name}</p>
                    <p className="text-xs text-sky-200/60 mb-4 italic">Proximity fit for {selectedJob.reference}</p>
                    <button onClick={() => handleAssignment(recommendedDrivers[0].driver.id)} className="w-full py-3 bg-sky-500 text-white font-black rounded-xl text-xs uppercase shadow-lg shadow-sky-500/20 transition-all active:scale-95">DISPATCH NOW</button>
                 </div>
               )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
