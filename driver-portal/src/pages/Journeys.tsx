import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, Route, MapPin, ChevronRight, Inbox, WifiOff, Clock, CheckCircle2, Truck,
} from 'lucide-react';
import {
  loadJourneys, stageProgress, currentStage, STAGE_LABEL,
  type DriverJourney, type JourneyStatus,
} from '../services/journeys';
import { formatWindow } from '../lib/datetime';
import { getStoredDriver } from '../services/auth';
import { onPendingChange } from '../services/syncEngine';

/**
 * The driver's journeys.
 *
 * Ordered so the one they are actually running is first: a driver opening this
 * screen at a border post wants the active journey, not the last completed one,
 * and making them scroll past finished work to find it is the kind of small
 * friction that turns into a missed report.
 */

const STATUS_LABEL: Record<JourneyStatus, string> = {
  PLANNED: 'Planned',
  IN_TRANSIT: 'In transit',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const STATUS_STYLE: Record<JourneyStatus, string> = {
  PLANNED: 'bg-slate-500/20 text-slate-300 border-slate-400/30',
  IN_TRANSIT: 'bg-blue-500/20 text-blue-200 border-blue-400/30',
  COMPLETED: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30',
  CANCELLED: 'bg-red-500/20 text-red-200 border-red-400/30',
};

/** Open journeys first, then by most recently created. */
const ACTIVITY: Record<JourneyStatus, number> = {
  IN_TRANSIT: 0,
  PLANNED: 1,
  COMPLETED: 2,
  CANCELLED: 3,
};

export default function Journeys() {
  const navigate = useNavigate();
  const driver = getStoredDriver();
  const [journeys, setJourneys] = useState<DriverJourney[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [pending, setPending] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await loadJourneys();
    setJourneys(res.journeys);
    setFromCache(res.fromCache);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!driver) { navigate('/login', { replace: true }); return; }
    void load();
  }, [driver, load, navigate]);

  useEffect(() => onPendingChange(setPending), []);

  const sorted = [...journeys].sort(
    (a, b) =>
      ACTIVITY[a.status] - ACTIVITY[b.status] ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const active = sorted.filter((j) => j.status === 'IN_TRANSIT').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 safe-area-top safe-area-bottom text-white">
      <div className="backdrop-blur-xl bg-white/5 border-b border-white/10 p-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="p-2 rounded-xl border border-white/10 hover:bg-white/10" title="Back to dashboard">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-lg leading-tight">My Journeys</h1>
            <p className="text-xs text-gray-400">
              {loading ? 'Loading…' : `${sorted.length} journey${sorted.length === 1 ? '' : 's'}${active ? ` · ${active} running` : ''}`}
            </p>
          </div>
          <button onClick={load} className="p-3 rounded-xl border border-white/10 hover:bg-white/10" title="Refresh">
            <RefreshCw className={`w-4 h-4 text-gray-300 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stale data is only harmless if you know it is stale. A driver acting on
          a cached stage list in a notspot needs to be told it is cached. */}
      {fromCache && (
        <div className="mx-4 mt-4 flex items-center gap-2 text-xs bg-amber-500/15 border border-amber-500/30 text-amber-200 rounded-xl p-3">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>No signal — showing your last known journeys. Updates you send are saved on this phone.</span>
        </div>
      )}

      {pending > 0 && (
        <div className="mx-4 mt-3 flex items-center gap-2 text-xs bg-blue-500/15 border border-blue-500/30 text-blue-200 rounded-xl p-3">
          <Clock className="w-4 h-4 shrink-0" />
          <span>{pending} update{pending === 1 ? '' : 's'} still to upload — they send themselves when you have signal.</span>
        </div>
      )}

      <div className="p-4 space-y-3">
        {loading && journeys.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <div className="w-8 h-8 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin mx-auto mb-2" />
            Loading journeys…
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-12 bg-white/5 border border-white/10 rounded-2xl">
            <Inbox className="w-12 h-12 text-gray-500 mx-auto mb-2" />
            <p className="text-gray-400">No journeys assigned</p>
            <p className="text-xs text-gray-500 mt-1">Dispatch assigns journeys to you — they'll appear here.</p>
          </div>
        ) : (
          sorted.map((j) => {
            const progress = stageProgress(j);
            const next = currentStage(j);
            const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

            return (
              <button
                key={j.id}
                onClick={() => navigate(`/journey/${j.id}`, { state: j })}
                className="w-full text-left bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/10 transition"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold truncate">{j.reference}</div>
                    <div className="flex items-center gap-1 text-sm text-gray-300 mt-0.5">
                      <MapPin className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                      <span className="truncate">
                        {j.origin ?? '—'} <span className="text-gray-500">→</span> {j.destination ?? '—'}
                      </span>
                    </div>
                  </div>
                  <span className={`shrink-0 text-[10px] uppercase tracking-wider font-semibold border rounded-md px-2 py-0.5 ${STATUS_STYLE[j.status]}`}>
                    {STATUS_LABEL[j.status] ?? j.status}
                  </span>
                  <ChevronRight className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" />
                </div>

                <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
                  <Route className="w-3.5 h-3.5 shrink-0" />
                  {progress.total > 0 ? (
                    <>
                      <span>{progress.done} of {progress.total} stages done</span>
                      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </>
                  ) : (
                    <span>No stages planned yet</span>
                  )}
                </div>

                {next && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-blue-200">
                    <Truck className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      {next.status === 'IN_TRANSIT' ? 'At' : 'Next'}: {STAGE_LABEL[next.type] ?? next.type}
                      {next.locationName ? ` · ${next.locationName}` : ''}
                    </span>
                  </div>
                )}

                <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatWindow(j.plannedStart, j.plannedEnd)}
                  </span>
                  {progress.done === progress.total && progress.total > 0 && (
                    <span className="flex items-center gap-1 text-emerald-300">
                      <CheckCircle2 className="w-3 h-3" /> Complete
                    </span>
                  )}
                </div>

              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
