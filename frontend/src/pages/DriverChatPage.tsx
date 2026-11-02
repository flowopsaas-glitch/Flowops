import React, { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Truck, RefreshCw } from "lucide-react";
import api from "../api/client";
import {
  queueMessage,
  getPending,
  getRejected,
  requestFollowUp,
  resolveFollowUp,
  flush,
  onChange,
  type QueuedMessage,
} from "../services/chatOutbox";

// ── helpers ──────────────────────────────────────────────────────────────────

function unwrap<T>(r: unknown): T { return ((r as { data?: T } | null)?.data ?? r) as T; }
function unwrapList<T>(r: unknown): T[] { const d = (r as { data?: unknown } | null)?.data ?? r; if (Array.isArray(d)) return d as T[]; const inner = (d as { data?: unknown } | null)?.data; return Array.isArray(inner) ? (inner as T[]) : []; }

function timeAgo(ts: string) {
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

type Driver = { id: string; name: string; vehicleReg?: string; status?: string; unreadCount: number; lastMessage?: string; lastMessageAt?: string };
export type Msg = { id: string; senderType: string; message: string; createdAt: string; readAt?: string | null; deliveredAt?: string | null; attachmentUrl?: string };
type SendStatus = 'offline' | 'unconfirmed' | 'rejected' | null;
type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

// ── sub-components ────────────────────────────────────────────────────────────

function DriverItem({ d, selected, onClick }: { d: Driver; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-4 text-left transition border-b border-white/5 ${selected ? "bg-white/10" : "hover:bg-white/5"}`}
    >
      <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/10 border border-white/10">
        <Truck className="h-5 w-5 text-white/60" />
        {d.unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center px-1">
            {d.unreadCount}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-white text-sm truncate">{d.name}</div>
        <div className="text-[11px] text-white/40 truncate">{d.lastMessage ?? "No messages yet"}</div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        {d.lastMessageAt && <div className="text-[10px] text-white/25">{timeAgo(d.lastMessageAt)}</div>}
        <div className={`h-2 w-2 rounded-full ${d.status === "AVAILABLE" ? "bg-emerald-400" : d.status === "ON_ROUTE" ? "bg-amber-400" : "bg-white/20"}`} />
      </div>
    </button>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function DriverChatPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [journeyStageText, setJourneyStageText] = useState("");
  // Client-side journey-stage tag for messages the server has not yet
  // acknowledged (offline queue or optimistic online send). Displayed beside
  // the message so the dispatcher sees which stage a report relates to.
  const [messageJourneyStage, setMessageJourneyStage] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [driversError, setDriversError] = useState(false);
  const [driversLoaded, setDriversLoaded] = useState(false);
  const [messagesError, setMessagesError] = useState(false);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [sendStatus, setSendStatus] = useState<SendStatus>(null);
  const [online, setOnline] = useState(navigator.onLine);
  // clientMessageId is the idempotency key. Kept while a send is unconfirmed so
  // a retry can safely repeat the same message without duplicating it.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingBody, setPendingBody] = useState<string>("");
  // Per-message delivery state for dispatch-sent messages. The server's
  // deliveredAt/readAt is the source of truth; this only tracks optimistic local
  // state while a send is in flight.
  const [messageStatus, setMessageStatus] = useState<Record<string, MessageStatus>>({});
  // Local outbox queue for the selected driver: messages composed while offline
  // are queued here and replayed when connectivity returns. Nothing is silently
  // dropped. Kept separate from the server `messages` list so the two never
  // overwrite each other.
  const [localQueue, setLocalQueue] = useState<QueuedMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flushRef = useRef<(() => void) | null>(null);
  const driversSequence = useRef(0);
  const msgsSequence = useRef(0);

  const loadDrivers = useCallback(() => (async () => {
    const sequence = ++driversSequence.current;
    try {
      const r = await api.get("/driver-portal/dispatch/conversations");
      if (sequence !== driversSequence.current) return;
      setDrivers(unwrapList<Driver>(r));
      setDriversError(false);
      setDriversLoaded(true);
    } catch {
      if (sequence !== driversSequence.current) return;
      setDriversError(true); // Keep last known list, but label it as potentially stale.
    } finally {
      setLoading(false);
    }
  }), []);

  const loadMessages = useCallback(async (driverId: string, opts?: { initial?: boolean }) => {
    const sequence = ++msgsSequence.current;
    try {
      const r = await api.get(`/driver-portal/dispatch/messages/${driverId}`);
      if (sequence !== msgsSequence.current) return;
      const incoming = unwrapList<Msg>(r);
      setMessages(prev => {
        const prevLastId = prev[prev.length - 1]?.id;
        const incomingLastId = incoming[incoming.length - 1]?.id;
        if (prev.length === incoming.length && prevLastId === incomingLastId) return prev;
        if (!opts?.initial && incoming.length > prev.length) {
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }
        return incoming;
      });
      setDrivers(ds => ds.map(d => d.id === driverId ? { ...d, unreadCount: 0 } : d));
      setMessagesError(false);
      setMessagesLoaded(true);
      // Reconcile per-message status from the server's deliveredAt/readAt.
      setMessageStatus((prev) => {
        const next: Record<string, MessageStatus> = {};
        for (const m of incoming) {
          if (m.senderType !== 'dispatch') continue;
          if (m.readAt) next[m.id] = 'read';
          else if (m.deliveredAt) next[m.id] = 'delivered';
          else next[m.id] = prev[m.id] ?? 'sent';
        }
        return next;
      });
      // Tell the server the dispatch device has received driver messages.
      const toDeliver = incoming.filter((m) => m.senderType === 'driver' && !m.deliveredAt).map((m) => m.id);
      if (toDeliver.length) {
        api.post('/driver-portal/chat/delivered', { messageIds: toDeliver }).catch(() => undefined);
      }
      if (opts?.initial) {
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      }
    } catch {
      if (sequence !== msgsSequence.current) return;
      setMessagesError(true);
    } finally {
      if (opts?.initial) setLoadingMsgs(false);
    }
  }, []);

  useEffect(() => { void loadDrivers(); }, [loadDrivers]);

  useEffect(() => {
    if (!selectedId) return;
    void loadMessages(selectedId, { initial: true });
    intervalRef.current = setInterval(() => void loadMessages(selectedId), 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [selectedId, loadMessages]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Subscribe to the outbox for the selected driver and replay any pending
  // messages whenever the device is online (reconnect, foreground, heartbeat).
  useEffect(() => {
    const refresh = () => {
      if (!selectedId) {
        setLocalQueue([]);
        return;
      }
      const pending = getPending(selectedId);
      const rejected = getRejected(selectedId);
      const all = [...pending, ...rejected].sort((a, b) => b.seq - a.seq);
      setLocalQueue(all);
      // Reconcile optimistic per-message status with the queue's source of truth.
      setMessageStatus((prev) => {
        const next: Record<string, MessageStatus> = { ...prev };
        for (const m of all) {
          if (m.state === 'SENT') next[m.id] = 'sent';
          else if (m.state === 'PENDING') next[m.id] = 'sending';
          else next[m.id] = 'sent'; // REJECTED — the draft stays, refusal shown inline
        }
        return next;
      });
    };
    refresh();
    const unsub = onChange(() => refresh());

    // Drain the queue when connectivity returns or the driver changes.
    const maybeFlush = async () => {
      if (!selectedId || !online) return;
      await flush(selectedId, (message, key) =>
        api.post(`/driver-portal/dispatch/messages/${selectedId}`, { message, clientMessageId: key }),
      );
      refresh();
    };
    maybeFlush();
    flushRef.current = maybeFlush;
    return () => { unsub(); flushRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, online]);

  const statusFor = (m: Msg): MessageStatus => {
    if (messageStatus[m.id] === 'sending') return 'sending';
    if (m.readAt) return 'read';
    if (m.deliveredAt) return 'delivered';
    return 'sent';
  };

  const send = async () => {
    if (!text.trim() || !selectedId || sending) return;
    if (!online) {
      // Offline: write locally first (optimistic), replay when reconnected.
      // Nothing is silently discarded — the driver's draft and the queue both
      // survive a refresh, and a reconnect triggers an automatic flush.
      const key = crypto.randomUUID();
      const stage = journeyStageText.trim() || undefined;
      const queued = queueMessage(selectedId, text.trim(), key, {
        journeyStageId: stage,
      });
      setMessageJourneyStage((prev) => ({ ...prev, [key]: stage ?? "" }));
      setJourneyStageText("");
      setSending(true);
      setSendStatus(null);
      setMessageStatus((prev) => ({ ...prev, [key]: 'sending' }));
      setText("");
      setSending(false);
      setDrivers((ds) =>
        ds.map((d) =>
          d.id === selectedId ? { ...d, lastMessage: text.trim(), lastMessageAt: new Date().toISOString() } : d,
        ),
      );
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      return;
    }
    const msg = text.trim();
    // Reuse the existing idempotency key when retrying the same draft; a
    // changed draft gets a new key so an unconfirmed older message is not
    // silently replaced or duplicated.
    const key = pendingId && pendingBody === msg ? pendingId : crypto.randomUUID();
    setPendingId(key);
    setPendingBody(msg);
    setSending(true);
    setSendStatus(null);
    setMessageStatus((prev) => ({ ...prev, [key]: 'sending' }));
    try {
      const r = await api.post(`/driver-portal/dispatch/messages/${selectedId}`, { message: msg, clientMessageId: key });
      const created = unwrap<Msg>(r);
      setText("");
      setJourneyStageText("");
      setPendingId(null);
      setPendingBody("");
      const stage = journeyStageText.trim();
      if (stage) setMessageJourneyStage((prev) => ({ ...prev, [key]: stage }));
      setMessageStatus((prev) => ({ ...prev, [key]: 'sent' }));
      setMessages(m => [...m, created]);
      setDrivers(ds => ds.map(d => d.id === selectedId ? { ...d, lastMessage: msg, lastMessageAt: new Date().toISOString() } : d));
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (error) {
      // The server now has an idempotency contract: retrying the same key is
      // safe. A 4xx other than 408 means the server rejected this message.
      const status = (error as { status?: number }).status;
      const rejected = status && status >= 400 && status < 500 && status !== 408;
      setSendStatus(rejected ? 'rejected' : 'unconfirmed');
      if (rejected) {
        setPendingId(null);
        setPendingBody("");
        setMessageStatus((prev) => ({ ...prev, [key]: 'sent' }));
      }
    } finally {
      setSending(false);
    }
  };

  const selectedDriver = drivers.find(d => d.id === selectedId);

  // Unified thread: server messages plus optimistic local outbox items.
  // Outbox items render with device time until the server acknowledges them,
  // after which they leave the queue and the server's confirmed version arrives
  // via polling (no silent overwrite, no duplicates).
  const localThread = localQueue.map((q) => ({
    id: q.id,
    senderType: "dispatch" as const,
    message: q.message,
    createdAt: new Date(q.createdAt).toISOString(),
    deliveredAt: null as string | null,
    readAt: null as string | null,
  }));
  const thread = [...messages, ...localThread];

  const queueItemFor = (id: string) => localQueue.find((q) => q.id === id);
  const pendingCountForSelected = () =>
    localQueue.filter((q) => q.state === "PENDING").length;

  const followUpLabel = (q: QueuedMessage) =>
    q.resolvedAt ? "Follow-up resolved" : q.followUp ? "Follow-up requested" : null;

  return (
    <div className="flex h-full min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.08),transparent_25%),#07111f]">

      {/* Sidebar — driver list */}
      <div className="flex flex-col w-80 shrink-0 border-r border-white/8 bg-black/20">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8">
          <MessageCircle className="h-5 w-5 text-sky-400" />
          <div>
          <div className="text-sm font-black text-white">Driver Chat</div>
          <div className="text-[10px] text-white/35">{drivers.length} drivers</div>
          {selectedId && pendingCountForSelected() > 0 && (
            <span className="text-[10px] text-amber-400 font-bold">{pendingCountForSelected()} queued</span>
          )}
          </div>
          <button onClick={() => void loadDrivers()} className="ml-auto text-white/30 hover:text-white/70">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 mx-4 my-2 rounded-xl bg-white/5 animate-pulse" />
            ))
          ) : driversError && !driversLoaded ? (
            <div className="flex flex-col items-center justify-center h-40 text-white/20 text-xs font-bold uppercase tracking-widest" role="alert">
              <p className="text-amber-300">Unable to refresh drivers</p>
              <p className="text-white/35 mt-1">Previously loaded drivers may be out of date.</p>
              <button onClick={() => { setDriversError(false); void loadDrivers(); }} className="mt-3 rounded-xl border border-white/20 bg-white/5 px-3 py-1 text-[10px] font-bold text-white hover:bg-white/10">
                Retry
              </button>
            </div>
          ) : drivers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-white/20 text-xs font-bold uppercase tracking-widest">
              {driversLoaded ? <p role="status">No active drivers</p> : <p role="status">Loading drivers…</p>}
            </div>
          ) : (
            drivers.map(d => (
              <DriverItem key={d.id} d={d} selected={d.id === selectedId} onClick={() => { if (d.id !== selectedId) { setLoadingMsgs(true); setSelectedId(d.id); } }} />
            ))
          )}
        </div>
      </div>

      {/* Main chat area */}
      {!selectedId ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-white/20">
          <MessageCircle className="h-16 w-16" />
          <p className="text-lg font-black uppercase tracking-widest">Select a driver to chat</p>
          <p className="text-sm">Messages are delivered to the driver's portal in real-time</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Chat header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8 bg-black/20 shrink-0">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-sky-500/15 border border-sky-500/20">
              <Truck className="h-5 w-5 text-sky-400" />
            </div>
            <div>
              <div className="text-sm font-black text-white">{selectedDriver?.name}</div>
              <div className="flex items-center gap-1.5 text-[11px] text-white/40">
                <div className={`h-1.5 w-1.5 rounded-full ${selectedDriver?.status === "AVAILABLE" ? "bg-emerald-400" : selectedDriver?.status === "ON_ROUTE" ? "bg-amber-400" : "bg-white/20"}`} />
                {selectedDriver?.status ?? "Unknown"} · {selectedDriver?.vehicleReg ?? "—"}
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {loadingMsgs ? (
              <div className="flex items-center justify-center h-32 text-white/25 text-sm">Loading messages...</div>
            ) : messagesError && !messagesLoaded ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2 text-white/25 text-sm" role="alert">
                <p>Unable to refresh messages</p>
                <p className="text-white/40 mt-1">Previously loaded messages may be out of date.</p>
              </div>
            ) : messages.length === 0 && localQueue.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <MessageCircle className="h-8 w-8 text-white/10" />
                <p className="text-white/25 text-sm font-bold">
                  {messagesLoaded ? "No messages yet. Say hello 👋" : "Loading messages…"}
                </p>
              </div>
            ) : (
              thread.map(m => {
                const mine = m.senderType === "dispatch";
                const queued = queueItemFor(m.id);
                const status = mine ? statusFor(m) : null;
                const delivered = status === "delivered" || status === "read";
                const isPending = queued?.state === "PENDING";
                const isRejected = queued?.state === "REJECTED";
                const deviceTime = queued ? new Date(queued.createdAt).toLocaleTimeString("en-ZA", {
                  hour: "2-digit",
                  minute: "2-digit",
                }) : null;
                // Local time for an optimistic outbox item; server time otherwise.
                const showTime = deviceTime ?? timeAgo(m.createdAt);
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm ${
                      mine ? "bg-sky-600 text-white rounded-br-sm" : "bg-white/10 text-white rounded-bl-sm"
                    }`}>
                      <div>{m.message}</div>
                      {isRejected && queued?.rejection && (
                        <p className="text-[9px] text-rose-300/80 mt-1 font-bold">
                          NOT CONFIRMED — {queued.rejection.message}
                        </p>
                      )}
                      {queued && followUpLabel(queued) && (
                        <p className="text-[9px] text-sky-300 mt-1 font-bold">{followUpLabel(queued)}</p>
                      )}
                      <div className="mt-1 flex items-center gap-1 text-[10px]">
                        <span className={mine ? "text-sky-200/60 text-right" : "text-white/30"}>
                          {showTime}
                          {isPending && <span className="text-sky-200/40 ml-1">(device time)</span>}
                        </span>
                        {mine && (
                          <span className="flex items-center gap-1">
                            {isPending ? (
                              <>
                                <span className="animate-pulse text-sky-200/50" aria-hidden="true">✔</span>
                                <span className="animate-pulse text-sky-200/50" aria-hidden="true">…</span>
                                <span className="text-[9px] text-sky-200/40">PENDING SYNC</span>
                              </>
                            ) : (
                              <>
                                <span className={status === "sending" ? "animate-pulse text-sky-200/50" : "text-sky-200/60"} aria-hidden="true">
                                  ✔
                                </span>
                                {delivered && (
                                  <span className={status === "read" ? "text-sky-400" : "text-sky-300"} aria-hidden="true">
                                    ✔
                                  </span>
                                )}
                                {status === "sending" && <span className="animate-pulse text-sky-200/50" aria-hidden="true">…</span>}
                              </>
                            )}
                            {queued && (
                              <span className="flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    const cur = queueItemFor(m.id);
                                    if (!cur) return;
                                    if (cur.followUp) resolveFollowUp(m.id);
                                    else requestFollowUp(m.id, "dispatcher");
                                  }}
                                  aria-label={queued.followUp ? "Resolve follow-up" : "Request follow-up"}
                                  className="h-5 w-5 rounded-full border border-white/20 text-[9px] text-white/60 flex items-center justify-center hover:bg-white/10 disabled:opacity-50"
                                  disabled={queued.resolvedAt !== undefined}
                                >
                                  {queued.followUp ? "✓" : "↻"}
                                </button>
                                {(() => {
                                  const stage = queued?.journeyStageId ?? messageJourneyStage[m.id];
                                  return stage ? (
                                    <span className="text-[9px] text-sky-300/70 flex items-center gap-0.5">
                                      <span aria-hidden="true">📍</span>
                                      {stage}
                                    </span>
                                  ) : null;
                                })()}
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
            <div ref={bottomRef} />
          </div>

          {/* Compose */}
          <div className="px-5 pt-4 border-t border-white/8 bg-black/20 shrink-0">
            {!online && selectedId && (
              <p role="status" className="text-amber-300 text-xs mb-2">
                Offline. Your message is queued and will send automatically when you're back online.
              </p>
            )}
            <input
              value={journeyStageText}
              onChange={(e) => setJourneyStageText(e.target.value)}
              placeholder="Journey stage (optional, e.g. border-crossing-3)"
              aria-label="Journey stage"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-sky-500/40 mb-2"
            />
            {sendStatus === "offline" && (
              <p role="alert" className="text-amber-300 text-xs mb-2">Not sent: you are offline. Reconnect before sending.</p>
            )}
            {sendStatus === "unconfirmed" && (
              <p role="alert" className="text-amber-300 text-xs mb-2">
                Delivery unconfirmed. Check the thread before resending: the driver may already have received it.
              </p>
            )}
            {sendStatus === "rejected" && (
              <p role="alert" className="text-rose-300 text-xs mb-2">The server rejected this message. Your draft is still here.</p>
            )}
            <div className="flex items-center gap-3">
              <input
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && void send()}
                placeholder={`Message ${selectedDriver?.name ?? "driver"}…`}
                aria-label={`Message ${selectedDriver?.name ?? "driver"}`}
                className="flex-1 rounded-2xl bg-white/8 border border-white/10 px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-sky-500/40"
                disabled={sending}
              />
              <button
                onClick={() => void send()}
                disabled={!text.trim() || sending}
                aria-label="Send message"
                className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-600 text-white hover:bg-sky-500 transition disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
