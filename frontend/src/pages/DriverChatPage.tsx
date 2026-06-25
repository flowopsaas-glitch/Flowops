import React, { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Truck, ChevronRight, Wifi, WifiOff, RefreshCw } from "lucide-react";
import api from "../api/client";

// ── helpers ──────────────────────────────────────────────────────────────────

function unwrap(r: any): any { return r?.data ?? r; }
function unwrapList(r: any): any[] { const d = r?.data ?? r; return Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []; }

function timeAgo(ts: string) {
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

type Driver = { id: string; name: string; vehicleReg?: string; status?: string; unreadCount: number; lastMessage?: string; lastMessageAt?: string };
type Msg = { id: string; senderType: string; message: string; createdAt: string; readAt?: string | null; attachmentUrl?: string };

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
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDrivers = useCallback(async () => {
    try {
      const r = await api.get("/driver-portal/dispatch/conversations");
      setDrivers(unwrapList(r));
    } catch { /* offline */ }
    setLoading(false);
  }, []);

  const loadMessages = useCallback(async (driverId: string, opts?: { initial?: boolean }) => {
    if (opts?.initial) setLoadingMsgs(true);
    try {
      const r = await api.get(`/driver-portal/dispatch/messages/${driverId}`);
      const incoming = unwrapList(r);
      setMessages(prev => {
        // Only update state if new messages arrived (avoid re-render flicker/jump)
        const prevLastId = prev[prev.length - 1]?.id;
        const incomingLastId = incoming[incoming.length - 1]?.id;
        if (prev.length === incoming.length && prevLastId === incomingLastId) return prev;
        // New messages — scroll to bottom after render
        if (!opts?.initial && incoming.length > prev.length) {
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }
        return incoming;
      });
      // Mark unread as read in the sidebar
      setDrivers(ds => ds.map(d => d.id === driverId ? { ...d, unreadCount: 0 } : d));
      if (opts?.initial) {
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      }
    } catch { /* offline */ }
    if (opts?.initial) setLoadingMsgs(false);
  }, []);

  useEffect(() => { void loadDrivers(); }, [loadDrivers]);

  useEffect(() => {
    if (!selectedId) return;
    void loadMessages(selectedId, { initial: true });
    intervalRef.current = setInterval(() => void loadMessages(selectedId), 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [selectedId, loadMessages]);

  const send = async () => {
    if (!text.trim() || !selectedId || sending) return;
    const msg = text.trim();
    setText("");
    setSending(true);
    try {
      const r = await (api as any).post(`/driver-portal/dispatch/messages/${selectedId}`, { message: msg });
      const created = unwrap(r);
      setMessages(m => [...m, created]);
      setDrivers(ds => ds.map(d => d.id === selectedId ? { ...d, lastMessage: msg, lastMessageAt: new Date().toISOString() } : d));
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch { setText(msg); }
    setSending(false);
  };

  const selectedDriver = drivers.find(d => d.id === selectedId);

  return (
    <div className="flex h-full min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.08),transparent_25%),#07111f]">

      {/* Sidebar — driver list */}
      <div className="flex flex-col w-80 shrink-0 border-r border-white/8 bg-black/20">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8">
          <MessageCircle className="h-5 w-5 text-sky-400" />
          <div>
            <div className="text-sm font-black text-white">Driver Chat</div>
            <div className="text-[10px] text-white/35">{drivers.length} drivers</div>
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
          ) : drivers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-white/20 text-xs font-bold uppercase tracking-widest">
              No active drivers
            </div>
          ) : (
            drivers.map(d => (
              <DriverItem key={d.id} d={d} selected={d.id === selectedId} onClick={() => setSelectedId(d.id)} />
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
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <MessageCircle className="h-8 w-8 text-white/10" />
                <p className="text-white/25 text-sm font-bold">No messages yet. Say hello 👋</p>
              </div>
            ) : (
              messages.map(m => (
                <div key={m.id} className={`flex ${m.senderType === "dispatch" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm ${
                    m.senderType === "dispatch"
                      ? "bg-sky-600 text-white rounded-br-sm"
                      : "bg-white/10 text-white rounded-bl-sm"
                  }`}>
                    <div>{m.message}</div>
                    <div className={`text-[10px] mt-1 ${m.senderType === "dispatch" ? "text-sky-200/60 text-right" : "text-white/30"}`}>
                      {timeAgo(m.createdAt)}{m.readAt && m.senderType === "dispatch" ? " · Read" : ""}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* Compose */}
          <div className="flex items-center gap-3 px-5 py-4 border-t border-white/8 bg-black/20 shrink-0">
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && void send()}
              placeholder={`Message ${selectedDriver?.name ?? "driver"}…`}
              className="flex-1 rounded-2xl bg-white/8 border border-white/10 px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-sky-500/40"
              disabled={sending}
            />
            <button
              onClick={() => void send()}
              disabled={!text.trim() || sending}
              className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-600 text-white hover:bg-sky-500 transition disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
