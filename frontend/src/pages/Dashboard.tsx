import React, { useMemo, useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Activity, AlertTriangle, ArrowUpRight, Brain, 
  FileText, Package, Truck, Users, Search, 
  RotateCcw, Navigation, Zap, Target, X, LocateFixed, Database, Shield,
  TrendingUp, TrendingDown, Minus, Clock, CheckCircle2, Wallet
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { normalizeTenantNavPermissions } from "../lib/tenantUserPermissions";
import { CommandCenterHeader } from "../components/premium/CommandCenterHeader";
import { ForwardingControlTower } from "../components/premium/ForwardingControlTower";
import { TiltCard } from "../components/premium/TiltCard";
import { PerformanceTrends } from "../components/premium/PerformanceTrends";
import { getEntitlements } from "../api/billingApi";
import { useSocket } from '../hooks/useSocket';
import { api } from '../api/client';

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
  gradient: string; to: string; onAiClick?: () => void; className?: string;
}) {
  const [isFlipped, setIsFlipped] = useState(false);
  const navigate = useNavigate();
  const Icon = props.icon;

  return (
    <div className={`group h-[190px] w-full [perspective:1000px] cursor-pointer ${props.className ?? ""}`} onClick={() => setIsFlipped(!isFlipped)}>
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

type Kpi = {
  /** Backend sends `null` when a tenant has no data for the window yet (dashboard.service.ts). */
  value: number | null;
  previous: number | null;
  delta: number | null;
  unit: "percent" | "hours" | "currency";
  goodDirection: "up" | "down";
};

type KpiSet = {
  period: string;
  onTimeDeliveryRate: Kpi;
  deliverySuccessRate: Kpi;
  avgDeliveryHours: Kpi;
  revenuePerWaybill: Kpi;
  exceptionRate: Kpi;
  outstandingRevenue: Kpi;
};

function formatKpiValue(kpi: Kpi, currency: string) {
  // The backend legitimately sends value=null when there is no data yet for the
  // window (fresh tenant, empty 30-day range). Never call .toFixed on it — that
  // crash is what white-screened the tenant dashboard behind the ErrorBoundary.
  if (kpi.value === null || kpi.value === undefined || Number.isNaN(Number(kpi.value))) {
    return "—";
  }
  const value = Number(kpi.value);
  if (kpi.unit === "percent") return `${value.toFixed(1)}%`;
  if (kpi.unit === "hours") {
    return value >= 48 ? `${(value / 24).toFixed(1)}d` : `${value.toFixed(1)}h`;
  }
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${Math.round(value).toLocaleString()}`;
  }
}

function KpiCard(props: { title: string; kpi: Kpi; icon: any; currency: string; to: string }) {
  const navigate = useNavigate();
  const { kpi } = props;
  const Icon = props.icon;
  const hasDelta = kpi.delta !== null && kpi.delta !== undefined;
  const isGood = hasDelta
    ? kpi.goodDirection === "up"
      ? (kpi.delta as number) >= 0
      : (kpi.delta as number) <= 0
    : true;
  const DeltaIcon =
    !hasDelta || kpi.delta === 0 ? Minus : (kpi.delta as number) > 0 ? TrendingUp : TrendingDown;

  return (
    <button
      onClick={() => navigate(props.to)}
      className="group h-full w-full text-left rounded-[20px] border border-white/10 bg-slate-900/60 p-5 transition-all hover:border-sky-400/40 hover:bg-slate-900/90"
    >
      <div className="flex items-center justify-between">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-sky-300">
          <Icon size={16} />
        </div>
        {hasDelta ? (
          <div
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black ${
              isGood ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"
            }`}
          >
            <DeltaIcon size={11} />
            {Math.abs(kpi.delta as number).toFixed(1)}%
          </div>
        ) : (
          <div className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-black text-white/40">
            <Minus size={11} /> live
          </div>
        )}
      </div>
      <div className="mt-3 text-2xl font-black tracking-tight text-white">
        {formatKpiValue(kpi, props.currency)}
      </div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
        {props.title}
      </div>
      <div className="mt-2 text-[10px] font-semibold text-white/30">
        {hasDelta ? "vs prior 30 days" : "no data yet"}
      </div>
    </button>
  );
}

export default function Dashboard() {
  const { user, booting } = useAuth();
  const [activeDrivers, setActiveDrivers] = useState<any[]>([]);
  const [liveMetrics, setLiveMetrics] = useState({
    collections: "0", activeDrivers: "0", transit: "0", stock: "0", risks: "0"
  });
  const [kpis, setKpis] = useState<KpiSet | null>(null);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [forwardingEntitled, setForwardingEntitled] = useState(false);

  useEffect(() => {
    if (booting || !user) return;
    (async () => {
      try {
        const ent = await getEntitlements().catch(() => null);
        setForwardingEntitled(Boolean((ent as any)?.features?.freightForwarding));
      } catch { /* entitlement check best-effort */ }
    })();
  }, [user, booting]);
  // Keyed by driverId — refreshed every 30 s alongside metrics
  const [etaMap, setEtaMap] = useState<Record<string, { etaMinutes: number; distanceKm: number; trackingNumber: string; urgency: string }>>({});

  const currency = (user?.company?.currency as string) || "ZAR";
  const company = user?.company;

  // Persona-aware dashboard: render the KPI/widget mix that matches what this
  // role is allowed to see (same permission matrix the sidebar + routes use).
  const perms = useMemo(
    () =>
      normalizeTenantNavPermissions(
        (user as any)?.permissions ?? (user as any)?.navPermissions,
        user?.role,
      ),
    [user],
  );
  const canSeeFinance = perms.invoices || perms.creditControl;
  const canSeeOps =
    perms.shipments || perms.podDeliveries || perms.driverDispatch || perms.collections;
  const canSeeMap = perms.driverDispatch || perms.collections;
  const persona =
    canSeeOps && canSeeFinance
      ? "Command View"
      : canSeeFinance
        ? "Finance View"
        : canSeeMap
          ? "Operations View"
          : "Workspace View";

  const { socket } = useSocket(user?.companyId || 1);
  const mapCenterPoint: [number, number] = useMemo(() => [-28.4793, 24.6727], []); // Global center coordinates for South Africa

  // 1. Initial REST Synchronization Layer Pass
  useEffect(() => {
    if (booting || !user) return;

    const fetchMetrics = async () => {
      try {
        const res = await api.get<any, any>(`/dashboard/metrics`);
        // The backend wraps every response via a global TransformInterceptor as
        // { data, statusCode, message }. Unwrap defensively so the metric cards
        // and live map read the real payload rather than the envelope.
        const data = res && typeof res === "object" && "data" in res ? (res as any).data : res;
        setLiveMetrics({
          collections: String(data?.collections || 0),
          activeDrivers: String(data?.activeDrivers || 0),
          transit: String(data?.transit || 0),
          stock: String(data?.stock || 0),
          risks: String(data?.risks || 0)
        });
        if (Array.isArray(data?.drivers)) setActiveDrivers(data.drivers);
      } catch (err) {
        console.error("Dashboard metrics synchronization dropped:", err);
      }
    };

    const fetchEtas = async () => {
      try {
        const res = await api.get<any, any>(`/dashboard/live-etas`);
        const data: any[] = Array.isArray(res) ? res
          : Array.isArray((res as any)?.data) ? (res as any).data : [];
        const map: typeof etaMap = {};
        for (const e of data) map[e.driverId] = e;
        setEtaMap(map);
      } catch {
        // ETAs are best-effort — don't log noise if backend returns nothing
      }
    };

    const fetchKpis = async () => {
      try {
        const res = await api.get<any, any>(`/dashboard/kpis`);
        const data = res && typeof res === "object" && "data" in res ? (res as any).data : res;
        if (data && data.onTimeDeliveryRate) setKpis(data as KpiSet);
      } catch (err) {
        console.error("Dashboard KPI synchronization dropped:", err);
      }
    };

    fetchMetrics();
    fetchKpis();
    fetchEtas();

    // Refresh metrics + ETAs every 30 seconds (KPIs only need daily precision)
    const interval = setInterval(() => { fetchMetrics(); fetchEtas(); }, 30_000);
    return () => clearInterval(interval);
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

  const kpiCards = kpis
    ? [
        ...(canSeeOps
          ? [
              { title: "On-Time Delivery", kpi: kpis.onTimeDeliveryRate, icon: Target, to: "/shipments?status=DELIVERED" },
              { title: "Delivery Success", kpi: kpis.deliverySuccessRate, icon: CheckCircle2, to: "/pod-deliveries" },
              { title: "Avg Delivery Time", kpi: kpis.avgDeliveryHours, icon: Clock, to: "/shipments?status=DELIVERED" },
              { title: "Exception Rate", kpi: kpis.exceptionRate, icon: AlertTriangle, to: "/high-risk-queue" },
            ]
          : []),
        ...(canSeeFinance
          ? [
              { title: "Revenue / Waybill", kpi: kpis.revenuePerWaybill, icon: Zap, to: "/invoices" },
              { title: "Outstanding", kpi: kpis.outstandingRevenue, icon: Wallet, to: "/invoices?status=OVERDUE" },
            ]
          : []),
      ]
    : [];

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 p-8 space-y-8 font-sans">
      <CommandCenterHeader eyebrow="Command Center" title="Logistics Control Hub" subtitle={`${persona} · ${company?.name || "FlowOps Demo"}`} />

      {/* Freight Control Tower — import/export hero for forwarding-entitled tenants */}
      {forwardingEntitled && <ForwardingControlTower />}


      {/* Operational metrics — shown to operations / dispatch / command personas */}
      {canSeeOps && (
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <MetricCard className="fx-reveal fx-reveal-1" title="Pending Collection" value={liveMetrics.collections} subtitle="Waybills awaiting courier dropoff assignment." icon={Package} gradient="bg-gradient-to-br from-amber-500 to-orange-600" to="/waybills" onAiClick={() => setIsAiOpen(true)} />
        <MetricCard className="fx-reveal fx-reveal-2" title="Active Resources" value={liveMetrics.activeDrivers} subtitle="Live registered logistics drivers checked-in." icon={Users} gradient="bg-gradient-to-br from-blue-500 to-indigo-600" to="/driver-dispatch" onAiClick={() => setIsAiOpen(true)} />
        <MetricCard className="fx-reveal fx-reveal-3" title="In Transit (N1/N3)" value={liveMetrics.transit} subtitle="Freight linehauls moving out cross-province." icon={Truck} gradient="bg-gradient-to-br from-emerald-500 to-teal-600" to="/shipments?status=IN_TRANSIT" onAiClick={() => setIsAiOpen(true)} />
        <MetricCard className="fx-reveal fx-reveal-4" title="At Local Hubs" value={liveMetrics.stock} subtitle="Waybills scanned inside processing nodes safely." icon={FileText} gradient="bg-gradient-to-br from-purple-500 to-pink-600" to="/waybills" onAiClick={() => setIsAiOpen(true)} />
        <MetricCard className="fx-reveal fx-reveal-5" title="Anomalies Flagged" value={liveMetrics.risks} subtitle="Operational exceptions under AI review queues." icon={AlertTriangle} gradient="bg-gradient-to-br from-rose-500 to-red-600" to="/high-risk-queue" onAiClick={() => setIsAiOpen(true)} />
      </div>
      )}

      {/* Performance Intelligence — real computed KPIs vs the prior 30-day window */}
      {(canSeeOps || canSeeFinance) && (
      <div>
        <div className="mb-3 flex items-center gap-2 px-1">
          <Activity size={14} className="text-sky-400" />
          <h2 className="text-[11px] font-black uppercase tracking-[0.24em] text-white/60">
            Performance Intelligence · Last 30 Days
          </h2>
        </div>
        {kpis ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            {kpiCards.map((c, i) => (
              <TiltCard key={c.title} className={`h-full fx-reveal fx-reveal-${(i % 6) + 1}`}>
                <KpiCard title={c.title} kpi={c.kpi} icon={c.icon} currency={currency} to={c.to} />
              </TiltCard>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[132px] animate-pulse rounded-[20px] border border-white/5 bg-slate-900/40" />
            ))}
          </div>
        )}
      </div>
      )}

      {/* Performance Trends — time-series volume & revenue (exec view) */}
      {(canSeeOps || canSeeFinance) && <PerformanceTrends currency={currency} />}

      {/* Leaflet Real-time Transit Grid Block Container — operations personas only */}
      {canSeeMap && (
      <div className="relative bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-[32px] p-6 h-[600px] overflow-hidden shadow-2xl">
        <div className="absolute top-6 left-6 z-[1000] bg-black/70 border border-white/10 px-4 py-2 rounded-full text-xs font-black tracking-widest uppercase text-emerald-400 animate-pulse">
          📡 Live Telemetry Feed Connected
        </div>
        
        <MapContainer center={mapCenterPoint} zoom={5} style={{ height: "100%", width: "100%", borderRadius: "24px" }} zoomControl={false} attributionControl={false}>
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MarkerClusterGroup>
            {activeDrivers.map((driver) => {
              const eta = etaMap[driver.id];
              const etaColor = !eta ? '#6b7280'
                : eta.urgency === 'imminent' ? '#10b981'
                : eta.urgency === 'near'     ? '#f59e0b'
                : '#3b82f6';
              return (
                <Marker key={driver.id} position={[driver.lat, driver.lng]}>
                  <Popup>
                    <div className="text-slate-900 p-1 font-sans min-w-[160px]">
                      <h4 className="font-black text-sm">{driver.name}</h4>
                      <p className="text-xs text-slate-500 font-bold">Reg: {driver.vehicleReg}</p>
                      {eta ? (
                        <>
                          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{
                              background: etaColor + '22',
                              color: etaColor,
                              border: `1px solid ${etaColor}55`,
                              borderRadius: 999,
                              padding: '2px 8px',
                              fontWeight: 900,
                              fontSize: 11,
                            }}>
                              ⏱ {eta.etaMinutes} min ETA
                            </span>
                          </div>
                          <p style={{ fontSize: 10, color: '#6b7280', marginTop: 4, fontWeight: 600 }}>
                            {eta.distanceKm} km · {eta.trackingNumber}
                          </p>
                        </>
                      ) : (
                        <p className="text-[10px] text-emerald-600 font-bold mt-1">
                          Coords: {driver.lat != null && driver.lng != null
                            ? `${driver.lat.toFixed(4)}, ${driver.lng.toFixed(4)}`
                            : "pending fix"}
                        </p>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MarkerClusterGroup>
          <MapController center={mapCenterPoint} />
        </MapContainer>
      </div>
      )}

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

