import React, { useState, useEffect } from "react";
import {
  MessageCircle,
  Image as ImageIcon,
  Bot,
  Send,
  Users,
  ArrowUpRight,
  ClipboardCheck,
  Truck,
  ArrowRightLeft,
  Search,
  User,
  Clock,
  Loader2,
  ArrowLeft
} from "lucide-react";
import { api } from '../../api/client';

// Original Card Component preserved
function Card(props: {
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const Icon = props.icon;

  return (
    <div className="rounded-[26px] border border-white/10 bg-white/5 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div className="mt-4 text-lg font-extrabold text-white">{props.title}</div>
      <div className="mt-1 text-sm leading-relaxed text-white/65">{props.desc}</div>
    </div>
  );
}

export default function WhatsAppCommunications() {
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [threads, setThreads] = useState<any[]>([]);
  const [activeThread, setActiveThread] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  // Load threads when switching to live mode
  useEffect(() => {
    if (isLiveMode) {
      loadThreads();
    }
  }, [isLiveMode]);

  // Load messages when a thread is selected
  useEffect(() => {
    if (activeThread) {
      loadMessages(activeThread.phone);
    }
  }, [activeThread]);

  const loadThreads = async () => {
    setLoading(true);
    try {
      const res = await api.get("/whatsapp/threads");
      setThreads(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error("Failed to load threads:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (phone: string) => {
    try {
      const res = await api.get(`/whatsapp/messages/${phone}`);
      setMessages(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error("Failed to load messages:", error);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeThread) return;

    setSending(true);
    try {
      await api.post("/whatsapp/send", {
        to: activeThread.phone,
        message: newMessage,
      });
      
      // Optimistically add message to UI
      setMessages((prev) => [...prev, { id: Date.now(), direction: "outbound", body: newMessage, createdAt: new Date() }]);
      setNewMessage("");
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setSending(false);
    }
  };

  // --- VIEW 1: THE STATIC DASHBOARD ---
  if (!isLiveMode) {
    return (
      <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(44,140,92,0.18),transparent_30%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8">
        <div className="mx-auto max-w-[1600px] space-y-6">
          <div className="rounded-[30px] border border-white/10 bg-white/6 p-6 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/85 ring-1 ring-white/15">
                <MessageCircle className="h-4 w-4" />
                Tenant WhatsApp Command Center
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
                WhatsApp
              </h1>

              <p className="mt-2 max-w-4xl text-sm text-white/72">
                Tenant-controlled WhatsApp workspace for driver updates, collection dispatch,
                POD uploads, client delivery questions, and AI extraction into FlowOps workflows.
              </p>
            </div>

            {/* 🚀 THE FLIP BUTTON */}
            <button 
              onClick={() => setIsLiveMode(true)}
              className="bg-emerald-500 hover:bg-emerald-400 text-black px-8 py-4 rounded-2xl font-black text-sm flex items-center gap-3 transition-all shadow-[0_0_40px_rgba(16,185,129,0.3)] hover:scale-105 shrink-0"
            >
              <ArrowRightLeft size={18} />
              FLIP TO LIVE INBOX
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-4">
            <Card
              title="Inbound Messages"
              desc="Handle tenant client and driver conversations in one operational view."
              icon={Users}
            />
            <Card
              title="POD Media Intake"
              desc="Receive images, signed proof, delivery attachments, and parcel evidence."
              icon={ImageIcon}
            />
            <Card
              title="Collection Dispatch"
              desc="Push collection requests and updates into driver communication flows."
              icon={Truck}
            />
            <Card
              title="AI Extraction"
              desc="Convert messages and media into structured operational and billing signals."
              icon={Bot}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.30)]">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <ClipboardCheck className="h-5 w-5" />
                Strategic value
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-white/70">
                WhatsApp should not be a disconnected chat tool. It should feed driver work,
                collections, POD evidence, customer service, and invoice readiness into the tenant system.
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.30)]">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Send className="h-5 w-5" />
                Next upgrade
              </div>

              <div className="mt-4 space-y-3">
                {[
                  "Live WhatsApp inbox",
                  "Driver thread view",
                  "POD image queue",
                  "Collection request push",
                  "AI message-to-record matching",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/78"
                  >
                    <ArrowUpRight className="h-4 w-4 text-white/45" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- VIEW 2: THE LIVE INBOX ---
  return (
    <div className="min-h-full bg-[#07111f] p-6">
      <div className="mx-auto max-w-[1600px] h-[85vh] rounded-[32px] border border-white/10 bg-white/5 shadow-2xl backdrop-blur-xl flex overflow-hidden">
        
        {/* Left Sidebar: Threads */}
        <div className="w-1/3 max-w-[400px] border-r border-white/10 flex flex-col bg-black/20">
          <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
            <button onClick={() => setIsLiveMode(false)} className="text-slate-400 hover:text-white transition-colors bg-white/5 p-2 rounded-lg border border-white/10">
              <ArrowLeft size={18} />
            </button>
            <span className="text-sm font-black text-white uppercase tracking-widest">Active Threads</span>
            <MessageCircle size={20} className="text-emerald-400" />
          </div>
          
          <div className="p-4 border-b border-white/10">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/30" />
              <input type="text" placeholder="Search numbers..." className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin text-emerald-500" /></div>
            ) : threads.length === 0 ? (
              <div className="text-center p-8 text-slate-500 text-sm font-bold bg-black/20 rounded-2xl border border-white/5">No active conversations found on the API.</div>
            ) : (
              threads.map((thread) => (
                <button
                  key={thread.phone}
                  onClick={() => setActiveThread(thread)}
                  className={`w-full text-left p-4 rounded-2xl transition-all flex items-center gap-4 ${activeThread?.phone === thread.phone ? 'bg-emerald-500/10 border border-emerald-500/20' : 'hover:bg-white/5 border border-transparent bg-black/20'}`}
                >
                  <div className="h-10 w-10 shrink-0 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 border border-white/10">
                    <User size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-bold text-sm truncate">{thread.name || thread.phone}</div>
                    <div className="text-slate-500 text-xs truncate mt-1">{thread.lastMessage || "Click to view history"}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Area: Chat History */}
        <div className="flex-1 flex flex-col relative bg-[#0a1122]">
          {activeThread ? (
            <>
              {/* Chat Header */}
              <div className="p-6 border-b border-white/10 bg-white/5 backdrop-blur-md flex items-center gap-4 z-10">
                <div className="h-12 w-12 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <User size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white">{activeThread.name || activeThread.phone}</h2>
                  <div className="flex items-center gap-2 text-xs text-emerald-400 font-bold mt-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" /> Online via Gateway
                  </div>
                </div>
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {messages.length === 0 ? (
                  <div className="text-center p-8 text-slate-500 text-sm font-bold">No messages in this thread yet.</div>
                ) : (
                  messages.map((msg, i) => (
                    <div key={msg.id || i} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] rounded-2xl p-4 shadow-xl ${msg.direction === 'outbound' ? 'bg-emerald-600 text-black rounded-tr-sm' : 'bg-[#1e293b] border border-white/10 text-white rounded-tl-sm'}`}>
                        <p className="text-sm font-medium leading-relaxed">{msg.body}</p>
                        <div className={`text-[10px] mt-2 flex items-center gap-1 font-bold ${msg.direction === 'outbound' ? 'text-emerald-950' : 'text-slate-400'}`}>
                          <Clock size={10} />
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Input Area */}
              <div className="p-5 bg-white/5 backdrop-blur-md border-t border-white/10 z-10">
                <form onSubmit={handleSendMessage} className="flex gap-3">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message to dispatch..."
                    className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-emerald-500/50 transition-colors shadow-inner"
                  />
                  <button 
                    type="submit" 
                    disabled={sending || !newMessage.trim()}
                    className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 text-black p-4 rounded-2xl transition-colors flex items-center justify-center aspect-square shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                  >
                    {sending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
              <div className="h-24 w-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6 shadow-2xl shadow-black">
                <MessageCircle size={40} className="text-slate-400" />
              </div>
              <p className="font-black tracking-widest uppercase text-sm text-slate-400">Select a thread to connect</p>
              <p className="text-xs mt-2 text-slate-600">Secure end-to-end API channel</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
