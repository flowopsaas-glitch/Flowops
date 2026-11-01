import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send } from 'lucide-react';
import api from '../services/api';
import {
  queueMessage,
  getPending,
  getRejected,
  requestFollowUp,
  resolveFollowUp,
  flush,
  onChange,
  type QueuedMessage,
} from '../services/chatOutbox';

type Msg = { id: string; message: string; senderType: string; createdAt: string; deliveredAt?: string | null; readAt?: string | null };
type SendStatus = 'offline' | 'unconfirmed' | 'rejected' | null;
type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

export default function Chat() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [journeyStageText, setJourneyStageText] = useState('');
  // Client-side journey-stage tag for messages the server has not yet
  // acknowledged (offline queue or optimistic online send).
  const [messageJourneyStage, setMessageJourneyStage] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [sendStatus, setSendStatus] = useState<SendStatus>(null);
  const [online, setOnline] = useState(navigator.onLine);
  // clientMessageId is the idempotency key. It is kept while a send is
  // unconfirmed so a retry can safely repeat the same message without
  // creating a duplicate if the first request actually reached the server.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingBody, setPendingBody] = useState<string>('');
  // Per-message delivery state for driver-sent messages. The server is the
  // source of truth for deliveredAt/readAt; this only tracks optimistic local
  // state while a send is in flight.
  const [messageStatus, setMessageStatus] = useState<Record<string, MessageStatus>>({});
  // Local outbox queue: messages composed while offline are queued here and
  // replayed when connectivity returns. Nothing is silently discarded.
  const [localQueue, setLocalQueue] = useState<QueuedMessage[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const loadSequence = useRef(0);
  const flushRef = useRef<(() => void) | null>(null);

  const load = async () => {
    const sequence = ++loadSequence.current;
    try {
      const data = await api.get<Msg[]>('/driver-portal/chat/messages');
      if (sequence !== loadSequence.current) return;
      if (!Array.isArray(data)) throw new Error('Invalid chat response');
      setMessages(data);
      setLoadError(false);
      setHasLoaded(true);
      // Reconcile per-message status from the server's deliveredAt/readAt.
      setMessageStatus((prev) => {
        const next: Record<string, MessageStatus> = {};
        for (const m of data) {
          if (m.senderType !== 'driver') continue;
          if (m.readAt) next[m.id] = 'read';
          else if (m.deliveredAt) next[m.id] = 'delivered';
          else next[m.id] = prev[m.id] ?? 'sent';
        }
        return next;
      });
      // Tell the server the driver's device has received dispatch messages.
      const toDeliver = data.filter((m) => m.senderType === 'dispatch' && !m.deliveredAt).map((m) => m.id);
      if (toDeliver.length) {
        api.post('/driver-portal/chat/delivered', { messageIds: toDeliver }).catch(() => undefined);
      }
    } catch {
      if (sequence !== loadSequence.current) return;
      setLoadError(true); // Keep last known messages, but label them as potentially stale.
    }
  };

  useEffect(() => {
    void load();
    api.post('/driver-portal/chat/read', {}).catch(() => undefined);
    const t = setInterval(load, 5000);
    return () => { clearInterval(t); loadSequence.current++; };
  }, []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Replay any queued messages when the device is back online.
  useEffect(() => {
    const refresh = () => setLocalQueue(getPending());
    refresh();
    const unsub = onChange(() => refresh());

    const maybeFlush = async () => {
      if (!online) return;
      await flush(async (message, key) =>
        api.post('/driver-portal/chat/send', { message, clientMessageId: key }),
      );
      refresh();
    };
    maybeFlush();
    flushRef.current = maybeFlush;
    return () => { unsub(); flushRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const statusFor = (m: Msg): MessageStatus => {
    // Do not override an in-flight optimistic send with stale server data.
    if (messageStatus[m.id] === 'sending') return 'sending';
    if (m.readAt) return 'read';
    if (m.deliveredAt) return 'delivered';
    return 'sent';
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    if (!navigator.onLine) {
      // Offline: write locally first (optimistic), replay when reconnected.
      // Nothing is silently discarded — the queue and draft survive a refresh,
      // and a reconnect triggers an automatic flush.
      const key = crypto.randomUUID();
      const stage = journeyStageText.trim() || undefined;
      const queued = queueMessage(body, key, { journeyStageId: stage });
      setMessageJourneyStage((prev) => ({ ...prev, [key]: stage ?? '' }));
      setJourneyStageText('');
      setPendingId(key);
      setPendingBody(body);
      setSending(true);
      setSendStatus(null);
      setMessageStatus((prev) => ({ ...prev, [key]: 'sending' }));
      setText('');
      setSending(false);
      return;
    }
    const key = pendingId && pendingBody === body ? pendingId : crypto.randomUUID();
    const msg = body;
    setPendingId(key);
    setPendingBody(body);
    setSending(true);
    setSendStatus(null);
    setMessageStatus((prev) => ({ ...prev, [key]: 'sending' }));
    try {
      await api.post('/driver-portal/chat/send', { message: msg, clientMessageId: key });
      setText('');
      const stage = journeyStageText.trim();
      setJourneyStageText('');
      setPendingId(null);
      setPendingBody('');
      if (stage) setMessageJourneyStage((prev) => ({ ...prev, [key]: stage }));
      setMessageStatus((prev) => ({ ...prev, [key]: 'sent' }));
      await load();
    } catch (error) {
      // The server now has an idempotency contract: retrying the same key is
      // safe. A 4xx other than 408 means the server rejected this message, so
      // a new draft may use a new key. Anything else (5xx, 408, no response)
      // leaves delivery genuinely unconfirmed — keep the draft and the key.
      const status = (error as { status?: number }).status;
      const rejected = status && status >= 400 && status < 500 && status !== 408;
      setSendStatus(rejected ? 'rejected' : 'unconfirmed');
      if (rejected) {
        setPendingId(null);
        setPendingBody('');
      }
    } finally {
      setSending(false);
    }
  };

  // Unified thread: server messages plus optimistic local outbox items.
  const localThread = localQueue.map((q) => ({
    id: q.id,
    senderType: "driver" as const,
    message: q.message,
    createdAt: new Date(q.createdAt).toISOString(),
    deliveredAt: null as string | null,
    readAt: null as string | null,
  }));
  const thread = [...messages, ...localThread];

  const queueItemFor = (id: string) => localQueue.find((q) => q.id === id);
  const followUpLabel = (q: QueuedMessage) =>
    q.resolvedAt ? "Follow-up resolved" : q.followUp ? "Follow-up requested" : null;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white safe-area-top safe-area-bottom">
      <div className="sticky top-0 z-10 backdrop-blur-xl bg-white/5 border-b border-white/10 p-4 flex items-center gap-3">
        <button onClick={() => navigate('/dashboard')} className="p-2 rounded-xl border border-white/10 hover:bg-white/10" aria-label="Back to dashboard">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="font-bold">Dispatch Chat</div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <p className="text-xs text-gray-300">For immediate danger, contact local emergency services when safe. Do not use this app while driving.</p>
        {!hasLoaded && !loadError && <p role="status" className="text-gray-300 text-sm">Loading messages…</p>}
        {loadError && <p role="status" className="text-amber-300 text-sm">Unable to refresh messages. Previously loaded messages may be out of date.</p>}
        {messages.length === 0 && localQueue.length === 0 && hasLoaded && !loadError ? (
          <p className="text-center text-gray-400 mt-8 text-sm">No messages yet. Say hello to dispatch 👋</p>
        ) : (
          thread.map((m) => {
            const mine = m.senderType === 'driver';
            const queued = queueItemFor(m.id);
            const status = mine ? statusFor(m) : null;
            const delivered = status === 'delivered' || status === 'read';
            const isPending = queued?.state === 'PENDING';
            const isRejected = queued?.state === 'REJECTED';
            const deviceTime = queued ? new Date(queued.createdAt).toLocaleTimeString('en-ZA', {
              hour: '2-digit',
              minute: '2-digit',
            }) : null;
            const showTime = deviceTime ?? new Date(m.createdAt).toLocaleTimeString('en-ZA', {
              hour: '2-digit',
              minute: '2-digit',
            });
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${mine ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white' : 'bg-white/10 border border-white/10 text-gray-100'}`}>
                  <div>{m.message}</div>
                  {isRejected && queued?.rejection && (
                    <p className="text-[9px] text-red-300/80 mt-1 font-bold">
                      NOT CONFIRMED — {queued.rejection.message}
                    </p>
                  )}
                  {queued && followUpLabel(queued) && (
                    <p className="text-[9px] text-blue-300 mt-1 font-bold">{followUpLabel(queued)}</p>
                  )}
                  <div className="mt-1 flex items-center gap-1 text-[10px]">
                    <span className={mine ? 'text-blue-100/70' : 'text-gray-400'}>
                      {showTime}
                      {isPending && <span className="text-blue-200/40 ml-1">(device time)</span>}
                    </span>
                    {mine && (
                      <span className="flex items-center gap-1">
                        {isPending ? (
                          <>
                            <span className="animate-pulse text-blue-200/50" aria-hidden="true">✔</span>
                            <span className="animate-pulse text-blue-200/50" aria-hidden="true">…</span>
                            <span className="text-[9px] text-blue-200/40">PENDING SYNC</span>
                          </>
                        ) : (
                          <>
                            <span className={status === 'sending' ? 'animate-pulse text-blue-200/50' : 'text-blue-200/60'} aria-hidden="true">
                              ✔
                            </span>
                            {delivered && (
                              <span className={status === 'read' ? 'text-blue-400' : 'text-blue-300'} aria-hidden="true">
                                ✔
                              </span>
                            )}
                            {status === 'sending' && <span className="animate-pulse text-blue-200/50" aria-hidden="true">…</span>}
                          </>
                        )}
                        {queued && (
                          <span className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                const cur = queueItemFor(m.id);
                                if (!cur) return;
                                if (cur.followUp) resolveFollowUp(m.id);
                                else requestFollowUp(m.id, 'driver');
                              }}
                              aria-label={queued.followUp ? 'Resolve follow-up' : 'Request follow-up'}
                              className="h-5 w-5 rounded-full border border-white/20 text-[9px] text-white/60 flex items-center justify-center hover:bg-white/10 disabled:opacity-50"
                              disabled={queued.resolvedAt !== undefined}
                            >
                              {queued.followUp ? '✓' : '↻'}
                            </button>
                            {queued.journeyStageId && (
                              <span className="text-[9px] text-blue-300/70 flex items-center gap-0.5">
                                <span aria-hidden="true">📍</span>
                                {queued.journeyStageId}
                              </span>
                            )}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <div className="px-3 pt-3 border-t border-white/10 bg-white/5">
        <p className="text-xs text-gray-300 mb-2">Quick start — add details only when safe</p>
        <div className="flex flex-wrap gap-2">
          {['Delay', 'Road issue', 'Vehicle issue', 'Safety concern'].map((label) => (
            <button key={label} type="button" disabled={sending} onClick={() => setText((current) => current.trim() ? current : `${label}: `)} className="px-3 py-2 rounded-xl border border-white/20 text-xs hover:bg-white/10 disabled:opacity-50">{label}</button>
          ))}
        </div>
        {!online && <p role="status" className="text-amber-300 text-xs mt-2">Offline. Your message is queued and will send automatically when you're back online.</p>}
        {sendStatus === 'unconfirmed' && <p role="alert" className="text-amber-300 text-sm mt-2">Delivery unconfirmed. Check the conversation before resending: dispatch may already have received it.</p>}
        {sendStatus === 'rejected' && <p role="alert" className="text-red-300 text-sm mt-2">The server rejected this message. Your draft is still here.</p>}
        <input
          value={journeyStageText}
          onChange={(e) => setJourneyStageText(e.target.value)}
          placeholder="Journey stage (optional, e.g. border-crossing-3)"
          aria-label="Journey stage"
          className="w-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-blue-500 mb-2"
        />
      </div>
      <form onSubmit={send} className="p-3 bg-white/5 flex items-center gap-2 safe-area-bottom">
        <input
          value={text} onChange={(e) => setText(e.target.value)} disabled={sending} placeholder="Message dispatch…" aria-label="Message dispatch"
          className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-3 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button type="submit" aria-label="Send message" disabled={sending || !text.trim()} className="p-3 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 disabled:opacity-50">
          <Send className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
}
