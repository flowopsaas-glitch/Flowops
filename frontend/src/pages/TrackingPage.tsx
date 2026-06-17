import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Package, Truck, MapPin, Clock, Search, CheckCircle2, Loader2 } from "lucide-react";
import { MapContainer, TileLayer, Marker, Polyline, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { FLOWOPS_API_URL } from "../lib/env";

type TrackData = {
  trackingNumber: string;
  status: string;
  statusLabel: string;
  delivered: boolean;
  recipientName: string;
  driver: { name: string; vehicleReg: string | null } | null;
  current: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number } | null;
  remainingKm: number | null;
  etaMinutes: number | null;
  estimatedDelivery: string | null;
  deliveredAt: string | null;
  branding: { brandName: string; logoUrl: string | null; primaryColor: string };
  updatedAt: string;
};

function pin(color: string, label: string) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};color:#fff;font-weight:900;border-radius:9999px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);font-size:14px">${label}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export default function TrackingPage() {
  const { trackingNumber } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState(trackingNumber || "");
  const [data, setData] = useState<TrackData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchTracking = useCallback(async (num: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${FLOWOPS_API_URL}/track/${encodeURIComponent(num)}`);
      if (!res.ok) throw new Error(res.status === 404 ? "Tracking number not found." : "Unable to load tracking.");
      const body = await res.json();
      setData(body?.data ?? body);
    } catch (e: any) {
      setError(e.message || "Unable to load tracking.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (trackingNumber) fetchTracking(trackingNumber);
  }, [trackingNumber, fetchTracking]);

  // Live refresh every 20s while a parcel is in motion.
  useEffect(() => {
    if (!data || data.delivered || !trackingNumber) return;
    const t = setInterval(() => fetchTracking(trackingNumber), 20000);
    return () => clearInterval(t);
  }, [data, trackingNumber, fetchTracking]);

  const accent = data?.branding.primaryColor || "#10b981";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) navigate(`/track/${encodeURIComponent(query.trim())}`);
  };

  const mapCenter: [number, number] = data?.current
    ? [data.current.lat, data.current.lng]
    : data?.destination
      ? [data.destination.lat, data.destination.lng]
      : [-28.4793, 24.6727];

  const line: [number, number][] =
    data?.current && data?.destination
      ? [[data.current.lat, data.current.lng], [data.destination.lat, data.destination.lng]]
      : [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Branded header */}
      <header className="border-b border-white/10 bg-slate-900/60 backdrop-blur px-6 py-4 flex items-center gap-3">
        {data?.branding.logoUrl ? (
          <img src={data.branding.logoUrl} alt="logo" className="h-9 w-9 rounded-xl object-cover" />
        ) : (
          <div className="h-9 w-9 rounded-xl grid place-items-center" style={{ background: accent }}>
            <Package size={18} className="text-white" />
          </div>
        )}
        <div className="font-black tracking-tight">{data?.branding.brandName || "Track your parcel"}</div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8 space-y-6">
        <form onSubmit={submit} className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter your tracking number"
            className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-white/30"
          />
          <button type="submit" className="rounded-2xl px-5 font-bold text-slate-950" style={{ background: accent }}>
            <Search size={18} />
          </button>
        </form>

        {loading && (
          <div className="flex items-center gap-2 text-white/60 text-sm">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-rose-200 text-sm">
            {error}
          </div>
        )}

        {data && (
          <>
            <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Tracking #</div>
                  <div className="text-lg font-black">{data.trackingNumber}</div>
                </div>
                <span
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black"
                  style={{ background: `${accent}22`, color: accent }}
                >
                  {data.delivered ? <CheckCircle2 size={14} /> : <Truck size={14} />}
                  {data.statusLabel}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/40">
                    <Clock size={12} /> {data.delivered ? "Delivered" : "Estimated arrival"}
                  </div>
                  <div className="mt-1 text-2xl font-black">
                    {data.delivered
                      ? data.deliveredAt
                        ? new Date(data.deliveredAt).toLocaleString()
                        : "Delivered"
                      : data.etaMinutes != null
                        ? `~${data.etaMinutes} min`
                        : data.estimatedDelivery
                          ? new Date(data.estimatedDelivery).toLocaleString()
                          : "—"}
                  </div>
                  {!data.delivered && data.remainingKm != null && (
                    <div className="text-[11px] text-white/40">{data.remainingKm} km to go</div>
                  )}
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/40">
                    <Truck size={12} /> Courier
                  </div>
                  <div className="mt-1 text-lg font-black">{data.driver?.name || "Assigning…"}</div>
                  {data.driver?.vehicleReg && (
                    <div className="text-[11px] text-white/40">{data.driver.vehicleReg}</div>
                  )}
                </div>
              </div>
            </div>

            {(data.current || data.destination) && (
              <div className="rounded-[24px] border border-white/10 overflow-hidden h-[360px]">
                <MapContainer center={mapCenter} zoom={11} style={{ height: "100%", width: "100%" }}>
                  <TileLayer
                    attribution='&copy; OpenStreetMap'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {line.length === 2 && (
                    <Polyline positions={line} pathOptions={{ color: accent, weight: 4, dashArray: "8 8" }} />
                  )}
                  {data.current && (
                    <Marker position={[data.current.lat, data.current.lng]} icon={pin(accent, "C")}>
                      <Popup>Courier location</Popup>
                    </Marker>
                  )}
                  {data.destination && (
                    <Marker position={[data.destination.lat, data.destination.lng]} icon={pin("#334155", "D")}>
                      <Popup>Delivery destination</Popup>
                    </Marker>
                  )}
                </MapContainer>
              </div>
            )}

            <div className="text-center text-[11px] text-white/30">
              Last updated {new Date(data.updatedAt).toLocaleTimeString()} · auto-refreshes live
            </div>
          </>
        )}
      </main>
    </div>
  );
}
