import React, { useMemo, useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Activity, AlertTriangle, ArrowUpRight, Brain, 
  FileText, Package, Truck, Users, Search, 
  RotateCcw, Navigation, Zap, Target, X, LocateFixed, Database, Shield
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { CommandCenterHeader } from "../components/premium/CommandCenterHeader";
import { useSocket } from '../hooks/useSocket';
import { FLOWOPS_API_URL } from '../lib/env';
import { getAccessToken } from '../lib/session';

// Component Imports
import AiClawChat from "../components/AiClawChat";

// Leaflet Imports
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for Leaflet marker icons in React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({ 
  iconUrl: icon, 
  shadowUrl: iconShadow, 
  iconSize: [25, 41], 
  iconAnchor: [12, 41] 
});
L.Marker.prototype.options.icon = DefaultIcon;

function MapController({ center }: { center: [number, number] }) {
  const map = useMap();
  return (
    <div className="absolute bottom-12 right-12 z-[1000]">
      <button 
        onClick={() => map.flyTo(center, 6, { duration: 1.5 })}
        className="bg-emerald-500 text-black p-5 rounded-full shadow-[0_0_40px_rgba(16,185,129,0.5)] hover:bg-white transition-all border-4 border-black/20"
      >
        <LocateFixed size={28} />
      </button>
    </div>
  );
}

function MetricCard(props: { 
  title: string; value: string; subtitle: string; icon: any; 
  gradient: string; to: string; onAiClick?: () => void 
}) {
  const [isFlipped, setIsFlipped] = useState(false);
  const navigate = useNavigate();
  const Icon = props.icon;

  return (
    <div className="group h-[190px] w-full [perspective:1000px] cursor-pointer" onClick={() => setIsFlipped(!isFlipped)}>
      <div className={`relative h-full w-full rounded-[24px] transition-all duration-700 [transform-style:preserve-3d] ${isFlipped ? '[transform:rotateY(180deg)]' : ''}`}>
        <div className={`absolute inset-0 h-full w-full rounded-[24px] p-6 [backface-visibility:hidden] border border-white/10 shadow-xl ${props.gradient}`}>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/60">{props.title}</div>
              <div className="text-4xl font-black tracking-tighter text-white drop-shadow-lg">{props.value}</div>
            </div>
            <div className="rounded-xl bg-white/20 backdrop-blur-md p-3 text-white shadow-inner"><Icon size={20} /></div>
          </div>
          <div className="mt-auto pt-6 flex items-center justify-between font-black uppercase italic text-[9px] text-white/70 tracking-widest">
            <button onClick={(e) => { e.stopPropagation(); props.onAiClick?.(); }} className="flex items-center gap-1.5 hover:text-white transition-colors">
              <RotateCcw size={10} className="animate-spin-slow" /> AI Intelligence
            </button>
            <button onClick={(e) => { e.stopPropagation(); navigate(props.to); }} className="bg-black/20 hover:bg-white hover:text-black px-3 py-1 rounded-full not-italic border border-white/10 transition-all text-[8px] font-black uppercase">
              View Details
            </button>
          </div>
        </div>
        <div className="absolute inset-0 h-full w-full rounded-[24px] border border-sky-500/30 bg-[#0c1a35] p-6 [backface-visibility:hidden] [transform:rotateY(180deg)] shadow-2xl">
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 mb-3">
               <Brain size={12} className="text-sky-400" />
               <div className="text-[9px] font-black uppercase tracking-[0.2em] text-sky-400 italic">Logic Layer</div>
            </div>
            <p className="text-[11px] font-bold text-slate-200 leading-tight">{props.subtitle}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, booting } = useAuth();
  const [activeDrivers, setActiveDrivers] = useState<any[]>([]);
  const [liveMetrics, setLiveMetrics] = useState({
    collections: "0", activeDrivers: "0", transit: "0", stock: "0", risks: "0"
  });
  const [isAiOpen, setIsAiOpen] = useState(false);

  const { socket } = useSocket(user?.companyId || 1);
  const mapCenterPoint: [number, number] = useMemo(() => [-28.4793, 24.6727], []); // Global center coordinates for South Africa

  // 1. Initial REST Synchronization Layer Pass
  useEffect(() => {
    if (booting || !user) return;

    const fetchMetrics = async () => {
      try {
        const token = getAccessToken();
        const res = await fetch(`${FLOWOPS_API_URL}/dashboard/metrics`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        setLiveMetrics({
          collections: String(data.collections || 0),
          activeDrivers: String(data.activeDrivers || 0),
          transit: String(data.transit || 0),
          stock: String(data.stock || 0),
          risks: String(data.risks || 0)
        });
        if (data.drivers) setActiveDrivers(data.drivers);
      } catch (err) {
        console.error("Dashboard metrics synchronization dropped:", err);
      }
    };
    fetchMetrics();
  }, [user, booting]);

  // 2. Real-time WebSockets Over-the-Air Update Listener Loop
  useEffect(() => {
    if (booting || !user || !socket) return;

    socket.emit('joinCompanyDashboard', { companyId: user?.companyId || 1 });

    socket.on('telemetryStreamUpdate', (data: any) => {
      setActiveDrivers((prevDrivers) => {
        const driverExists = prevDrivers.some(d => d.id === data.driverId);
        if (driverExists) {
          return prevDrivers.map(d => d.id === data.driverId ? { ...d, lat: data.lat, lng: data.lng } : d);
        } else {
          return [...prevDrivers, { id: data.driverId, name: data.name, vehicleReg: data.vehicleReg, lat: data.lat, lng: data.lng }];
        }
      });
    });

    return () => {
      socket.off('telemetryStreamUpdate');
    };
  }, [socket, user, booting]);

  // Handle Session Mounting Context Latency
  if (booting) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center text-emerald-400 font-mono text-xs uppercase tracking-widest">
        🚀 Mounting Secure Control Space Session Core...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 p-8 space-y-8 font-sans">
      <CommandCenterHeader eyebrow="Command Center" title="Logistics Control Hub" subtitle={`National Tracking Grid Overview | Tenant Workspace ID: ${user?.companyId || 1}`} />

      {/* Metrics Row mapping directly to React UI cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <MetricCard title="Pending Collection" value={liveMetrics.collections} subtitle="Waybills awaiting courier dropoff assignment." icon={Package} gradient="bg-gradient-to-br from-amber-500 to-orange-600" to="/waybills" onAiClick={() => setIsAiOpen(true)} />
        <MetricCard title="Active Resources" value={liveMetrics.activeDrivers} subtitle="Live registered logistics drivers checked-in." icon={Users} gradient="bg-gradient-to-br from-blue-500 to-indigo-600" to="/drivers" onAiClick={() => setIsAiOpen(true)} />
        <MetricCard title="In Transit (N1/N3)" value={liveMetrics.transit} subtitle="Freight linehauls moving out cross-province." icon={Truck} gradient="bg-gradient-to-br from-emerald-500 to-teal-600" to="/transit" onAiClick={() => setIsAiOpen(true)} />
        <MetricCard title="At Local Hubs" value={liveMetrics.stock} subtitle="Waybills scanned inside processing nodes safely." icon={FileText} gradient="bg-gradient-to-br from-purple-500 to-pink-600" to="/branches" onAiClick={() => setIsAiOpen(true)} />
        <MetricCard title="Anomalies Flagged" value={liveMetrics.risks} subtitle="Operational exceptions under AI review queues." icon={AlertTriangle} gradient="bg-gradient-to-br from-rose-500 to-red-600" to="/ai-ops" onAiClick={() => setIsAiOpen(true)} />
      </div>

      {/* Leaflet Real-time Transit Grid Block Container */}
      <div className="relative bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-[32px] p-6 h-[600px] overflow-hidden shadow-2xl">
        <div className="absolute top-6 left-6 z-[1000] bg-black/70 border border-white/10 px-4 py-2 rounded-full text-xs font-black tracking-widest uppercase text-emerald-400 animate-pulse">
          📡 Live Telemetry Feed Connected
        </div>
        
        <MapContainer center={mapCenterPoint} zoom={5} style={{ height: "100%", width: "100%", borderRadius: "24px" }} zoomControl={false}>
          <TileLayer attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MarkerClusterGroup>
            {activeDrivers.map((driver) => (
              <Marker key={driver.id} position={[driver.lat, driver.lng]}>
                <Popup>
                  <div className="text-slate-900 p-1 font-sans">
                    <h4 className="font-black text-sm">{driver.name}</h4>
                    <p className="text-xs text-slate-500 font-bold">Reg: {driver.vehicleReg}</p>
                    <p className="text-[10px] text-emerald-600 font-bold mt-1">坐标: {driver.lat.toFixed(4)}, {driver.lng.toFixed(4)}</p>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
          <MapController center={mapCenterPoint} />
        </MapContainer>
      </div>

      {/* AI Intelligence Chat Component Sheet Insertion */}
      {isAiOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[2000] flex justify-end">
          <div className="bg-slate-900 border-l border-white/10 w-full max-w-lg h-full flex flex-col shadow-2xl">
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-black/20">
              <div className="flex items-center gap-2">
                <Brain className="text-emerald-400 animate-pulse" size={20} />
                <h3 className="font-black uppercase tracking-widest text-xs text-slate-200">FlowOps Cognitive Core</h3>
              </div>
              <button onClick={() => setIsAiOpen(false)} className="text-slate-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/5">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <AiClawChat onClose={() => {}} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

