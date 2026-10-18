import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Package, Truck, MapPin, Search, CheckCircle2,
  Loader2, AlertTriangle, Star, Navigation,
} from "lucide-react";
import { MapContainer, Marker, Polyline, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { FLOWOPS_API_URL } from "../lib/env";
import BackButton from "../components/BackButton";
import OpenStreetMapLayer from "../components/maps/OpenStreetMapLayer";
import { getBestMapCenter, getMapCoordinates } from "../lib/mapCoordinates";

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
  ratingToken?: string | null;
};

const STATUS_STEPS = [
  { key: "PENDING",          label: "Order placed",      icon: Package },
  { key: "COLLECTED",        label: "Collected",         icon: Package },
  { key: "IN_TRANSIT",       label: "In transit",        icon: Truck },
  { key: "OUT_FOR_DELIVERY", label: "Out for delivery",  icon: Truck },
  { key: "DELIVERED",        label: "Delivered",         icon: CheckCircle2 },
];

function pin(color: string, emoji: string) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};color:#fff;font-weight:900;border-radius:9999px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.5);font-size:16px">${emoji}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function ETACountdown({ etaMinutes }: { etaMinutes: number }) {
  const [remaining, setRemaining] = useState(etaMinutes);
  useEffect(() => {
    if (etaMinutes <= 0) return;
    const t = setInterval(() => {
      setRemaining((r) => {
        const next = Math.max(0, r - 1);
        if (next === 0) clearInterval(t);
        return next;
      });
    }, 60000);
    return () => clearInterval(t);
  }, [etaMinutes]);
  if (remaining <= 0) return <span className="text-emerald-400 font-black">Arriving now</span>;
  const h = Math.floor(remaining / 60);
  const m = remaining % 60;
  return (
    <span className="text-sky-300 font-black tabular-nums">
      {h > 0 ? `${h}h ` : ""}{m}min
    </span>
  );
}

export default function TrackingPage() {
  const { trackingNumber } = useParams();
  const navigate = useNavigate();
  const [queryState, setQueryState] = useState(() => ({ route: trackingNumber, value: trackingNumber || "" }));
  const query = queryState.route === trackingNumber ? queryState.value : trackingNumber || "";
  const [data, setData] = useState<TrackData | null>(null);
  const dataRef = useRef<TrackData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);

  const fetchTracking = useCallback(async (num: string, preserveSnapshotOnError = false) => {
    const keepCurrentSnapshot = preserveSnapshotOnError && dataRef.current?.trackingNumber === num;
    setLoading(true);
    setError("");
    if (!keepCurrentSnapshot) {
      dataRef.current = null;
      setData(null);
      setLastFetchedAt(null);
    }
    try {
      const res = await fetch(`${FLOWOPS_API_URL}/track/${encodeURIComponent(num)}`);
      if (!res.ok) throw new Error(res.status === 404 ? "Tracking number not found." : "Unable to load tracking.");
      const body = await res.json();
      const payload = body?.data ?? body;
      if (
        !payload ||
        typeof payload.trackingNumber !== "string" ||
        typeof payload.status !== "string" ||
        typeof payload.delivered !== "boolean" ||
        typeof payload.updatedAt !== "string" ||
        !Number.isFinite(Date.parse(payload.updatedAt))
      ) {
        throw new Error("The tracking service returned an incomplete record.");
      }
      dataRef.current = payload as TrackData;
      setData(payload as TrackData);
      setLastFetchedAt(new Date());
    } catch (e: any) {
      const message = e.message || "Unable to load tracking.";
      if (keepCurrentSnapshot) {
        setError(`${message} Showing the last successfully loaded snapshot.`);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!trackingNumber) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (active) fetchTracking(trackingNumber);
    });
    return () => { active = false; };
  }, [trackingNumber, fetchTracking]);

  // Auto-refresh every 60s when in transit; keep the last good record if refresh fails.
  useEffect(() => {
    if (!data || data.delivered) return;
    const t = setInterval(() => trackingNumber && fetchTracking(trackingNumber, true), 60000);
    return () => clearInterval(t);
  }, [data, trackingNumber, fetchTracking]);

  const currentStep = STATUS_STEPS.findIndex((s) =>
    s.key === data?.status || (data?.status === "FAILED_DELIVERY" && s.key === "DELIVERED")
  );

  const primaryColor = data?.branding?.primaryColor || "#3b82f6";
  const currentCoordinates = getMapCoordinates(data?.current?.lat, data?.current?.lng);
  const destinationCoordinates = getMapCoordinates(data?.destination?.lat, data?.destination?.lng);

  return (
    <div className="min-h-screen bg-[#07111f] text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-4 py-4">
        <div className="mx-auto max-w-2xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BackButton to="/" />
            <Link to="/" className="text-xl font-black text-white">
              {data?.branding?.brandName || "FlowOps"}
            </Link>
          </div>
          <span className="text-xs text-white/30 font-mono">LIVE TRACKING</span>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        {/* Search */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const target = query.trim();
            if (!target) return;
            if (target === trackingNumber) fetchTracking(target, true);
            else navigate(`/track/${encodeURIComponent(target)}`);
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <label htmlFor="tracking-number" className="sr-only">Tracking number</label>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" aria-hidden="true" />
            <input
              id="tracking-number"
              value={query}
              onChange={(e) => setQueryState({ route: trackingNumber, value: e.target.value })}
              placeholder="Enter tracking number…"
              className="w-full rounded-2xl border border-white/10 bg-white/5 pl-9 pr-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-sky-400/40"
            />
          </div>
          <button
            type="submit"
            className="rounded-2xl bg-sky-500 px-5 py-3 text-sm font-black text-white hover:bg-sky-400 transition-colors"
          >
            Track
          </button>
        </form>

        {loading && (
          <div role="status" aria-live="polite" className={`flex items-center justify-center gap-3 text-white/50 ${data ? "rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm" : "py-16"}`}>
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>{data ? "Refreshing tracking data — the last loaded record remains visible." : "Loading tracking info…"}</span>
          </div>
        )}

        {error && (
          <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-rose-300 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p>{error}</p>
                {data && lastFetchedAt && <p className="mt-1 text-xs text-rose-200/70">Last successful response: {lastFetchedAt.toLocaleTimeString("en-ZA")}.</p>}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const target = data?.trackingNumber || trackingNumber || query.trim();
                if (target) fetchTracking(target, Boolean(data));
              }}
              disabled={loading || !(data?.trackingNumber || trackingNumber || query.trim())}
              className="shrink-0 rounded-lg border border-rose-200/30 px-3 py-2 text-sm font-bold hover:bg-rose-200/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Retry tracking
            </button>
          </div>
        )}

        {data && (
          <>
            {/* Status card */}
            <div className="rounded-[28px] border border-white/10 bg-white/[0.03] overflow-hidden">
              {/* ETA banner */}
              {data.etaMinutes != null && Number.isFinite(data.etaMinutes) && !data.delivered && (
                <div
                  className="px-6 py-3 text-center text-sm font-bold"
                  style={{ background: `${primaryColor}22`, borderBottom: `1px solid ${primaryColor}33` }}
                >
                  🚚 Estimated arrival: <ETACountdown key={data.etaMinutes} etaMinutes={data.etaMinutes} />
                  {data.remainingKm != null && Number.isFinite(data.remainingKm) && (
                    <span className="text-white/40 ml-2">· {data.remainingKm.toFixed(1)} km away</span>
                  )}
                </div>
              )}

              <div className="p-6">
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-white/30 mb-1">
                      Tracking
                    </p>
                    <p className="text-2xl font-black text-white">{data.trackingNumber}</p>
                  </div>
                  <span
                    className="rounded-full px-3 py-1.5 text-xs font-black"
                    style={{ background: data.delivered ? "#10b98133" : `${primaryColor}22`, color: data.delivered ? "#34d399" : primaryColor }}
                  >
                    {data.statusLabel || data.status}
                  </span>
                </div>

                {/* Timeline */}
                <div className="flex items-center gap-0 mb-6">
                  {STATUS_STEPS.map((s, i) => {
                    const done = i <= currentStep;
                    const active = i === currentStep;
                    const Icon = s.icon;
                    return (
                      <React.Fragment key={s.key}>
                        <div className="flex flex-col items-center gap-1 min-w-0">
                          <div
                            className={`h-9 w-9 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                              active ? "border-sky-400 bg-sky-500/20 scale-110" :
                              done  ? "border-emerald-400 bg-emerald-500/20" :
                                       "border-white/10 bg-white/5"
                            }`}
                          >
                            <Icon className={`h-4 w-4 ${active ? "text-sky-300" : done ? "text-emerald-300" : "text-white/20"}`} />
                          </div>
                          <span className={`text-[9px] font-bold text-center leading-tight max-w-[50px] ${
                            active ? "text-sky-300" : done ? "text-emerald-300" : "text-white/20"
                          }`}>{s.label}</span>
                        </div>
                        {i < STATUS_STEPS.length - 1 && (
                          <div className={`flex-1 h-0.5 mx-1 mb-5 rounded-full ${i < currentStep ? "bg-emerald-400/50" : "bg-white/10"}`} />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* Driver info */}
                {data.driver && (
                  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="h-10 w-10 rounded-2xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center">
                      <Truck className="h-5 w-5 text-sky-300" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">{data.driver.name}</p>
                      {data.driver.vehicleReg && (
                        <p className="text-xs text-white/40">{data.driver.vehicleReg}</p>
                      )}
                    </div>
                    <div className="ml-auto text-xs text-white/30 flex items-center gap-1">
                      <Navigation className="h-3 w-3" />
                      En route
                    </div>
                  </div>
                )}

                {/* Delivery time */}
                {data.deliveredAt && (
                  <div className="mt-4 flex items-center gap-2 text-sm text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    Delivered {new Date(data.deliveredAt).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" })}
                  </div>
                )}
              </div>
            </div>

            {/* Live map */}
            {(currentCoordinates || destinationCoordinates) ? (
              <div className="rounded-[28px] overflow-hidden border border-white/10">
                <MapContainer
                  center={getBestMapCenter(currentCoordinates, destinationCoordinates, { lat: -26.2, lng: 28.04 })}
                  zoom={12}
                  style={{ height: 280, width: "100%" }}
                  scrollWheelZoom={false}
                >
                  <OpenStreetMapLayer />
                  {currentCoordinates && (
                    <Marker position={[currentCoordinates.lat, currentCoordinates.lng]} icon={pin("#3b82f6", "🚚")}>
                      <Popup>{data.driver?.name || "Driver"}</Popup>
                    </Marker>
                  )}
                  {destinationCoordinates && (
                    <Marker position={[destinationCoordinates.lat, destinationCoordinates.lng]} icon={pin("#10b981", "📍")}>
                      <Popup>Delivery address</Popup>
                    </Marker>
                  )}
                  {currentCoordinates && destinationCoordinates && (
                    <Polyline
                      positions={[[currentCoordinates.lat, currentCoordinates.lng], [destinationCoordinates.lat, destinationCoordinates.lng]]}
                      pathOptions={{ color: primaryColor, weight: 3, dashArray: "8 6", opacity: 0.7 }}
                    />
                  )}
                </MapContainer>
              </div>
            ) : (
              <div role="status" className="flex items-center gap-3 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-200">
                <MapPin className="h-5 w-5 shrink-0" />
                <span>Map unavailable — this tracking record has no valid current or destination coordinates.</span>
              </div>
            )}

            {/* Rating prompt */}
            {data.delivered && (
              <div className="rounded-[28px] border border-amber-400/20 bg-amber-500/10 p-6 text-center">
                <div className="flex justify-center gap-1 mb-3">
                  {[1,2,3,4,5].map((s) => (
                    <Star key={s} className="h-7 w-7 text-amber-400/50" />
                  ))}
                </div>
                <p className="font-black text-white mb-1">How was your delivery?</p>
                <p className="text-sm text-white/50 mb-4">Your feedback helps us improve</p>
                {data.ratingToken ? (
                  <Link
                    to={`/rate/${data.ratingToken}`}
                    className="inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-6 py-2.5 text-sm font-black text-white hover:bg-amber-400 transition-colors"
                  >
                    <Star className="h-4 w-4" /> Rate your delivery
                  </Link>
                ) : (
                  <p className="text-xs text-white/30">Rating link sent to your email</p>
                )}
              </div>
            )}

            <p className="text-center text-xs text-white/40">
              Shipment record updated {new Date(data.updatedAt).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" })}
              {lastFetchedAt && <> · Tracking checked {lastFetchedAt.toLocaleTimeString("en-ZA", { timeZone: "Africa/Johannesburg" })}</>}
              {!data.delivered && " · Auto-refreshes every 60s"}
            </p>
          </>
        )}

        {!data && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <div className="h-16 w-16 rounded-3xl bg-sky-500/10 border border-sky-400/20 flex items-center justify-center">
              <Package className="h-8 w-8 text-sky-400/50" />
            </div>
            <div>
              <p className="font-black text-white">Track your delivery</p>
              <p className="text-sm text-white/40">Enter your tracking number above</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
