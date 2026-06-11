import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from '@/components/ui/PageHeader';
import { 
  RefreshCw, Sparkles, Truck, MapPin, Clock, Package, 
  PackagePlus, UserCheck, AlertTriangle, LayoutList, Map as MapIcon, ExternalLink 
} from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { api } from '../api/client'; 
import { CommandCenterHeader } from "../components/premium/CommandCenterHeader";
import { useToast } from "../components/ToastProvider";

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
const softCard = "rounded-[26px] border border-white/10 bg-white/[0.04] shadow-[0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl";

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
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'LIST' | 'MAP'>('LIST');
  const [jobs, setJobs] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  const branchCenter: [number, number] = [-26.2041, 28.0473];

  const loadData = async () => {
    try {
      setLoading(true);
      const [wbRes, collRes, usersRes, driversTableRes] = await Promise.allSettled([
        api.get('/waybills'), api.get('/collections'), api.get('/users'), api.get('/drivers')
      ]);

      const waybillsData = wbRes.status === 'fulfilled' ? wbRes.value.data : [];
      const collectionsData = collRes.status === 'fulfilled' ? collRes.value.data : [];
      const rawUsers = usersRes.status === 'fulfilled' ? usersRes.value.data : [];
      const rawDriversTable = driversTableRes.status === 'fulfilled' ? driversTableRes.value.data : [];

      const deliveries = waybillsData.filter((w: any) => !w.driverId).map((w: any) => ({
          id: `DEL-${w.id}`, reference: w.waybillNumber || `WB-${w.id}`,
          customer: w.recipient || "Standard Delivery", area: (w.area || "GENERAL ZONE").toUpperCase(),
          type: 'DELIVERY', lat: w.lat || -26.15, lng: w.lng || 28.00, raw: w
      }));

      const collections = collectionsData.filter((c: any) => !c.driverId).map((c: any) => ({
          id: `COL-${c.id}`, reference: c.reference || `COL-${c.id}`,
          customer: c.customerName || "Pickup Request", area: (c.area || "GENERAL ZONE").toUpperCase(),
          type: 'COLLECTION', lat: c.lat || -26.25, lng: c.lng || 28.10, raw: c
      }));

      const fleetSource = rawDriversTable.length > 0 ? rawDriversTable : rawUsers.filter((u: any) => u.role === 'DRIVER');
      const fleet = fleetSource.map((d: any) => ({
        id: d.id, name: d.name || "Driver", status: (d.availabilityStatus || "AVAILABLE").toUpperCase(),
        vehicle: d.vehicleReg || d.vehicle || "Van", zone: (d.zone || "GENERAL ZONE").toUpperCase(),
        lat: d.lat || -26.20, lng: d.lng || 28.05
      }));

      setJobs([...deliveries, ...collections]);
      setDrivers(fleet);
      if (deliveries.length > 0 && !selectedJobId) setSelectedJobId(deliveries[0].id);
    } catch (error) {
      showToast("Sync Error", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [refreshTick]);

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

  const handleAssignment = async (driverId: number) => {
    if (!selectedJob) return;
    try {
      setAssigning(true);
      const originalId = selectedJob.raw.id;
      if (selectedJob.type === 'DELIVERY') await api.patch(`/waybills/${originalId}/assign-driver`, { driverId });
      else await api.post(`/collections/${originalId}/assign`, { driverId });
      showToast(`Assigned ${selectedJob.reference}`, "success");
      setRefreshTick(v => v + 1);
    } catch (err) {
      showToast("Failed to assign", "error");
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07111f] p-7">
      <div className="mx-auto max-w-[1820px] space-y-6">
        <PageHeader icon={Truck} title="Driver Dispatch" description="Live route execution and driver assignment" color="#6C9EFF" />
        
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
        

        {viewMode === 'LIST' ? (
          <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr_1fr] animate-in fade-in zoom-in-95 duration-300">
            {/* COLUMN 1: QUEUE */}
            <div className={`${softCard} p-6 h-[75vh] overflow-y-auto custom-scrollbar`}>
              <h2 className="text-xl font-black text-white mb-6 flex items-center gap-2 font-mono italic underline decoration-sky-500/50">
                <Clock className="h-5 w-5 text-sky-400" /> UNASSIGNED QUEUE
              </h2>
              <div className="space-y-3">
                {jobs.map(job => (
                  <div key={job.id} onClick={() => setSelectedJobId(job.id)} 
                    className={`p-5 rounded-2xl cursor-pointer border transition-all ${selectedJobId === job.id ? 'bg-sky-500/20 border-sky-500 shadow-xl' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        {job.type === 'DELIVERY' ? <Package className="text-cyan-400" size={20} /> : <PackagePlus className="text-indigo-400" size={20} />}
                        <div className="font-black text-white text-lg tracking-tight">{job.reference}</div>
                      </div>
                      <div className={`px-2 py-1 rounded-full text-[9px] font-black tracking-widest border ${job.type === 'DELIVERY' ? 'border-cyan-500/30 text-cyan-400' : 'border-indigo-500/30 text-indigo-400'}`}>{job.type}</div>
                    </div>
                    <div className="mt-3 text-xs text-sky-300 font-bold uppercase flex items-center gap-1"><MapPin className="h-3 w-3" /> {job.area}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* COLUMN 2: AI */}
            <div className={`${softCard} p-6`}>
              <h2 className="text-xl font-black text-white mb-6 flex items-center gap-2"><Sparkles className="h-5 w-5 text-sky-400" /> AI Optimization</h2>
              {selectedJob ? (
                <div className="space-y-4">
                  <div className="p-5 bg-white/5 rounded-2xl border border-white/10">
                    <div className="text-xl font-black text-white">{selectedJob.reference}</div>
                    <p className="text-xs text-sky-400 font-bold">{selectedJob.area}</p>
                  </div>
                  {recommendedDrivers.length > 0 && (
                    <div className="p-6 bg-sky-500/10 border border-sky-500/30 rounded-[24px]">
                      <div className="font-bold text-white text-xl text-center">{recommendedDrivers[0].driver.name}</div>
                      <p className="text-sm text-sky-200/70 mt-2 text-center font-medium">Match: **{recommendedDrivers[0].score}/100**</p>
                      <button onClick={() => handleAssignment(recommendedDrivers[0].driver.id)} disabled={assigning}
                        className="mt-6 w-full rounded-xl bg-sky-500 py-4 text-sm font-black text-white transition hover:bg-sky-400 shadow-lg active:scale-95 flex items-center justify-center gap-2">
                        {assigning ? <RefreshCw className="animate-spin" size={18} /> : <Sparkles size={18} />} AUTO-ASSIGN
                      </button>
                    </div>
                  )}
                </div>
              ) : <div className="text-center py-20 text-white/20 italic">Select job to start analysis</div>}
            </div>

            {/* COLUMN 3: FLEET */}
            <div className={`${softCard} p-6 h-[75vh] overflow-y-auto custom-scrollbar`}>
              <h2 className="text-xl font-black text-white mb-6 flex items-center gap-2"><Truck className="h-5 w-5 text-sky-400" /> Active Fleet</h2>
              <div className="space-y-3">
                {drivers.map((driver) => (
                  <div key={driver.id} className="p-5 bg-white/5 rounded-2xl border border-white/10">
                    <div className="flex justify-between items-start">
                      <div><div className="font-black text-white text-lg">{driver.name}</div><div className="text-[10px] text-white/40 uppercase font-bold">{driver.vehicle} • {driver.zone}</div></div>
                      <div className={`px-2 py-0.5 rounded text-[10px] font-black ${driver.status === 'AVAILABLE' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>{driver.status}</div>
                    </div>
                    <button disabled={!selectedJob || assigning || driver.status !== 'AVAILABLE'} onClick={() => handleAssignment(driver.id)}
                      className="mt-5 w-full py-3 bg-white/5 rounded-xl text-white text-[10px] font-black tracking-widest hover:bg-sky-500 transition-all uppercase">Manual Assign</button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : (
          /* 🚀 MAP VIEW MODE */
          <div className="w-full h-[75vh] rounded-[32px] overflow-hidden border border-white/10 shadow-2xl relative animate-in fade-in zoom-in-95 duration-300">
            <MapContainer center={branchCenter} zoom={12} style={{ height: '100%', width: '100%', background: '#0b1a2b' }} zoomControl={false}>
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
