import { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type Job = Record<string, any> & { id: string };

function pin(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.35)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}
const COLLECT = pin('#f59e0b');
const DELIVER = pin('#22d3ee');
const ME = pin('#3b82f6');

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  if (points.length) {
    try { map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 14 }); } catch { /* ignore */ }
  }
  return null;
}

export default function DeliveryMap({
  jobs,
  userLocation,
}: {
  jobs: Job[];
  userLocation: { lat: number; lng: number } | null;
}) {
  const located = useMemo(
    () => jobs.filter((j) => Number.isFinite(Number(j.recipientLat)) && Number.isFinite(Number(j.recipientLng))),
    [jobs],
  );
  const points: [number, number][] = useMemo(() => {
    const p = located.map((j) => [Number(j.recipientLat), Number(j.recipientLng)] as [number, number]);
    if (userLocation) p.push([userLocation.lat, userLocation.lng]);
    return p;
  }, [located, userLocation]);

  const center: [number, number] = userLocation
    ? [userLocation.lat, userLocation.lng]
    : points[0] ?? [-26.2041, 28.0473]; // Johannesburg fallback

  if (located.length === 0 && !userLocation) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-gray-400 text-sm">
        No GPS coordinates on your current jobs to map yet.
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden border border-white/10" style={{ height: 420 }}>
      <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={points} />
        {userLocation && (
          <Marker position={[userLocation.lat, userLocation.lng]} icon={ME}>
            <Popup>You are here</Popup>
          </Marker>
        )}
        {located.map((j) => (
          <Marker
            key={j.id}
            position={[Number(j.recipientLat), Number(j.recipientLng)]}
            icon={j.status === 'PENDING' ? COLLECT : DELIVER}
          >
            <Popup>
              <div style={{ fontWeight: 700 }}>{j.trackingNumber ?? j.waybillNumber ?? j.id}</div>
              <div>{j.recipientName ?? j.receiverName ?? ''}</div>
              <div style={{ color: '#475569' }}>{j.recipientAddress ?? j.destination ?? ''}</div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
