import React, { useState, useEffect, useRef } from "react";
import { Send, Zap, MessageSquare, Loader2, Phone } from "lucide-react";
import { api } from '../api/client';
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/ToastProvider";

export default function WhatsAppHub() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [threads, setThreads] = useState<any[]>([]);
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 1. Fetch Sidebar Threads
  const fetchThreads = async () => {
    try {
      const res = await api.get("/whatsapp/threads");
      setThreads(res.data);
      if (res.data.length > 0 && !selectedThread) {
        setSelectedThread(res.data[0].phone);
      }
    } catch (e) {
      console.error("Thread fetch failed", e);
    }
  };

  // 2. Load Messages for selected driver
  const loadMessages = async (phone: string) => {
    try {
      const res = await api.get(`/whatsapp/messages/${phone}`);
      setMessages(res.data);
      // Precision scroll to bottom
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }
    } catch (err) {
      console.error("Message load failed", err);
    }
  };

  useEffect(() => {
    fetchThreads();
    const tInterval = setInterval(fetchThreads, 10000);
    return () => clearInterval(tInterval);
  }, []);

  useEffect(() => {
    if (selectedThread) {
      loadMessages(selectedThread);
      const mInterval = setInterval(() => loadMessages(selectedThread), 3000);
      return () => clearInterval(mInterval);
    }
  }, [selectedThread]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedThread) return;
    setLoading(true);
    try {
      await api.post("/whatsapp/send", {
        to: selectedThread,
        message: newMessage,
      });
      setNewMessage("");
      loadMessages(selectedThread);
    } catch (err) {
      showToast("Message failed to dispatch.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#020817] text-slate-200 overflow-hidden font-sans">
      {/* SIDEBAR */}
      <div className="w-[350px] border-r border-white/5 flex flex-col bg-slate-950/40 backdrop-blur-xl">
        <div className="p-8 border-b border-white/5">
          <h2 className="text-xl font-black text-white tracking-tighter flex items-center gap-3">
            <Zap className="text-sky-500 fill-sky-500" size={18} /> DISPATCH
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          {threads.map((t) => (
            <button
              key={t.phone}
              onClick={() => setSelectedThread(t.phone)}
              className={`w-full p-5 rounded-[24px] border text-left transition-all duration-300 ${
                selectedThread === t.phone 
                ? "bg-sky-600 border-sky-400 shadow-[0_0_20px_rgba(14,165,233,0.3)]" 
                : "border-transparent hover:bg-white/5"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Phone size={10} className={selectedThread === t.phone ? "text-white" : "text-sky-500"} />
                <span className="text-sm font-black text-white">+{t.phone}</span>
              </div>
              <div className={`text-[10px] uppercase font-bold tracking-widest ${selectedThread === t.phone ? "text-sky-100" : "text-white/20"}`}>
                Driver Active
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* MAIN CHAT */}
      <div className="flex-1 flex flex-col relative bg-black/20">
        {selectedThread ? (
          <>
            <div className="p-6 border-b border-white/5 bg-slate-950/40 backdrop-blur-md flex justify-between items-center">
              <div>
                <h3 className="font-black text-white text-lg tracking-tight">+{selectedThread}</h3>
                <p className="text-[10px] text-green-500 font-bold uppercase tracking-[0.2em] animate-pulse">System Linked</p>
              </div>
              <div className="flex gap-4">
                <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40">
                  <MessageSquare size={18} />
                </div>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar">
              {messages.map((msg, i) => {
                const isOutbound = msg.status === "SENT";
                return (
                  <div key={i} className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[70%] flex flex-col ${isOutbound ? "items-end" : "items-start"}`}>
                      <div className={`p-6 rounded-[28px] text-sm font-bold shadow-2xl leading-relaxed ${
                        isOutbound 
                        ? "bg-sky-600 text-white rounded-tr-none border border-sky-400/30" 
                        : "bg-slate-900 border border-white/10 rounded-tl-none text-slate-100"
                      }`}>
                        {msg.message}
                      </div>
                      <div className="mt-2 text-[9px] text-white/20 font-black uppercase tracking-tighter">
                        {new Date(msg.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {msg.status}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-8 bg-slate-950/90 border-t border-white/5 backdrop-blur-xl">
              <div className="max-w-4xl mx-auto flex items-center gap-4">
                <div className="flex-1 relative group">
                  <input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                    placeholder="Type manual override command..."
                    className="w-full bg-white/5 border border-white/10 rounded-[28px] py-6 px-10 text-sm font-bold outline-none focus:border-sky-500/50 transition-all text-white placeholder:text-white/10 shadow-inner"
                  />
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 flex gap-2">
                    <Zap size={14} className="text-white/5 group-focus-within:text-sky-500 transition-colors" />
                  </div>
                </div>
                <button
                  onClick={handleSendMessage}
                  disabled={loading || !newMessage.trim()}
                  className="bg-sky-500 hover:bg-sky-400 text-white p-6 rounded-[24px] transition-all disabled:opacity-20 shadow-[0_0_20px_rgba(14,165,233,0.4)] active:scale-95"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="m-auto flex flex-col items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center animate-pulse">
               <Zap size={32} className="text-white/10" />
            </div>
            <p className="opacity-20 font-black uppercase tracking-[0.6em] text-[10px] text-white">Select Encrypted Thread</p>
          </div>
        )}
      </div>
    </div>
  );
}
