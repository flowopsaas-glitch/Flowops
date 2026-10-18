import React, { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getMapCenter } from "../../lib/currency";
import OpenStreetMapLayer from "../../components/maps/OpenStreetMapLayer";

/**
 * Rail telemetry map — device positions and the selected device's trail.
 * Self-contained (no sockets): the panel polls, the map renders what it is
 * given. Marker icons are divIcons so bundlers cannot break leaflet's default
 * asset paths (the same trick TrackingMap uses).
 */

export interface MapPoint { lat: number; lng: number }

interface Props {
  devices: Array<{ id: string; deviceCode: string; label?: string | null; lat: number; lng: number; silent?: boolean }>;
  trail?: Array<MapPoint & { recordedAt?: string }>;
  trailLabel?: string;
}

function deviceIcon(silent?: boolean) {
  return L.divIcon({
    className: "",
    html: `<div style="
      width: 16px; height: 16px;
      background: ${silent ? "#64748b" : "#10b981"};
      border: 2px solid #fff;
      border-radius: 4px;
      box-shadow: 0 0 0 2px rgba(0,0,0,0.35);
    "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -10],
  });
}

function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  }, [points, map]);
  return null;
}

export default function RailTelemetryMap({ devices, trail = [], trailLabel }: Props) {
  const centre = useMemo(() => getMapCenter("ZA"), []);
  const hasFix = devices.some((d) => Number.isFinite(d.lat) && Number.isFinite(d.lng));
  const points: MapPoint[] = [
    ...devices.filter((d) => Number.isFinite(d.lat) && Number.isFinite(d.lng)).map((d) => ({ lat: d.lat, lng: d.lng })),
    ...trail,
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-white/10" data-testid="rail-telemetry-map">
      <MapContainer
        center={hasFix || trail.length ? [trail.at(-1)?.lat ?? devices[0].lat, trail.at(-1)?.lng ?? devices[0].lng] : centre.center}
        zoom={centre.zoom}
        style={{ height: 320, width: "100%" }}
        scrollWheelZoom={false}
      >
        <OpenStreetMapLayer />
        {devices.map((d) => (
          <Marker key={d.id} position={[d.lat, d.lng]} icon={deviceIcon(d.silent)}>
            <Popup>{d.deviceCode}{d.label ? ` — ${d.label}` : ""}</Popup>
          </Marker>
        ))}
        {trail.length > 1 && (
          <Polyline positions={trail.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: "#38bdf8", weight: 3, opacity: 0.85 }} />
        )}
        {points.length > 0 && <FitBounds points={points} />}
      </MapContainer>
      {trailLabel && (
        <div className="border-t border-white/10 px-3 py-1.5 text-xs text-slate-400">
          Trail: {trailLabel} · {trail.length} point{trail.length === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}
