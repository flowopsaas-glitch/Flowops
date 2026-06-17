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
  tenantId: string | null;
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

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  COLLECTED: "Collected",
  IN_TRANSIT: "In Transit",
  OUT_FOR_DELIVERY: "Out for Delivery",
  FAILED_DELIVERY: "Failed",
  RETURNED: "Returned",
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

const ZA_CENTER: [number, number] = [-28.8, 24.7];

export default function OwnerOpsMap() {
  const [data, setData] = useState<LiveOps | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tenantFilter, setTenantFilter] = useState("all");

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
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  // Unique tenant names for filter
  const tenants = useMemo(() => {
    if (!data) return [];
    const names = new Set([
      ...data.couriers.map((c) => c.tenant).filter(Boolean),
      ...data.exceptions.map((e) => e.tenant).filter(Boolean),
    ]);
    return Array.from(names) as string[];
  }, [data]);

  const couriers = useMemo(() => {
    const base = (data?.couriers ?? []).filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng));
    return tenantFilter === "all" ? base : base.filter((c) => c.tenant === tenantFilter);
  }, [data, tenantFilter]);

  const exceptions = useMemo(() => {
    const base = (data?.exceptions ?? []).filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lng));
    return tenantFilter === "all" ? base : base.filter((e) => e.tenant === tenantFilter);
  }, [data, tenantFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-7 shadow-xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
              Live Operations
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-white">Platform Ops Map</h1>
            <p className="mt-2 max-w-3xl text-slate-300">
              Every active courier and delivery exception across all tenants. Auto-refreshes every 30s.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {tenants.length > 0 ? (
              <select value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)}
                className="rounded-2xl border border-white/10 bg-[#071224] px-4 py-2.5 text-sm text-white outline-none focus:border-blue-400">
                <option value="all">All tenants</option>
                {tenants.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            ) : null}
            <button onClick={load} className="inline-flex items-center gap-2 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-2.5 text-sm font-bold text-cyan-200">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </div>
        {error ? <div className="mt-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
      </div>

      {/* Summary strip */}
      <div className="grid gap-4 md:grid-cols-3">
        <Stat icon={<Activity className="h-5 w-5" />} label="Active Couriers" value={String(couriers.length)} />
        <Stat icon={<Building2 className="h-5 w-5" />} label="Tenants Live" value={String(data?.summary.tenantsActive ?? 0)} />
        <Stat icon={<AlertTriangle className="h-5 w-5" />} label="Exceptions" value={String(exceptions.length)} tone="text-rose-300" />
      </div>

      {/* Map + Exception sidebar */}
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        {/* Map */}
        <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.05] shadow-xl">
          <div className="h-[520px] w-full">
            <MapContainer center={ZA_CENTER} zoom={6} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {exceptions.map((e) => (
                <CircleMarker key={`x-${e.id}`} center={[e.lat, e.lng]} radius={10}
                  pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.35, weight: 1 }}>
                  <Popup>
                    <div style={{ fontWeight: 700 }}>{e.trackingNumber}</div>
                    <div>{e.tenant}</div>
                    <div style={{ color: "#b91c1c" }}>{STATUS_LABEL[e.status] ?? e.status}</div>
                  </Popup>
                </CircleMarker>
              ))}
              {couriers.map((c) => (
                <Marker key={`c-${c.id}`} position={[c.lat, c.lng]} icon={courierPin(STATUS_COLOR[c.status] ?? "#06b6d4")}>
                  <Popup>
                    <div style={{ fontWeight: 700 }}>{c.driver || "Courier"}{c.vehicleReg ? ` · ${c.vehicleReg}` : ""}</div>
                    <div>{c.tenant}</div>
                    {c.trackingNumber ? <div>WB: {c.trackingNumber}</div> : null}
                    <div style={{ color: "#0891b2" }}>{STATUS_LABEL[c.status] ?? c.status}</div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </div>

        {/* Exception sidebar */}
        <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 shadow-xl flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="text-base font-black text-white">Exceptions</div>
            <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-bold text-rose-200">
              {exceptions.length}
            </span>
          </div>
          {exceptions.length === 0 ? (
            <div className="flex-1 grid place-items-center text-sm text-slate-400 text-center py-8">
              No delivery exceptions{tenantFilter !== "all" ? " for this tenant" : ""}.
            </div>
          ) : (
            <div className="space-y-2 overflow-y-auto flex-1 max-h-[440px] pr-1">
              {exceptions.map((e) => (
                <div key={e.id} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-mono text-xs font-bold text-white truncate">{e.trackingNumber}</div>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold whitespace-nowrap ${
                      e.status === "FAILED_DELIVERY" ? "border-rose-400/20 bg-rose-500/10 text-rose-200" : "border-amber-400/20 bg-amber-500/10 text-amber-200"
                    }`}>
                      {STATUS_LABEL[e.status] ?? e.status}
                    </span>
                  </div>
                  {e.tenant ? <div className="mt-1 text-[11px] text-slate-400">{e.tenant}</div> : null}
                  <div className="mt-0.5 text-[10px] text-white/30">
                    {Number.isFinite(e.lat) ? `${e.lat.toFixed(4)}, ${e.lng.toFixed(4)}` : "No coords"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
        {Object.entries(STATUS_COLOR).map(([k, c]) => (
          <span key={k} className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: c }} />
            {STATUS_LABEL[k] ?? k}
          </span>
        ))}
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ background: "#ef4444", opacity: 0.5 }} /> Exception
        </span>
      </div>

      {!loading && couriers.length === 0 && exceptions.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-center text-sm text-slate-400">
          No live telemetry yet. Couriers appear here once shipments report GPS positions and addresses are geocoded.
        </div>
      ) : null}
    </div>
  );
}

