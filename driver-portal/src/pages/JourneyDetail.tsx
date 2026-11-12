import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Clock, Send, CheckCircle2, AlertOctagon, Timer, FileCheck2,
  MessageSquare, WifiOff, Circle, Loader2, ChevronDown,
} from 'lucide-react';
import {
  currentStage, loadJourneys, pendingUpdatesFor, sendJourneyUpdate,
  STAGE_LABEL, type DriverJourney, type JourneyStage, type JourneyUpdateType,
} from '../services/journeys';
import { getCachedJourneys } from '../services/offlineDB';
import { formatAgo, formatWhen, formatWindow } from '../lib/datetime';

/**
 * One journey: the stages, and the form the driver uses to tell dispatch what
 * is happening.
 *
 * The composer is deliberately the most reachable thing on the screen. A driver
 * standing at a border post is not browsing; they came here to report one thing
 * and get back in the cab.
 */

const UPDATE_TYPES: { key: JourneyUpdateType; label: string; icon: typeof AlertOctagon; tone: string }[] = [
  { key: 'DELAY_REPORT', label: 'Delay', icon: Timer, tone: 'bg-amber-500/20 text-amber-200 border-amber-400/40' },
  { key: 'INCIDENT_REPORT', label: 'Incident', icon: AlertOctagon, tone: 'bg-red-500/20 text-red-200 border-red-400/40' },
  { key: 'ETA_CHANGE', label: 'ETA change', icon: Clock, tone: 'bg-blue-500/20 text-blue-200 border-blue-400/40' },
  { key: 'PROOF_OF_DELIVERY', label: 'Delivered', icon: FileCheck2, tone: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40' },
  { key: 'GENERAL_NOTE', label: 'Note', icon: MessageSquare, tone: 'bg-white/10 text-gray-200 border-white/20' },
];

const STAGE_ICON: Record<string, string> = {
  COMPLETED: 'text-emerald-400',
  IN_TRANSIT: 'text-blue-400',
  CANCELLED: 'text-red-400',
  PLANNED: 'text-gray-500',
};

export default function JourneyDetail() {
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const location = useLocation();

  const [journey, setJourney] = useState<DriverJourney | null>(
    (location.state as DriverJourney) ?? null,
  );
  const [loading, setLoading] = useState(!location.state);
  const [notFound, setNotFound] = useState(false);

  const [type, setType] = useState<JourneyUpdateType>('DELAY_REPORT');
  const [stageId, setStageId] = useState<string>('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState<{ tone: 'sent' | 'queued'; text: string } | null>(null);
  const [queued, setQueued] = useState<{ id: string; message: string; when: string | null; type: JourneyUpdateType }[]>([]);

  /**
   * Recover the journey after a refresh.
   *
   * Router state does not survive a reload, and a driver who refreshes mid-shift
   * is common. Without this the screen would render an empty shell — or, worse,
   * silently fall back to a form that does not match the journey they are on.
   */
  useEffect(() => {
    if (journey || !id) return;
    let cancelled = false;
    (async () => {
      const cached = (await getCachedJourneys()).find((j) => j.id === id) as DriverJourney | undefined;
      if (cached && !cancelled) { setJourney(cached); setLoading(false); return; }
      // Last resort: the list endpoint doubles as a fetch-by-membership call.
      const { journeys } = await loadJourneys();
      if (cancelled) return;
      const found = journeys.find((j) => j.id === id) ?? null;
      setJourney(found);
      setNotFound(!found);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, journey]);

  const refreshQueued = useCallback(async () => {
    if (!id) return;
    const rows = await pendingUpdatesFor(id);
    setQueued(rows.map((r) => ({ id: r.clientMessageId, message: r.message, when: r.deviceOccurredAt, type: r.type })));
  }, [id]);

  useEffect(() => { void refreshQueued(); }, [refreshQueued]);

  const stages = useMemo(
    () => [...(journey?.stages ?? [])].sort((a, b) => a.stageNumber - b.stageNumber),
    [journey],
  );

  const next = journey ? currentStage(journey) : null;

  // Default the report to the stage they are actually on. A driver reporting a
  // delay at the border should not have to also remember which number it is.
  useEffect(() => {
    if (!stageId && next) setStageId(next.id);
  }, [next, stageId]);

  async function submit() {
    if (!journey) return;
    setError('');
    setFlash(null);
    if (!message.trim()) { setError('Tell dispatch what is happening.'); return; }

    setSending(true);
    try {
      const res = await sendJourneyUpdate({
        journeyId: journey.id,
        type,
        message,
        stageId: stageId || null,
      });
      setMessage('');
      setFlash(
        res.state === 'sent'
          ? { tone: 'sent', text: 'Sent to dispatch.' }
          : { tone: 'queued', text: 'Saved on this phone — it will send itself when you have signal.' },
      );
      await refreshQueued();
    } catch (err: any) {
      // Surfaced rather than swallowed: a genuine refusal (not your journey,
      // bad stage) cannot be fixed by retrying, and the driver has to know.
      setError(err?.message || 'Could not send that update.');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <Shell onBack={() => navigate('/journeys')} title="Loading…">
        <div className="text-center py-16 text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
          Loading journey…
        </div>
      </Shell>
    );
  }

  if (notFound || !journey) {
    return (
      <Shell onBack={() => navigate('/journeys')} title="Journey">
        <div className="text-center py-16 bg-white/5 border border-white/10 rounded-2xl">
          <MapPin className="w-10 h-10 text-gray-500 mx-auto mb-2" />
          <p className="text-gray-400">This journey isn't on your list.</p>
          <button onClick={() => navigate('/journeys')} className="mt-3 text-sm text-blue-300 underline">Back to my journeys</button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell onBack={() => navigate('/journeys')} title={journey.reference} subtitle={`${journey.origin ?? '—'} → ${journey.destination ?? '—'}`}>
      {/* Journey facts */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
        <Row icon={<Clock className="w-4 h-4 text-gray-400" />} label="Planned" value={formatWindow(journey.plannedStart, journey.plannedEnd)} />
        {journey.actualStart && (
          <Row icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />} label="Started" value={formatWhen(journey.actualStart)} />
        )}
        {journey.actualEnd && (
          <Row icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />} label="Ended" value={formatWhen(journey.actualEnd)} />
        )}
      </div>

      {/* Stages */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-blue-300" /> Stages
        </h2>
        {stages.length === 0 ? (
          <p className="text-sm text-gray-400">No stages have been planned for this journey yet.</p>
        ) : (
          <ol className="space-y-0">
            {stages.map((s) => (
              <li key={s.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <Circle className={`w-4 h-4 mt-0.5 fill-current ${STAGE_ICON[s.status] ?? 'text-gray-500'}`} />
                  <div className="w-px flex-1 bg-white/10 my-1" />
                </div>
                <div className="pb-4 min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-sm">{STAGE_LABEL[s.type] ?? s.type}</span>
                    <span className="text-[11px] text-gray-500">#{s.stageNumber}</span>
                    {s.status === 'IN_TRANSIT' && (
                      <span className="text-[10px] uppercase tracking-wider text-blue-200 bg-blue-500/20 border border-blue-400/30 rounded px-1.5 py-0.5">now</span>
                    )}
                    {s.status === 'CANCELLED' && (
                      <span className="text-[10px] uppercase tracking-wider text-red-200 line-through">cancelled</span>
                    )}
                  </div>
                  {s.locationName && <div className="text-sm text-gray-300 truncate">{s.locationName}</div>}
                  <div className="text-xs text-gray-500">{s.plannedAt ? `Planned ${formatWhen(s.plannedAt)}` : 'No planned time'}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Waiting to upload */}
      {queued.length > 0 && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4">
          <h2 className="font-semibold mb-2 flex items-center gap-2 text-blue-200 text-sm">
            <WifiOff className="w-4 h-4" /> Waiting to upload ({queued.length})
          </h2>
          <ul className="space-y-1.5">
            {queued.map((q) => (
              <li key={q.id} className="text-sm text-gray-300 flex items-start gap-2">
                <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-300" />
                <span className="flex-1">{q.message}</span>
                <span className="text-xs text-gray-500 shrink-0">{formatAgo(q.when)}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-500 mt-2">These are saved on your phone and send themselves when signal returns.</p>
        </div>
      )}

      {/* Composer */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Send className="w-4 h-4 text-emerald-300" /> Update dispatch
        </h2>

        <div className="flex flex-wrap gap-2">
          {UPDATE_TYPES.map((t) => {
            const Icon = t.icon;
            const on = type === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setType(t.key)}
                className={`flex items-center gap-1.5 text-xs font-semibold border rounded-xl px-3 py-2 transition ${on ? t.tone : 'border-white/10 text-gray-400 hover:text-white'}`}
              >
                <Icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            );
          })}
        </div>

        {stages.length > 0 && (
          <label className="block">
            <span className="text-xs text-gray-400">Stage (optional)</span>
            <div className="relative mt-1">
              <select
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Not tied to a stage</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id} className="text-black">
                    #{s.stageNumber} {STAGE_LABEL[s.type] ?? s.type}{s.locationName ? ` — ${s.locationName}` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </label>
        )}

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder={
            type === 'DELAY_REPORT' ? 'e.g. Held at border, queue about 2 hours'
            : type === 'INCIDENT_REPORT' ? 'e.g. Tyre burst at N1 Kroonstad, assistance on the way'
            : type === 'ETA_CHANGE' ? 'e.g. Now arriving 18:30 instead of 16:00'
            : 'What would you like dispatch to know?'
          }
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />

        {error && <div className="bg-red-500/20 border border-red-500/30 text-red-200 p-3 rounded-xl text-sm">{error}</div>}

        {flash && (
          <div className={`p-3 rounded-xl text-sm flex items-center gap-2 border ${flash.tone === 'sent' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200' : 'bg-amber-500/15 border-amber-500/30 text-amber-200'}`}>
            {flash.tone === 'sent' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <WifiOff className="w-4 h-4 shrink-0" />}
            {flash.text}
          </div>
        )}

        <button
          onClick={submit}
          disabled={sending || !message.trim()}
          className="w-full bg-gradient-to-r from-emerald-600 to-green-600 py-4 rounded-xl font-bold text-lg disabled:opacity-40 transition shadow-lg flex items-center justify-center gap-2"
        >
          <Send className="w-5 h-5" /> {sending ? 'Sending…' : 'Send update'}
        </button>
      </div>
    </Shell>
  );
}

function Shell({
  title, subtitle, onBack, children,
}: { title: string; subtitle?: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 safe-area-top safe-area-bottom text-white">
      <div className="sticky top-0 z-10 backdrop-blur-xl bg-white/5 border-b border-white/10 p-4 flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl border border-white/10 hover:bg-white/10">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <div className="font-bold truncate">{title}</div>
          {subtitle && <div className="text-xs text-gray-400 truncate">{subtitle}</div>}
        </div>
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {icon}
      <span className="text-gray-400 w-20 shrink-0">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}
