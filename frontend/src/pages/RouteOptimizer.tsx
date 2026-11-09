import { errorMessageOf } from "@/components/patterns/errorMessage";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Route as RouteIcon, MapPin, Zap, Loader2, CheckSquare, Square, RefreshCw } from "lucide-react";
import { MapContainer, Marker, Polyline, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../api/client";
import OpenStreetMapLayer from "../components/maps/OpenStreetMapLayer";
import { getMapCoordinates } from "../lib/mapCoordinates";

type Collection = {
  id: string;
  clientName: string;
  pickupAddress: string;
  pickupLat: number | null;
  pickupLng: number | null;
  status: string;
};

type OptStop = {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  seq: number;
  legKm: number;
};

type OptimizedRoute = {
  stops: OptStop[];
  totalKm: number;
  totalMinutes?: number;
  skipped?: number;
  savedMinutes?: number;
  savedFuelZar?: number;
  fuelCostZar?: number;
  routingEngine?: "osrm" | "haversine";
};

function unwrapCollectionList(raw: unknown): Collection[] | null {
  const body = (raw as { data?: unknown } | null)?.data ?? raw;
  if (Array.isArray(body)) return body as Collection[];
  if (Array.isArray((body as { data?: unknown } | null)?.data)) return (body as { data: Collection[] }).data;
  return null;
}

function unwrapOptimizedRoute(raw: unknown): OptimizedRoute | null {
  const body = ((raw as { data?: unknown } | null)?.data ?? raw) as { stops?: { lat?: unknown; lng?: unknown; id?: unknown; seq?: unknown; legKm?: unknown }[]; totalKm?: unknown } | null;
  if (!body || !Array.isArray(body.stops) || !Number.isFinite(body.totalKm)) return null;
  const stops = body.stops.map((stop) => {
    const coordinates = getMapCoordinates(stop?.lat, stop?.lng);
    if (!coordinates || typeof stop?.id !== "string" || !Number.isFinite(stop?.seq) || !Number.isFinite(stop?.legKm)) {
      return null;
    }
    return { ...stop, ...coordinates } as OptStop;
  });
  if (stops.some((stop: OptStop | null) => stop === null)) return null;
  return { ...body, stops } as OptimizedRoute;
}

function numberIcon(n: number) {
  return L.divIcon({
    className: "",
    html: `<div style="background:#10b981;color:#04110a;font-weight:900;border-radius:9999px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:2px solid #04110a;box-shadow:0 0 0 2px #10b981">${n}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export default function RouteOptimizer() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [route, setRoute] = useState<OptimizedRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [optimizeError, setOptimizeError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const locatedCollections = useMemo(
    () => collections.flatMap((collection) => {
      const coordinates = getMapCoordinates(collection.pickupLat, collection.pickupLng);
      return coordinates ? [{ collection, coordinates }] : [];
    }),
    [collections],
  );

  const loadCollections = useCallback(() => (async () => {
    const raw = await api.get("/collections");
    const list = unwrapCollectionList(raw);
    if (!list) throw new Error("The collection service returned an unexpected response.");
    setCollections(list);
    setSelected(new Set(list.flatMap((collection) =>
      getMapCoordinates(collection.pickupLat, collection.pickupLng) ? [collection.id] : [],
    )));
    setRoute(null);
    setOptimizeError(null);
    setLoadError(null);
    setLastLoadedAt(new Date());

  })().catch((err: unknown) => {
    const message = errorMessageOf(err) || "Couldn’t load collections. Please try again.";
    setLoadError(Array.isArray(message) ? message.join(", ") : String(message));

  }).finally(() => {
    setLoading(false);

  }), []);

  useEffect(() => {
    void loadCollections();
  }, [loadCollections]);

  const toggle = (id: string) => {
    setRoute(null);
    setOptimizeError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const optimize = async () => {
    setOptimizing(true);
    setOptimizeError(null);
    setRoute(null);
    try {
      const raw = await api.post("/routing/optimize/collections", {
        collectionIds: Array.from(selected),
      });
      const result = unwrapOptimizedRoute(raw);
      if (!result) throw new Error("The routing service returned invalid or incomplete route data.");
      setRoute(result);
    } catch (err) {
      const message = errorMessageOf(err) || "Route optimization failed. Please try again.";
      setOptimizeError(Array.isArray(message) ? message.join(", ") : String(message));
    } finally {
      setOptimizing(false);
    }
  };

  const selectAll = () => {
    setRoute(null);
    setOptimizeError(null);
    setSelected(new Set(locatedCollections.map(({ collection }) => collection.id)));
  };
  const clearAll = () => {
    setRoute(null);
    setOptimizeError(null);
    setSelected(new Set());
  };

  const center: [number, number] = useMemo(() => {
    const points = locatedCollections.filter(({ collection }) => selected.has(collection.id));
    if (points.length === 0) return [-28.4793, 24.6727];
    const lat = points.reduce((sum, point) => sum + point.coordinates.lat, 0) / points.length;
    const lng = points.reduce((sum, point) => sum + point.coordinates.lng, 0) / points.length;
    return [lat, lng];
  }, [locatedCollections, selected]);

  const polyline: [number, number][] = route
    ? route.stops.map((stop) => [stop.lat, stop.lng])
    : [];
  const selectedStops = locatedCollections.filter(({ collection }) => selected.has(collection.id));
  const mapStops: OptStop[] = route?.stops ?? selectedStops.map(({ collection, coordinates }, index) => ({
    id: collection.id,
    lat: coordinates.lat,
    lng: coordinates.lng,
    label: collection.clientName,
    seq: index + 1,
    legKm: 0,
  }));
  const hasLoadedCollections = lastLoadedAt !== null;

  return (
    <div className="min-h-full bg-[#020617] text-slate-100 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-white/10 bg-emerald-500/10 p-3 text-emerald-400">
            <RouteIcon size={22} />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight">Route Optimizer</h1>
            <p className="text-sm text-white/50">
              Nearest-neighbour + 2-opt sequencing over geocoded pickups.
            </p>
            <p className="mt-1 text-xs text-white/30" role="status">
              {loading
                ? "Loading collection data…"
                : lastLoadedAt
                  ? `Collection snapshot loaded ${lastLoadedAt.toLocaleTimeString("en-ZA")}`
                  : "Collection data not yet loaded"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadCollections()}
          disabled={loading}
          aria-label="Refresh collections"
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white/70 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {loading && hasLoadedCollections && (
        <div role="status" className="rounded-2xl border border-sky-500/20 bg-sky-500/5 px-4 py-3 text-sm text-sky-200">
          Refreshing collections; the last successful snapshot remains visible.
        </div>
      )}
      {loadError && (
        <div role="alert" className="flex items-center justify-between gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <span>
            <strong>{hasLoadedCollections ? "Collection refresh failed." : "Collection data unavailable."}</strong>{" "}
            {hasLoadedCollections
              ? "Showing the last successful collection snapshot. "
              : "An empty collection list cannot be confirmed. "}
            {loadError}
          </span>
          <button
            type="button"
            onClick={() => void loadCollections()}
            disabled={loading}
            className="shrink-0 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-100 hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-50"
          >
            Retry load
          </button>
        </div>
      )}
      {optimizeError && (
        <div role="alert" className="flex items-center justify-between gap-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <span>{optimizeError}</span>
          <button
            type="button"
            onClick={() => void optimize()}
            disabled={optimizing || selected.size < 2}
            className="shrink-0 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-100 hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:opacity-50"
          >
            Retry optimization
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        {/* Stop selector */}
        <div className="rounded-[24px] border border-white/10 bg-slate-900/50 p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-white/60">
              Stops ({selected.size}/{locatedCollections.length})
            </h2>
            <div className="flex items-center gap-2">
              <button type="button" onClick={selectAll} disabled={loading || selected.size === locatedCollections.length}
                className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-30 transition">
                All
              </button>
              <span className="text-white/20">|</span>
              <button type="button" onClick={clearAll} disabled={loading || selected.size === 0}
                className="text-[10px] font-bold text-white/40 hover:text-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:opacity-30 transition">
                Clear
              </button>
              <button
                type="button"
                onClick={() => void optimize()}
                disabled={loading || optimizing || selected.size < 2}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 text-slate-950 px-4 py-2 text-sm font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-40"
              >
                {optimizing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                Optimize
              </button>
            </div>
          </div>

          {loading && collections.length === 0 ? (
            <div role="status" className="text-white/40 text-sm py-10 text-center">Loading collections…</div>
          ) : loadError && !hasLoadedCollections && collections.length === 0 ? (
            <div role="status" className="text-amber-200/80 text-sm py-10 text-center">
              Collection data unavailable; retry to confirm which stops are available.
            </div>
          ) : collections.length === 0 ? (
            <div className="text-white/40 text-sm py-10 text-center space-y-2">
              <div className="font-bold">No collections are available.</div>
              <div className="text-xs text-white/25 leading-relaxed">
                This is the successfully loaded collection list. Collections need valid pickup coordinates to be routed.
              </div>
            </div>
          ) : (
            <div className="space-y-2 overflow-y-auto max-h-[520px] custom-scrollbar pr-1">
              {collections.map((c) => {
                const coordinates = getMapCoordinates(c.pickupLat, c.pickupLng);
                const on = selected.has(c.id);
                const seq = route?.stops.find((stop) => stop.id === c.id)?.seq;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggle(c.id)}
                    disabled={!coordinates || loading || optimizing}
                    aria-pressed={on}
                    className={`w-full text-left flex items-start gap-3 rounded-2xl border p-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 ${
                      on ? "border-emerald-400/30 bg-emerald-500/5" : "border-white/10 bg-white/[0.02]"
                    }`}
                  >
                    {on ? (
                      <CheckSquare size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                    ) : (
                      <Square size={16} className="text-white/30 mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold truncate">{c.clientName || "Unnamed collection"}</div>
                      <div className="text-[11px] text-white/40 truncate flex items-center gap-1">
                        <MapPin size={10} /> {c.pickupAddress || "Pickup address not provided"}
                      </div>
                      {!coordinates && (
                        <div className="mt-1 text-[10px] font-semibold text-amber-200">
                          Coordinates unavailable — not selectable for routing
                        </div>
                      )}
                    </div>
                    {seq != null && (
                      <span className="rounded-full bg-emerald-500 text-slate-950 text-[10px] font-black px-2 py-0.5">
                        #{seq}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {route && (
            <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-4">
              <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-300 font-black">
                Optimized Route
              </div>
              <div className="mt-1 text-2xl font-black">{route.totalKm} km</div>
              <div className="text-[11px] text-white/40">
                {route.stops.length} stops{route.skipped ? ` · ${route.skipped} skipped by optimizer` : ""}
              </div>

              <div className="mt-3 space-y-2 border-t border-emerald-400/10 pt-3">
                {route.savedFuelZar != null ? (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/40">Fuel savings (optimizer estimate)</span>
                    <span className="text-xs font-black text-emerald-300">R{route.savedFuelZar.toFixed(2)}</span>
                  </div>
                ) : (
                  <div className="text-[10px] text-white/40">Fuel-savings estimate not supplied by the optimizer.</div>
                )}
                {route.savedMinutes != null ? (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/40">Time saved (optimizer estimate)</span>
                    <span className="text-xs font-black text-emerald-300">{route.savedMinutes} min</span>
                  </div>
                ) : (
                  <div className="text-[10px] text-white/40">Time-savings estimate not supplied by the optimizer.</div>
                )}
                {route.fuelCostZar != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/40">Estimated route fuel cost</span>
                    <span className="text-xs font-black text-white/80">R{route.fuelCostZar.toFixed(2)}</span>
                  </div>
                )}
                {route.routingEngine && (
                  <div className="text-[9px] text-white/25">Routing engine: {route.routingEngine}</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Map */}
        <div className="rounded-[24px] border border-white/10 bg-slate-900/50 overflow-hidden h-[640px]">
          <MapContainer center={center} zoom={6} style={{ height: "100%", width: "100%" }} >
            <OpenStreetMapLayer />
            {polyline.length > 1 && (
              <Polyline positions={polyline} pathOptions={{ color: "#10b981", weight: 4, opacity: 0.8 }} />
            )}
            {mapStops.map((s) => (
              <Marker key={s.id} position={[s.lat, s.lng]} icon={numberIcon(s.seq)}>
                <Popup>
                  <div className="text-slate-900 text-xs font-sans">
                    <div className="font-black">#{s.seq} {s.label}</div>
                    {s.legKm > 0 && <div>Leg: {s.legKm} km</div>}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
