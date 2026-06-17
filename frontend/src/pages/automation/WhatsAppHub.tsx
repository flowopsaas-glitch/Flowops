import React, { useState, useEffect, useRef } from "react";
import { Send, Zap, MessageSquare, Phone, Plus, Save, ExternalLink, Loader2 } from "lucide-react";
import { api } from "../../api/client";
import { useToast } from "../../components/ui/use-toast";

type Thread = {
  id: string;
  phone: string;
  name?: string | null;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  unreadCount?: number;
};

type Message = {
  id: string;
  content: string;
  direction: "INBOUND" | "OUTBOUND";
  status?: string;
  sentAt?: string;
};

function initialsFor(t: Thread) {
  const base = (t.name || t.phone || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

export default function WhatsAppHub() {
  const { toast } = useToast();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");

  // Click-to-chat configuration (the tenant's own WhatsApp mobile number).
  const [companyNumber, setCompanyNumber] = useState("");
  const [numberDraft, setNumberDraft] = useState("");
  const [savingNumber, setSavingNumber] = useState(false);

  // Start a brand-new conversation with any number (no existing thread needed).
  const [newChatNumber, setNewChatNumber] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchSidebar = async () => {
    try {
      const res = await api.get("/whatsapp/threads");
      const list: Thread[] = res.data ?? [];
      setThreads(list);
      if (list.length > 0 && !selectedPhone) setSelectedPhone(list[0].phone);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await api.get("/whatsapp/settings");
      const num = res.data?.whatsappNumber ?? "";
      setCompanyNumber(num);
      setNumberDraft(num);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchSidebar();
    fetchSettings();
  }, []);

  const loadMessages = (phone: string) => {
    api.get(`/whatsapp/messages/${phone}`).then((res) => {
      setMessages(res.data ?? []);
      setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 100);
    });
  };

  useEffect(() => {
    if (selectedPhone) loadMessages(selectedPhone);
  }, [selectedPhone]);

  const saveCompanyNumber = async () => {
    setSavingNumber(true);
    try {
      await api.patch("/companies/my-company", { whatsappNumber: numberDraft.trim() });
      setCompanyNumber(numberDraft.trim());
      toast({ title: "WhatsApp number saved." });
    } catch (e) {
      toast({ title: "Could not save number.", variant: "destructive" });
    } finally {
      setSavingNumber(false);
    }
  };

  // Open WhatsApp (web/app) with a pre-filled message via a wa.me link, and
  // log the outbound message so the thread history stays intact.
  const handleSend = async () => {
    if (!newMessage.trim() || !selectedPhone) return;
    try {
      const res = await api.post("/whatsapp/compose", {
        to: selectedPhone,
        message: newMessage,
      });
      const url = res.data?.url;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      setNewMessage("");
      loadMessages(selectedPhone);
      fetchSidebar();
    } catch (e) {
      toast({ title: "Could not open WhatsApp.", variant: "destructive" });
    }
  };

  const startNewChat = () => {
    const digits = newChatNumber.replace(/[^\d]/g, "");
    if (!digits) return;
    setSelectedPhone(digits);
    setNewChatNumber("");
    if (!threads.some((t) => t.phone === digits)) {
      setThreads((prev) => [{ id: digits, phone: digits, name: null }, ...prev]);
    }
  };

  return (
    <div className="flex h-screen bg-[#020817] text-slate-200 overflow-hidden font-sans">
      {/* SIDEBAR */}
      <div className="w-[420px] border-r border-white/5 flex flex-col bg-slate-950/40 backdrop-blur-2xl">
        <div className="p-6 border-b border-white/5 space-y-4">
          <h2 className="text-xl font-black text-white flex items-center gap-3 uppercase italic">
            <Zap className="text-emerald-500" size={20} fill="currentColor" /> Flow-Comm
          </h2>

          {/* Company WhatsApp number (click-to-chat sender) */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 mb-2 flex items-center gap-2">
              <Phone size={12} /> Your WhatsApp Number
            </div>
            <div className="flex gap-2">
              <input
                value={numberDraft}
                onChange={(e) => setNumberDraft(e.target.value)}
                placeholder="e.g. +27 82 123 4567"
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-500/40"
              />
              <button
                onClick={saveCompanyNumber}
                disabled={savingNumber || numberDraft.trim() === companyNumber}
                className="rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-3 text-emerald-300 disabled:opacity-40"
                title="Save number"
              >
                {savingNumber ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              </button>
            </div>
            <div className="mt-2 text-[10px] text-white/40">
              Messages open in WhatsApp — no API key needed.
            </div>
          </div>

          {/* New conversation */}
          <div className="flex gap-2">
            <input
              value={newChatNumber}
              onChange={(e) => setNewChatNumber(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && startNewChat()}
              placeholder="New chat: phone number"
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-500/40"
            />
            <button
              onClick={startNewChat}
              className="rounded-xl bg-emerald-500 text-slate-950 px-3 font-bold"
              title="Start chat"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] px-2 flex gap-2 items-center">
            <MessageSquare size={12} /> Conversations
          </h3>
          {threads.length === 0 ? (
            <div className="px-2 py-6 text-sm text-white/40">No conversations yet.</div>
          ) : (
            threads.map((t) => (
              <ContactTile
                key={t.id}
                t={t}
                active={selectedPhone === t.phone}
                onClick={() => setSelectedPhone(t.phone)}
              />
            ))
          )}
        </div>
      </div>

      {/* CHAT WINDOW */}
      <div className="flex-1 flex flex-col relative bg-black/10">
        {selectedPhone ? (
          <>
            <div className="p-6 border-b border-white/5 bg-slate-950/40 backdrop-blur-md flex items-center justify-between">
              <div>
                <h3 className="font-black text-white text-2xl tracking-tighter">{selectedPhone}</h3>
                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mt-1">
                  Click-to-Chat · History
                </p>
              </div>
              <a
                href={`https://wa.me/${selectedPhone.replace(/[^\d]/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-300"
              >
                <ExternalLink size={14} /> Open in WhatsApp
              </a>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-10 space-y-6 custom-scrollbar">
              {messages.length === 0 ? (
                <div className="text-center text-white/30 mt-20 font-bold uppercase tracking-widest text-sm">
                  No messages yet — send one to start.
                </div>
              ) : (
                messages.map((msg) => {
                  const outbound = msg.direction === "OUTBOUND";
                  return (
                    <div key={msg.id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`p-5 rounded-[28px] max-w-[60%] font-medium text-sm shadow-xl ${
                          outbound
                            ? "bg-emerald-600 text-white rounded-tr-none"
                            : "bg-slate-900 border border-white/5 rounded-tl-none"
                        }`}
                      >
                        {msg.content}
                        {outbound && msg.status === "click_to_chat" && (
                          <div className="mt-1 text-[9px] uppercase tracking-widest text-white/60">
                            sent via WhatsApp
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-8 bg-slate-950/90 border-t border-white/5 flex gap-4">
              <input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Type a message — opens in WhatsApp..."
                className="flex-1 bg-white/5 border border-white/10 rounded-[28px] py-5 px-8 text-sm font-medium outline-none focus:border-emerald-500/40"
              />
              <button
                onClick={handleSend}
                className="bg-emerald-500 text-slate-950 px-10 rounded-[24px] shadow-xl font-bold flex items-center gap-2"
              >
                <Send size={18} /> Send
              </button>
            </div>
          </>
        ) : (
          <div className="m-auto opacity-10 font-black uppercase tracking-[0.8em] text-center">
            <MessageSquare size={80} className="mx-auto mb-8" />
            Select a conversation
          </div>
        )}
      </div>
    </div>
  );
}

function ContactTile({ t, active, onClick }: { t: Thread; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full p-4 rounded-3xl border transition-all flex items-center gap-4 ${
        active
          ? "bg-emerald-600 border-emerald-400 shadow-2xl"
          : "bg-white/5 border-transparent hover:bg-white/10"
      }`}
    >
      <div
        className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-lg shadow-inner ${
          active ? "bg-white text-emerald-600" : "bg-slate-800 text-slate-400"
        }`}
      >
        {initialsFor(t)}
      </div>
      <div className="text-left overflow-hidden flex-1">
        <div className={`text-base font-black truncate ${active ? "text-white" : "text-slate-200"}`}>
          {t.name || t.phone}
        </div>
        <div className={`text-[11px] font-medium truncate ${active ? "text-white/70" : "text-slate-500"}`}>
          {t.lastMessage || t.phone}
        </div>
      </div>
      {t.unreadCount ? (
        <span className="rounded-full bg-emerald-400 text-slate-950 text-[10px] font-black px-2 py-0.5">
          {t.unreadCount}
        </span>
      ) : null}
    </button>
  );
}
