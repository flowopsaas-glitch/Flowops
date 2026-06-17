import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Activity, AlertTriangle, Building2, RefreshCw } from "lucide-react";
import { api } from "../../api/client";

type Courier = {
  id: string;
  status: string;
  lat: number;
  lng: number;
  tenant: string | null;
  driver: string | null;
  vehicleReg: string | null;
  trackingNumber: string | null;
  destLat: number | null;
  destLng: number | null;
};
type Exception = {
  id: string;
  lat: number;
  lng: number;
  status: string;
  tenant: string | null;
  trackingNumber: string;
};
type LiveOps = {
  generatedAt: string;
  summary: { activeCouriers: number; exceptions: number; tenantsActive: number };
  couriers: Courier[];
  exceptions: Exception[];
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: "#64748b",
  COLLECTED: "#3b82f6",
  IN_TRANSIT: "#06b6d4",
  OUT_FOR_DELIVERY: "#22c55e",
};

function courierPin(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};color:#fff;border-radius:9999px;width:18px;height:18px;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function Stat(props: { icon: React.ReactNode; label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/50">{props.label}</div>
        <div className="text-white/40">{props.icon}</div>
      </div>
      <div className={`mt-2 text-3xl font-black ${props.tone ?? "text-white"}`}>{props.value}</div>
    </div>
  );
}

// Centre on South Africa by default (FlowOps' home market).
const ZA_CENTER: [number, number] = [-28.8, 24.7];

export default function OwnerOpsMap() {
  const [data, setData] = useState<LiveOps | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res: any = await api.get("/owner/ops/live");
      setData((res?.data ?? res) as LiveOps);
    } catch (err: any) {
      setError(err?.message || "Failed to load live operations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Auto-refresh the live picture every 30s.
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  const couriers = useMemo(
    () => (data?.couriers ?? []).filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng)),
    [data],
  );
  const exceptions = useMemo(
    () => (data?.exceptions ?? []).filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lng)),
    [data],
  );

  return (
    <div className="space-y-6">
      <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-7 shadow-xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
              Live Operations
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-white">Platform Ops Map</h1>
            <p className="mt-2 max-w-3xl text-slate-300">
              Every active courier and delivery exception across all tenants, on one map. Auto-refreshes every 30s.
            </p>
          </div>
          <button onClick={load} className="inline-flex items-center gap-2 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-2.5 text-sm font-bold text-cyan-200">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
        {error ? (
          <div className="mt-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Stat icon={<Activity className="h-5 w-5" />} label="Active Couriers" value={String(data?.summary.activeCouriers ?? 0)} />
        <Stat icon={<Building2 className="h-5 w-5" />} label="Tenants Live" value={String(data?.summary.tenantsActive ?? 0)} />
        <Stat icon={<AlertTriangle className="h-5 w-5" />} label="Exceptions" value={String(data?.summary.exceptions ?? 0)} tone="text-rose-300" />
      </div>

      <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.05] shadow-xl">
        <div className="h-[560px] w-full">
          <MapContainer center={ZA_CENTER} zoom={6} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Exception heat markers (red, semi-transparent) */}
            {exceptions.map((e) => (
              <CircleMarker
                key={`x-${e.id}`}
                center={[e.lat, e.lng]}
                radius={10}
                pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.35, weight: 1 }}
              >
                <Popup>
                  <div style={{ fontWeight: 700 }}>{e.trackingNumber}</div>
                  <div>{e.tenant}</div>
                  <div style={{ color: "#b91c1c" }}>{e.status}</div>
                </Popup>
              </CircleMarker>
            ))}

            {/* Live couriers */}
            {couriers.map((c) => (
              <Marker key={`c-${c.id}`} position={[c.lat, c.lng]} icon={courierPin(STATUS_COLOR[c.status] ?? "#06b6d4")}>
                <Popup>
                  <div style={{ fontWeight: 700 }}>{c.driver || "Courier"}{c.vehicleReg ? ` · ${c.vehicleReg}` : ""}</div>
                  <div>{c.tenant}</div>
                  {c.trackingNumber ? <div>WB: {c.trackingNumber}</div> : null}
                  <div style={{ color: "#0891b2" }}>{c.status.replace(/_/g, " ")}</div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: "#22c55e" }} /> Out for delivery</span>
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: "#06b6d4" }} /> In transit</span>
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: "#3b82f6" }} /> Collected</span>
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: "#64748b" }} /> Pending</span>
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: "#ef4444", opacity: 0.5 }} /> Exception</span>
      </div>

      {!loading && couriers.length === 0 && exceptions.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-center text-sm text-slate-400">
          No live telemetry yet. Couriers appear here once shipments report GPS positions and addresses are geocoded.
        </div>
      ) : null}
    </div>
  );
}
