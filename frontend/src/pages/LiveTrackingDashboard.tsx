import { errorMessageOf } from "@/components/patterns/errorMessage";
import { useState, useEffect, useCallback } from 'react';
import { Radio, MapPin, Truck, Gauge, Navigation, Loader2, RefreshCw, Circle } from 'lucide-react';
import { api } from '../api/client';
import { useToast } from '../components/toast-context';

type TrackingSession = {
  id: string;
  driverId: string;
  vehicleId: string | null;
  manifestId: string | null;
  isActive: boolean;
  currentLat: number | null;
  currentLng: number | null;
  speed: number | null;
  heading: number | null;
  lastPingAt: string | null;
  distanceCovered: number | null;
  stopsCompleted: number;
  totalStops: number;
  startedAt: string;
};

const arr = <T,>(r: unknown): T[] => (Array.isArray(r) ? (r as T[]) : (((r as { data?: T[] } | null)?.data ?? []) as T[]));

export default function LiveTrackingDashboard() {
  const { showToast } = useToast();
  const [sessions, setSessions] = useState<TrackingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TrackingSession | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(() => (async () => {
    const data = arr<TrackingSession>(await api.get('/live-tracking/sessions/active'));
    setSessions(data);

  })().catch((e: unknown) => {
    showToast(errorMessageOf(e), 'error');

  }).finally(() => {
    setLoading(false);

  }), [showToast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(load, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [autoRefresh, load]);

  // Ticking clock for the "x ago" labels (Date.now() is not allowed during
  // render); 10s cadence matches the data auto-refresh below.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  const timeSince = (date: string | null) => {
    if (!date) return 'Never';
    const secs = Math.floor((now - new Date(date).getTime()) / 1000);
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return `${Math.floor(secs / 3600)}h ago`;
  };

  const speedColor = (speed: number | null) => {
    if (!speed) return 'text-white/30';
    if (speed > 80) return 'text-red-400';
    if (speed > 50) return 'text-amber-400';
    return 'text-emerald-400';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-red-500/20 to-orange-600/20 border border-red-500/30">
              <Radio className="w-6 h-6 text-red-400 animate-pulse" />
            </div>
            Live Tracking
          </h1>
          <p className="text-sm text-white/50 mt-1">Real-time GPS tracking for all active drivers</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-white/50">
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="w-3.5 h-3.5 rounded" />
            Auto-refresh (10s)
          </label>
          <button onClick={load} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 transition flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Active Driver Count */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-red-500/20 bg-gradient-to-br from-red-500/5 to-transparent p-4">
          <p className="text-xs text-red-400/70 uppercase">Active Drivers</p>
          <p className="text-2xl font-black text-white mt-1">{sessions.length}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs text-white/50">Total Stops Today</p>
          <p className="text-2xl font-black text-white mt-1">{sessions.reduce((s, x) => s + x.totalStops, 0)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs text-white/50">Stops Completed</p>
          <p className="text-2xl font-black text-emerald-400 mt-1">{sessions.reduce((s, x) => s + x.stopsCompleted, 0)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs text-white/50">Total KM Covered</p>
          <p className="text-2xl font-black text-blue-400 mt-1">{sessions.reduce((s, x) => s + (x.distanceCovered || 0), 0).toFixed(1)}</p>
        </div>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sessions List */}
        <div className="lg:col-span-2 space-y-3">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-red-400 animate-spin" /></div>
          ) : sessions.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-12 text-center">
              <Truck className="w-12 h-12 text-white/20 mx-auto mb-4" />
              <p className="text-white/50">No active tracking sessions. Drivers will appear here once they start their routes.</p>
            </div>
          ) : (
            sessions.map(session => (
              <div key={session.id} onClick={() => setSelected(session)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (() => setSelected(session))(); } }} role="button" tabIndex={0} className={`rounded-2xl border ${selected?.id === session.id ? 'border-red-500/50 bg-red-500/5' : 'border-white/10 bg-white/[0.03]'} p-5 cursor-pointer hover:border-white/20 transition`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                        <Truck className="w-5 h-5 text-emerald-400" />
                      </div>
                      <Circle className="w-3 h-3 text-emerald-400 fill-emerald-400 absolute -top-0.5 -right-0.5 animate-pulse" />
                    </div>
                    <div>
                      <p className="text-white font-bold text-sm">Driver: {session.driverId.slice(0, 10)}...</p>
                      <p className="text-xs text-white/40">Started: {new Date(session.startedAt).toLocaleTimeString()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${speedColor(session.speed)}`}>{session.speed?.toFixed(0) || '0'} km/h</p>
                    <p className="text-[10px] text-white/30">{timeSince(session.lastPingAt)}</p>
                  </div>
                </div>
                <div className="flex gap-6 mt-3 pt-3 border-t border-white/5">
                  <div className="flex items-center gap-1.5 text-xs text-white/50"><MapPin className="w-3.5 h-3.5" />{session.stopsCompleted}/{session.totalStops} stops</div>
                  <div className="flex items-center gap-1.5 text-xs text-white/50"><Navigation className="w-3.5 h-3.5" />{(session.distanceCovered || 0).toFixed(1)} km</div>
                  {session.currentLat && <div className="flex items-center gap-1.5 text-xs text-white/40"><Gauge className="w-3.5 h-3.5" />{session.currentLat.toFixed(4)}, {session.currentLng?.toFixed(4)}</div>}
                </div>
                {/* Progress bar */}
                <div className="mt-3 w-full h-1.5 rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all" style={{ width: `${session.totalStops ? (session.stopsCompleted / session.totalStops) * 100 : 0}%` }} />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Map Placeholder / Detail */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          {selected ? (
            <div className="space-y-4">
              <h3 className="text-white font-bold flex items-center gap-2"><Radio className="w-4 h-4 text-red-400 animate-pulse" /> Live Session</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-white/50">Driver</span><span className="text-white font-mono text-xs">{selected.driverId}</span></div>
                <div className="flex justify-between"><span className="text-white/50">Speed</span><span className={`font-bold ${speedColor(selected.speed)}`}>{selected.speed?.toFixed(0) || '0'} km/h</span></div>
                <div className="flex justify-between"><span className="text-white/50">Heading</span><span className="text-white">{selected.heading?.toFixed(0) || '—'}</span></div>
                <div className="flex justify-between"><span className="text-white/50">Position</span><span className="text-white text-xs">{selected.currentLat?.toFixed(5)}, {selected.currentLng?.toFixed(5)}</span></div>
                <div className="flex justify-between"><span className="text-white/50">Distance</span><span className="text-white">{(selected.distanceCovered || 0).toFixed(1)} km</span></div>
                <div className="flex justify-between"><span className="text-white/50">Progress</span><span className="text-emerald-400 font-bold">{selected.stopsCompleted}/{selected.totalStops}</span></div>
                <div className="flex justify-between"><span className="text-white/50">Last Ping</span><span className="text-white/60">{timeSince(selected.lastPingAt)}</span></div>
                <div className="flex justify-between"><span className="text-white/50">Started</span><span className="text-white/60">{new Date(selected.startedAt).toLocaleTimeString()}</span></div>
              </div>
              {/* Mini map placeholder */}
              <div className="h-40 rounded-xl bg-gradient-to-br from-[#0a1628] to-[#0d1e36] border border-white/5 flex items-center justify-center">
                <div className="text-center">
                  <MapPin className="w-8 h-8 text-red-400 mx-auto animate-bounce" />
                  <p className="text-[10px] text-white/30 mt-2">Map integration available</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-white/30">
              <Radio className="w-10 h-10 mb-3" />
              <p className="text-sm">Select a session to view live details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
