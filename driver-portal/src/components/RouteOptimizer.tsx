import { useMemo } from 'react';
import { Navigation, MapPin, Route } from 'lucide-react';

type Job = Record<string, any> & { id: string };
type LatLng = { lat: number; lng: number };

function haversine(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Nearest-neighbour ordering of stops from the driver's current position. */
function optimise(start: LatLng, stops: (Job & LatLng)[]): (Job & LatLng)[] {
  const remaining = [...stops];
  const ordered: (Job & LatLng)[] = [];
  let cur = start;
  while (remaining.length) {
    let bi = 0;
    let bd = Infinity;
    remaining.forEach((s, i) => { const d = haversine(cur, s); if (d < bd) { bd = d; bi = i; } });
    const next = remaining.splice(bi, 1)[0];
    ordered.push(next);
    cur = next;
  }
  return ordered;
}

export default function RouteOptimizer({
  jobs,
  userLocation,
}: {
  jobs: Job[];
  userLocation: { lat: number; lng: number } | null;
}) {
  const stops = useMemo(
    () => jobs
      .filter((j) => Number.isFinite(Number(j.recipientLat)) && Number.isFinite(Number(j.recipientLng)))
      .map((j): Job & LatLng => ({ ...j, lat: Number(j.recipientLat), lng: Number(j.recipientLng) })),
    [jobs],
  );

  const ordered = useMemo(
    () => (userLocation ? optimise(userLocation, stops) : stops),
    [stops, userLocation],
  );

  if (!userLocation) {
    return <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-gray-400 text-sm">Enable GPS to build an optimised route.</div>;
  }
  if (ordered.length === 0) {
    return <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-gray-400 text-sm">No mappable stops on your current jobs.</div>;
  }

  const gmapsUrl = (() => {
    const origin = `${userLocation.lat},${userLocation.lng}`;
    const dest = ordered[ordered.length - 1];
    const waypoints = ordered.slice(0, -1).map((s) => `${s.lat},${s.lng}`).join('|');
    const params = new URLSearchParams({ api: '1', origin, destination: `${dest.lat},${dest.lng}`, travelmode: 'driving' });
    if (waypoints) params.set('waypoints', waypoints);
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  })();

  return (
    <div className="space-y-3">
      <a
        href={gmapsUrl} target="_blank" rel="noreferrer"
        className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-600 to-red-600 py-3.5 font-bold shadow-lg"
      >
        <Navigation className="w-5 h-5" /> Open optimised route in Maps
      </a>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-2">
        {ordered.map((s, i) => (
          <div key={s.id} className="flex items-center gap-3 p-3 border-b border-white/5 last:border-0">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate text-sm">{s.recipientName ?? s.receiverName ?? s.trackingNumber}</div>
              <div className="flex items-center gap-1 text-xs text-gray-400 truncate"><MapPin className="w-3 h-3" />{s.recipientAddress ?? s.destination ?? ''}</div>
            </div>
            <Route className="w-4 h-4 text-gray-500 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
