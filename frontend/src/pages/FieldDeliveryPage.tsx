import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity, AlertTriangle, ArrowRight, CheckCircle2, Clock,
  ExternalLink, MapPin, MessageCircle, Package, RefreshCw,
  Smartphone, Truck, Users, Wifi, WifiOff, Zap,
} from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../api/client";
import { useAuth } from "../contexts/AuthContext";

// ── Types ──────────────────────────────────────────────────────────────────

type FieldDriver = {
  id: string;
  name: string;
  phone?: string | null;
  vehicleType?: string | null;
  vehicleReg?: string | null;
  status: string;
  lastLat?: number | null;
  lastLng?: number | null;
  lastSeen?: string | null;
  jobsToday: number;
  activeCollections: Array<{ id: string; clientName?: string | null; pickupAddress?: string | null; status: string }>;
  activeShipments: Array<{ id: string; status: string; waybill?: { trackingNumber: string; recipientName?: string | null } | null }>;
};

// ── Helpers ────────────────────────────────────────────────────────────────

// The driver portal is embedded in the frontend at /driver/portal.
// VITE_DRIVER_APP_URL can override this if a standalone PWA is deployed.
const DRIVER_APP_URL = import.meta.env.VITE_DRIVER_APP_URL ?? "/driver/portal";

function unwrapList(r: any): any[] {
  const d = r?.data ?? r;
  if (Array.isArray(d)) return d;
  return Array.isArray(d?.data) ? d.data : [];
}

function relTime(ts?: string | null): string {
  if (!ts) return "never";
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const STATUS_COLOR: Record<string, string> = {
  AVAILABLE: "#22c55e",
  ON_ROUTE:  "#06b6d4",
  OFFLINE:   "#6b7280",
};

function makePin(color: string, label: string) {
  return L.divIcon({
    className: "",
    html: `<div style="
      background:${color};border:2px solid rgba(255,255,255,0.8);
      border-radius:50% 50% 50% 0;transform:rotate(-45deg);
      width:28px;height:28px;display:flex;align-items:center;justify-content:center;
      box-shadow:0 2px 8px rgba(0,0,0,0.4)">
        <span style="transform:rotate(45deg);font-size:11px;font-weight:900;color:#fff">${label}</span>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}

// ── Sub-components ─────────────────────────────────────────────────────────

function DriverCard({ driver, onWhatsApp }: { driver: FieldDriver; onWhatsApp: (d: FieldDriver) => void }) {
  const totalJobs = driver.activeCollections.length + driver.activeShipments.length;
  const statusColor =
    driver.status === "AVAILABLE" ? "border-emerald-500/30 bg-emerald-500/6"
    : driver.status === "ON_ROUTE"  ? "border-cyan-500/30 bg-cyan-500/6"
    :                                  "border-white/10 bg-white/3";
  const statusText  =
    driver.status === "AVAILABLE" ? "text-emerald-300"
    : driver.status === "ON_ROUTE"  ? "text-cyan-300"
    :                                  "text-white/30";

  const isStale = driver.lastSeen
    ? Date.now() - new Date(driver.lastSeen).getTime() > 30 * 60_000
    : true;

  return (
    <div className={`rounded-[26px] border p-5 flex flex-col gap-4 ${statusColor}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`grid h-12 w-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15 text-lg font-black text-white`}>
            {driver.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-black text-white text-base leading-tight">{driver.name}</div>
            <div className="text-[11px] text-white/40 mt-0.5 capitalize">
              {driver.vehicleType ?? "vehicle"} · {driver.vehicleReg ?? "—"}
            </div>
          </div>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${statusText} ${statusColor}`}>
          {driver.status.replace("_", " ")}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Jobs Today",   value: driver.jobsToday,    icon: CheckCircle2 },
          { label: "Active",       value: totalJobs,           icon: Zap },
          { label: "Last Seen",    value: relTime(driver.lastSeen), icon: isStale ? WifiOff : Wifi },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-center">
            <Icon className="h-3 w-3 text-white/30 mx-auto mb-1" />
            <div className="text-sm font-black text-white leading-none">{value}</div>
            <div className="text-[9px] text-white/30 mt-0.5 uppercase tracking-wider">{label}</div>
          </div>
        ))}
      </div>

      {/* Active jobs */}
      {totalJobs > 0 && (
        <div className="space-y-1.5">
          {driver.activeShipments.slice(0, 2).map(s => (
            <div key={s.id} className="flex items-center gap-2 rounded-xl border border-cyan-500/15 bg-black/20 px-3 py-2">
              <Truck className="h-3 w-3 text-cyan-400 flex-shrink-0" />
              <span className="text-xs text-white/70 truncate">
                {s.waybill?.trackingNumber ?? s.id.slice(-6)} · {s.waybill?.recipientName ?? "Delivery"}
              </span>
            </div>
          ))}
          {driver.activeCollections.slice(0, 2).map(c => (
            <div key={c.id} className="flex items-center gap-2 rounded-xl border border-amber-500/15 bg-black/20 px-3 py-2">
              <Package className="h-3 w-3 text-amber-400 flex-shrink-0" />
              <span className="text-xs text-white/70 truncate">{c.clientName ?? "Pickup"}</span>
            </div>
          ))}
          {totalJobs > 4 && (
            <div className="text-center text-[10px] text-white/30">+{totalJobs - 4} more jobs</div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {driver.phone && (
          <button
            onClick={() => onWhatsApp(driver)}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-green-500/20 bg-green-500/8 py-2 text-xs font-bold text-green-300 hover:bg-green-500/15 transition"
          >
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </button>
        )}
        {driver.lastLat && driver.lastLng && (
          <button
            onClick={() =>
              window.open(`https://www.google.com/maps?q=${driver.lastLat},${driver.lastLng}`, "_blank")
            }
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 py-2 text-xs font-bold text-white/50 hover:bg-white/10 hover:text-white transition"
          >
            <MapPin className="h-3.5 w-3.5" /> Track
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function FieldDeliveryPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [drivers, setDrivers] = useState<FieldDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<"ALL" | "AVAILABLE" | "ON_ROUTE" | "OFFLINE">("ALL");

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    try {
      const res: any = await api.get("/drivers/field-ops");
      const list = unwrapList(res);
      setDrivers(list);
      setLastRefresh(new Date());
    } catch {
      // graceful — show stale data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load("initial"); }, [load]);
  // Auto-refresh every 30s
  useEffect(() => {
    const t = setInterval(() => void load("refresh"), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const whatsApp = useCallback((d: FieldDriver) => {
    const phone = (d.phone ?? "").replace(/\D/g, "");
    if (phone) {
      window.open(
        `https://wa.me/${phone}?text=Hi+${encodeURIComponent(d.name)}%2C+please+check+your+FlowOps+driver+app+for+updates.`,
        "_blank"
      );
    }
  }, []);

  const filtered = useMemo(() =>
    statusFilter === "ALL" ? drivers : drivers.filter(d => d.status === statusFilter),
    [drivers, statusFilter]
  );

  const stats = useMemo(() => ({
    total:     drivers.length,
    available: drivers.filter(d => d.status === "AVAILABLE").length,
    onRoute:   drivers.filter(d => d.status === "ON_ROUTE").length,
    offline:   drivers.filter(d => d.status === "OFFLINE").length,
    jobsToday: drivers.reduce((s, d) => s + d.jobsToday, 0),
    activeJobs: drivers.reduce(
      (s, d) => s + d.activeCollections.length + d.activeShipments.length, 0
    ),
  }), [drivers]);

  const mappableDrivers = useMemo(() =>
    drivers.filter(d => d.lastLat && d.lastLng),
    [drivers]
  );

  const mapCenter = mappableDrivers.length > 0
    ? ([mappableDrivers[0].lastLat!, mappableDrivers[0].lastLng!] as [number, number])
    : ([-29.0, 25.0] as [number, number]);

  if (loading) {
    return (
      <div className="min-h-full bg-[linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-8">
        <div className="mx-auto max-w-[1400px] animate-pulse space-y-6">
          <div className="h-32 rounded-[30px] bg-white/5" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0,1,2,3].map(i => <div key={i} className="h-28 rounded-[22px] bg-white/5" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(30,80,140,0.14),transparent_28%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8 overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6">

        {/* ── Header ── */}
        <div className="rounded-[30px] border border-white/10 bg-white/6 p-6 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/85 ring-1 ring-white/15">
                <Truck className="h-3.5 w-3.5 text-cyan-400" />
                Field Delivery
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-white">Fleet in the Field</h1>
              <p className="mt-1 text-sm text-white/50">
                Live driver positions · jobs in progress · delivery performance
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-white/30">Updated {relTime(lastRefresh.toISOString())}</span>
              <button
                onClick={() => void load("refresh")}
                disabled={refreshing}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/60 hover:bg-white/10 hover:text-white transition disabled:opacity-40"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </button>
              {/* Launch Driver App */}
              <button
                onClick={() => window.open(DRIVER_APP_URL, "_blank")}
                className="flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/15 px-4 py-2 text-sm font-bold text-sky-300 hover:bg-sky-500/25 transition shadow-[0_0_20px_rgba(56,189,248,0.15)]"
              >
                <Smartphone className="h-4 w-4" />
                Launch Driver App
                <ExternalLink className="h-3.5 w-3.5 opacity-60" />
              </button>
            </div>
          </div>
        </div>

        {/* ── KPI strip ── */}
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Total Drivers", value: stats.total,     icon: Users,        color: "text-white",         bg: "border-white/10"            },
            { label: "Available",     value: stats.available, icon: CheckCircle2, color: "text-emerald-300",   bg: "border-emerald-500/20"      },
            { label: "On Route",      value: stats.onRoute,   icon: Truck,        color: "text-cyan-300",      bg: "border-cyan-500/20"         },
            { label: "Offline",       value: stats.offline,   icon: WifiOff,      color: "text-white/30",      bg: "border-white/8"             },
            { label: "Active Jobs",   value: stats.activeJobs,icon: Activity,     color: "text-amber-300",     bg: "border-amber-500/20"        },
            { label: "Done Today",    value: stats.jobsToday, icon: Zap,          color: "text-violet-300",    bg: "border-violet-500/20"       },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className={`rounded-[22px] border ${bg} p-4 flex flex-col gap-1.5`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">{label}</span>
                <Icon className={`h-4 w-4 ${color} opacity-60`} />
              </div>
              <div className={`text-2xl font-black ${color} leading-none`}>{value}</div>
            </div>
          ))}
        </div>

        {/* ── Status filter tabs ── */}
        <div className="flex gap-2">
          {(["ALL","AVAILABLE","ON_ROUTE","OFFLINE"] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-wider transition ${
                statusFilter === s
                  ? s === "ALL"       ? "border-sky-400/40 bg-sky-500/15 text-sky-300"
                  : s === "AVAILABLE" ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
                  : s === "ON_ROUTE"  ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-300"
                  :                    "border-white/20 bg-white/10 text-white/50"
                  : "border-white/8 bg-white/3 text-white/40 hover:border-white/20 hover:text-white/70"
              }`}
            >
              {s === "ALL" ? `All (${stats.total})`
               : s === "AVAILABLE" ? `Available (${stats.available})`
               : s === "ON_ROUTE"  ? `On Route (${stats.onRoute})`
               :                     `Offline (${stats.offline})`}
            </button>
          ))}
        </div>

        {/* ── Main content: map + driver cards ── */}
        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">

          {/* Live map */}
          <div className="rounded-[28px] border border-white/10 overflow-hidden shadow-[0_18px_60px_rgba(0,0,0,0.4)]">
            <div className="flex items-center justify-between bg-black/40 px-5 py-3 border-b border-white/10">
              <div className="flex items-center gap-2 text-xs font-bold text-white/70">
                <div className={`h-2 w-2 rounded-full ${mappableDrivers.length > 0 ? "bg-emerald-400 animate-pulse" : "bg-white/20"}`} />
                {mappableDrivers.length > 0 ? `${mappableDrivers.length} drivers on map` : "No GPS data yet"}
              </div>
              {drivers.filter(d => !d.lastLat).length > 0 && (
                <span className="text-[10px] text-white/30">
                  {drivers.filter(d => !d.lastLat).length} drivers have no GPS position
                </span>
              )}
            </div>
            <div style={{ height: 480 }}>
              <MapContainer center={mapCenter} zoom={7} style={{ width: "100%", height: "100%" }} attributionControl={false}>
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  attribution='&copy; <a href="https://carto.com">CartoDB</a>'
                />
                {mappableDrivers.map((d, i) => (
                  <Marker
                    key={d.id}
                    position={[d.lastLat!, d.lastLng!]}
                    icon={makePin(STATUS_COLOR[d.status] ?? "#6b7280", String(i + 1))}
                  >
                    <Popup>
                      <div className="text-xs font-bold">{d.name}</div>
                      <div className="text-xs text-gray-500">{d.vehicleReg} · {d.status}</div>
                      <div className="text-xs text-gray-400">
                        {d.activeCollections.length + d.activeShipments.length} active · {d.jobsToday} done today
                      </div>
                      <div className="text-xs text-gray-400">Last seen {relTime(d.lastSeen)}</div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </div>

          {/* Driver cards */}
          <div className="space-y-4 overflow-y-auto" style={{ maxHeight: 520 }}>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 rounded-[28px] border border-dashed border-white/10 text-center">
                <Truck className="h-10 w-10 text-white/10 mb-3" />
                <p className="text-sm text-white/25">No drivers {statusFilter !== "ALL" ? `with status ${statusFilter}` : "found"}</p>
              </div>
            ) : (
              filtered.map(d => (
                <DriverCard key={d.id} driver={d} onWhatsApp={whatsApp} />
              ))
            )}
          </div>
        </div>

        {/* ── No GPS alert ── */}
        {drivers.filter(d => d.status === "ON_ROUTE" && !d.lastLat).length > 0 && (
          <div className="rounded-[22px] border border-amber-500/20 bg-amber-500/6 flex items-center gap-3 px-5 py-4 text-sm text-amber-300">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>
              {drivers.filter(d => d.status === "ON_ROUTE" && !d.lastLat).length} driver(s) are ON_ROUTE but have no GPS position — they may need to update their app.
            </span>
            <button
              onClick={() => window.open(DRIVER_APP_URL, "_blank")}
              className="ml-auto flex items-center gap-1.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-xs font-bold hover:bg-amber-500/20 transition"
            >
              Open Driver App <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* ── Driver Portal info box ── */}
        <div className="rounded-[28px] border border-sky-500/20 bg-sky-500/5 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-sky-500/20 ring-1 ring-sky-500/25">
                <Smartphone className="h-7 w-7 text-sky-400" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">Driver Portal App</h3>
                <p className="text-sm text-white/50 mt-0.5">
                  PWA for drivers — manifests, POD capture, offline sync, chat
                </p>
                <code className="mt-2 inline-block rounded-lg bg-black/40 px-3 py-1 text-xs text-white/60 font-mono">
                  {DRIVER_APP_URL}
                </code>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => window.open(DRIVER_APP_URL, "_blank")}
                className="flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/15 px-5 py-2.5 text-sm font-bold text-sky-300 hover:bg-sky-500/25 transition"
              >
                <ExternalLink className="h-4 w-4" />
                Open Driver App
              </button>
              <button
                onClick={() => navigate("/driver-dispatch")}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-white/60 hover:bg-white/10 hover:text-white transition"
              >
                <Truck className="h-4 w-4" />
                Dispatch View
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              { icon: "📦", label: "POD Capture", desc: "Signature + photo proof of delivery" },
              { icon: "📶", label: "Offline Mode",  desc: "Works without signal, syncs on reconnect" },
              { icon: "🗺️", label: "Route Map",    desc: "Turn-by-turn with live tracking" },
            ].map(f => (
              <div key={f.label} className="flex items-start gap-3 rounded-2xl border border-white/8 bg-black/25 px-4 py-3">
                <span className="text-xl">{f.icon}</span>
                <div>
                  <div className="text-sm font-bold text-white">{f.label}</div>
                  <div className="text-[11px] text-white/40">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-white/25">
            The driver portal runs at <code className="text-white/40">/driver/portal</code> — no separate server needed.
            {" "}Set <code className="text-white/40">VITE_DRIVER_APP_URL</code> in frontend/.env to point to a standalone deployed PWA.
          </p>
        </div>

      </div>
    </div>
  );
}
