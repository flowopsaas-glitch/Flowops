import React, { useEffect, useMemo, useState } from "react";
import { Route as RouteIcon, MapPin, Zap, Loader2, CheckSquare, Square } from "lucide-react";
import { MapContainer, TileLayer, Marker, Polyline, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../api/client";

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
  skipped?: number;
};

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

  useEffect(() => {
    api
      .get("/collections")
      .then((res) => {
        const list: Collection[] = (res.data ?? []).filter(
          (c: Collection) => c.pickupLat != null && c.pickupLng != null,
        );
        setCollections(list);
        setSelected(new Set(list.map((c) => c.id)));
      })
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const optimize = async () => {
    setOptimizing(true);
    try {
      const res = await api.post("/routing/optimize/collections", {
        collectionIds: Array.from(selected),
      });
      setRoute(res.data);
    } finally {
      setOptimizing(false);
    }
  };

  const center: [number, number] = useMemo(() => {
    const pts = collections.filter((c) => selected.has(c.id));
    if (pts.length === 0) return [-28.4793, 24.6727];
    const lat = pts.reduce((s, c) => s + (c.pickupLat as number), 0) / pts.length;
    const lng = pts.reduce((s, c) => s + (c.pickupLng as number), 0) / pts.length;
    return [lat, lng];
  }, [collections, selected]);

  const polyline: [number, number][] = route
    ? route.stops.map((s) => [s.lat, s.lng])
    : [];

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 p-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl border border-white/10 bg-emerald-500/10 p-3 text-emerald-400">
          <RouteIcon size={22} />
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-tight">Route Optimizer</h1>
          <p className="text-sm text-white/50">
            Nearest-neighbour + 2-opt sequencing over geocoded pickups.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        {/* Stop selector */}
        <div className="rounded-[24px] border border-white/10 bg-slate-900/50 p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-white/60">
              Stops ({selected.size})
            </h2>
            <button
              onClick={optimize}
              disabled={optimizing || selected.size < 2}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 text-slate-950 px-4 py-2 text-sm font-black disabled:opacity-40"
            >
              {optimizing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
              Optimize
            </button>
          </div>

          {loading ? (
            <div className="text-white/40 text-sm py-10 text-center">Loading collections…</div>
          ) : collections.length === 0 ? (
            <div className="text-white/40 text-sm py-10 text-center">
              No geocoded collections yet. Create collections with a pickup address,
              or run the geocoding backfill.
            </div>
          ) : (
            <div className="space-y-2 overflow-y-auto max-h-[520px] custom-scrollbar pr-1">
              {collections.map((c) => {
                const on = selected.has(c.id);
                const seq = route?.stops.find((s) => s.id === c.id)?.seq;
                return (
                  <button
                    key={c.id}
                    onClick={() => toggle(c.id)}
                    className={`w-full text-left flex items-start gap-3 rounded-2xl border p-3 transition ${
                      on ? "border-emerald-400/30 bg-emerald-500/5" : "border-white/10 bg-white/[0.02]"
                    }`}
                  >
                    {on ? (
                      <CheckSquare size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                    ) : (
                      <Square size={16} className="text-white/30 mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold truncate">{c.clientName}</div>
                      <div className="text-[11px] text-white/40 truncate flex items-center gap-1">
                        <MapPin size={10} /> {c.pickupAddress}
                      </div>
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
                {route.stops.length} stops{route.skipped ? ` · ${route.skipped} skipped (no coords)` : ""}
              </div>
            </div>
          )}
        </div>

        {/* Map */}
        <div className="rounded-[24px] border border-white/10 bg-slate-900/50 overflow-hidden h-[640px]">
          <MapContainer center={center} zoom={6} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {polyline.length > 1 && (
              <Polyline positions={polyline} pathOptions={{ color: "#10b981", weight: 4, opacity: 0.8 }} />
            )}
            {(route?.stops ?? collections
              .filter((c) => selected.has(c.id))
              .map((c, i) => ({ id: c.id, lat: c.pickupLat as number, lng: c.pickupLng as number, label: c.clientName, seq: i + 1, legKm: 0 }))
            ).map((s) => (
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
