import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Activity, AlertTriangle, Building2, RefreshCw } from "lucide-react";
import { api } from "../../api/client";
import OpenStreetMapLayer from "../../components/maps/OpenStreetMapLayer";
import { getMapCoordinates } from "../../lib/mapCoordinates";

type Courier = {
  id: string;
  status: string;
  lat: number | null;
  lng: number | null;
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
  lat: number | null;
  lng: number | null;
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

function unwrapLiveOps(raw: any): LiveOps | null {
  const body = raw?.data ?? raw;
  if (
    !body ||
    typeof body !== "object" ||
    typeof body.generatedAt !== "string" ||
    !body.summary ||
    !Number.isFinite(body.summary.activeCouriers) ||
    !Number.isFinite(body.summary.exceptions) ||
    !Number.isFinite(body.summary.tenantsActive) ||
    !Array.isArray(body.couriers) ||
    !Array.isArray(body.exceptions)
  ) return null;
  return body as LiveOps;
}

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
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [tenantFilter, setTenantFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const raw = await api.get("/owner/ops/live");
      const response = unwrapLiveOps(raw);
      if (!response) throw new Error("The live operations service returned an unexpected response.");
      setData(response);
      setLastLoadedAt(new Date());
    } catch (err: any) {
      const message = err?.response?.data?.message ?? err?.message ?? "Failed to load live operations.";
      setError(Array.isArray(message) ? message.join(", ") : String(message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  // Unique tenant names for filter
  const tenants = useMemo(() => {
    if (!data) return [];
    const names = new Set([
      ...data.couriers.map((c) => c.tenant).filter(Boolean),
      ...data.exceptions.map((e) => e.tenant).filter(Boolean),
    ]);
    return Array.from(names) as string[];
  }, [data]);

  const visibleCouriers = useMemo(
    () => (data?.couriers ?? []).filter((courier) => tenantFilter === "all" || courier.tenant === tenantFilter),
    [data, tenantFilter],
  );
  const visibleExceptions = useMemo(
    () => (data?.exceptions ?? []).filter((exception) => tenantFilter === "all" || exception.tenant === tenantFilter),
    [data, tenantFilter],
  );
  const mappableCouriers = useMemo(
    () => visibleCouriers.flatMap((courier) => {
      const coordinates = getMapCoordinates(courier.lat, courier.lng);
      return coordinates ? [{ courier, coordinates }] : [];
    }),
    [visibleCouriers],
  );
  const mappableExceptions = useMemo(
    () => visibleExceptions.flatMap((exception) => {
      const coordinates = getMapCoordinates(exception.lat, exception.lng);
      return coordinates ? [{ exception, coordinates }] : [];
    }),
    [visibleExceptions],
  );
  const unlocatedCourierCount = visibleCouriers.length - mappableCouriers.length;
  const unlocatedExceptionCount = visibleExceptions.length - mappableExceptions.length;
  const liveTenantCount = new Set(visibleCouriers.map((courier) => courier.tenantId).filter(Boolean)).size;
  const hasSnapshot = data !== null;

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
              Couriers with reported GPS and geocoded delivery exceptions across tenants. Auto-refreshes every 30s.
            </p>
            <p className="mt-1 text-xs text-white/35" role="status">
              {loading
                ? hasSnapshot ? "Refreshing snapshot…" : "Loading live operations…"
                : lastLoadedAt
                  ? `Last successful snapshot ${lastLoadedAt.toLocaleTimeString("en-ZA")}`
                  : "Live operations snapshot not yet loaded"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {tenants.length > 0 ? (
              <select value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)}
                aria-label="Filter live operations by tenant"
                className="rounded-2xl border border-white/10 bg-[#071224] px-4 py-2.5 text-sm text-white outline-none focus:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-400">
                <option value="all">All tenants</option>
                {tenants.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            ) : null}
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              aria-label="Refresh live operations"
              className="inline-flex items-center gap-2 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-2.5 text-sm font-bold text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        </div>
        {error && (
          <div role="alert" className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <strong>{hasSnapshot ? "Refresh failed." : "Live operations unavailable."}</strong>{" "}
            {hasSnapshot
              ? `Showing the last successful snapshot${lastLoadedAt ? ` from ${lastLoadedAt.toLocaleTimeString("en-ZA")}` : ""}. `
              : "No zero-count or empty state can be confirmed. "}
            {error}
          </div>
        )}
      </div>

      {/* Summary strip */}
      <div className="grid gap-4 md:grid-cols-3">
        <Stat icon={<Activity className="h-5 w-5" />} label="Active Couriers" value={hasSnapshot ? String(visibleCouriers.length) : "—"} />
        <Stat icon={<Building2 className="h-5 w-5" />} label="Tenants Live" value={hasSnapshot ? String(liveTenantCount) : "—"} />
        <Stat icon={<AlertTriangle className="h-5 w-5" />} label="Exceptions" value={hasSnapshot ? String(visibleExceptions.length) : "—"} tone="text-rose-300" />
      </div>

      {/* Map + Exception sidebar */}
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        {/* Map */}
        <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.05] shadow-xl">
          <div className="relative h-[520px] w-full">
            <MapContainer center={ZA_CENTER} zoom={6} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
              <OpenStreetMapLayer />
              {mappableExceptions.map(({ exception: e, coordinates }) => (
                <CircleMarker key={`x-${e.id}`} center={[coordinates.lat, coordinates.lng]} radius={10}
                  pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.35, weight: 1 }}>
                  <Popup>
                    <div style={{ fontWeight: 700 }}>{e.trackingNumber}</div>
                    <div>{e.tenant}</div>
                    <div style={{ color: "#b91c1c" }}>{STATUS_LABEL[e.status] ?? e.status}</div>
                  </Popup>
                </CircleMarker>
              ))}
              {mappableCouriers.map(({ courier: c, coordinates }) => (
                <Marker key={`c-${c.id}`} position={[coordinates.lat, coordinates.lng]} icon={courierPin(STATUS_COLOR[c.status] ?? "#06b6d4")}>
                  <Popup>
                    <div style={{ fontWeight: 700 }}>{c.driver || "Courier"}{c.vehicleReg ? ` · ${c.vehicleReg}` : ""}</div>
                    <div>{c.tenant}</div>
                    {c.trackingNumber ? <div>WB: {c.trackingNumber}</div> : null}
                    <div style={{ color: "#0891b2" }}>{STATUS_LABEL[c.status] ?? c.status}</div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
            <div role="status" className="absolute left-4 top-4 z-[1000] max-w-[min(32rem,calc(100%-2rem))] rounded-xl border border-white/10 bg-slate-950/90 px-4 py-3 text-xs text-white/80 shadow-xl">
              {hasSnapshot
                ? `${mappableCouriers.length} courier${mappableCouriers.length === 1 ? "" : "s"} and ${mappableExceptions.length} exception${mappableExceptions.length === 1 ? "" : "s"} plotted.`
                : loading
                  ? "Loading map positions…"
                  : "Map positions unavailable."}
              {(unlocatedCourierCount + unlocatedExceptionCount) > 0 && (
                <span className="mt-1 block text-amber-200">
                  {unlocatedCourierCount + unlocatedExceptionCount} record{unlocatedCourierCount + unlocatedExceptionCount === 1 ? "" : "s"} retained in the source counts or exception list but not plotted because coordinates are invalid.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Exception sidebar */}
        <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 shadow-xl flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="text-base font-black text-white">Exceptions</div>
            <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-bold text-rose-200">
              {hasSnapshot ? visibleExceptions.length : "—"}
            </span>
          </div>
          {loading && !hasSnapshot ? (
            <div role="status" className="flex-1 grid place-items-center text-sm text-slate-400 text-center py-8">
              Loading exception data…
            </div>
          ) : !hasSnapshot && error ? (
            <div role="status" className="flex-1 grid place-items-center text-sm text-amber-200 text-center py-8">
              Exception data unavailable; retry to confirm the current list.
            </div>
          ) : visibleExceptions.length === 0 ? (
            <div className="flex-1 grid place-items-center text-sm text-slate-400 text-center py-8">
              No delivery exceptions{tenantFilter !== "all" ? " for this tenant" : " in this snapshot"}.
            </div>
          ) : (
            <div className="space-y-2 overflow-y-auto flex-1 max-h-[440px] pr-1">
              {visibleExceptions.map((e) => {
                const location = getMapCoordinates(e.lat, e.lng);
                return (
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
                      {location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : "Location unavailable — not plotted"}
                    </div>
                  </div>
                );
              })}
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

      {hasSnapshot && !loading && !error && visibleCouriers.length === 0 && visibleExceptions.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-center text-sm text-slate-400">
          This snapshot contains no active courier positions or delivery exceptions{tenantFilter !== "all" ? " for the selected tenant" : ""}.
        </div>
      ) : null}
    </div>
  );
}

