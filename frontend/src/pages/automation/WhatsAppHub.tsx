import React, { useState, useEffect, useRef } from "react";
import { Send, Zap, Truck, User, MessageSquare, Loader2, CheckCircle } from "lucide-react";
import { api } from '../../api/client'; 
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from '../../components/ui/use-toast';

export default function WhatsAppHub() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [threads, setThreads] = useState<any[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [flippedMessages, setFlippedMessages] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchSidebar = async () => {
    try {
      const res = await api.get("/whatsapp/threads");
      setThreads(res.data);
      if (res.data.length > 0 && !selectedPhone) setSelectedPhone(res.data[0].phone);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchSidebar(); }, []);

  useEffect(() => {
    if (selectedPhone) {
      api.get(`/whatsapp/messages/${selectedPhone}`).then(res => {
        setMessages(res.data);
        setFlippedMessages(new Set());
        setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, 100);
      });
    }
  }, [selectedPhone]);

  const handleBridge = async (url: string, phone: string, i: number) => {
    try {
      const formData = new FormData();
      const res = await fetch(url);
      const blob = await res.blob();
      formData.append("file", blob, `bridge_${Date.now()}.jpg`);
      formData.append("companyId", String(user?.companyId));
      await api.post("/waybills/inbox/upload", formData);
      setFlippedMessages(prev => new Set(prev).add(i));
      toast({ title: "Waybill bridged to inbox successfully." });
    } catch (e) {
      toast({ title: "Bridge failed.", variant: "destructive" });
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedPhone) return;
    await api.post("/whatsapp/send", { to: selectedPhone, message: newMessage });
    setNewMessage("");
    api.get(`/whatsapp/messages/${selectedPhone}`).then(res => setMessages(res.data));
  };

  return (
    <div className="flex h-screen bg-[#020817] text-slate-200 overflow-hidden font-sans">
      
      {/* 🟦 SIDEBAR: INDIVIDUAL TILES */}
      <div className="w-[420px] border-r border-white/5 flex flex-col bg-slate-950/40 backdrop-blur-2xl">
        <div className="p-8 border-b border-white/5">
          <h2 className="text-xl font-black text-white flex items-center gap-3 uppercase italic">
            <Zap className="text-sky-500" size={20} fill="currentColor" /> Flow-Comm
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-10 custom-scrollbar">
          {/* LANE: FLEET */}
          <section>
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-6 px-2 flex gap-2"><Truck size={12}/> Fleet / Drivers</h3>
            <div className="space-y-4">
              {threads.filter(t => t.role === 'DRIVER').map(t => (
                <ContactTile key={t.id} t={t} active={selectedPhone === t.phone} onClick={() => setSelectedPhone(t.phone)} />
              ))}
            </div>
          </section>

          {/* LANE: CLIENTS */}
          <section>
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-6 px-2 flex gap-2"><User size={12}/> Client Enquiries</h3>
            <div className="space-y-4">
              {threads.filter(t => t.role !== 'DRIVER').map(t => (
                <ContactTile key={t.id} t={t} active={selectedPhone === t.phone} onClick={() => setSelectedPhone(t.phone)} />
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* 🟦 THE CHAT WINDOW */}
      <div className="flex-1 flex flex-col relative bg-black/10 perspective-1000">
        {selectedPhone ? (
          <>
            <div className="p-8 border-b border-white/5 bg-slate-950/40 backdrop-blur-md">
              <h3 className="font-black text-white text-2xl tracking-tighter">{selectedPhone}</h3>
              <p className="text-[10px] font-black text-sky-500 uppercase tracking-widest mt-1">Live History</p>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-12 space-y-10 custom-scrollbar">
              {messages.map((msg, i) => {
                const isFlipped = flippedMessages.has(i);
                return (
                  <div key={i} className={`flex ${msg.status === "SENT" ? "justify-end" : "justify-start"}`}>
                    {msg.mediaUrl ? (
                      /* 🔄 IMAGE FLIP TILE */
                      <div className="w-[450px] h-[300px] relative preserve-3d transition-all duration-700 shadow-2xl" style={{ transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
                        <div className="absolute inset-0 backface-hidden rounded-[40px] overflow-hidden border-2 border-white/5">
                          <img src={msg.mediaUrl} className="w-full h-full object-cover" />
                          <button onClick={() => handleBridge(msg.mediaUrl, selectedPhone, i)} className="absolute inset-0 m-auto w-fit h-fit bg-sky-500 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase shadow-2xl">Bridge to Inbox</button>
                        </div>
                        <div className="absolute inset-0 backface-hidden rotate-y-180 bg-emerald-600 rounded-[40px] flex flex-col items-center justify-center p-8 text-center">
                           <CheckCircle size={48} className="text-white mb-4" />
                           <h4 className="text-2xl font-black text-white uppercase tracking-tighter">Waybill Bridged</h4>
                        </div>
                      </div>
                    ) : (
                      <div className={`p-8 rounded-[35px] max-w-[60%] font-bold text-sm shadow-xl ${msg.status === "SENT" ? "bg-sky-600 text-white rounded-tr-none" : "bg-slate-900 border border-white/5 rounded-tl-none"}`}>
                        {msg.message || msg.body}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-10 bg-slate-950/90 border-t border-white/5 flex gap-4">
              <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSend()} placeholder="Type response..." className="flex-1 bg-white/5 border border-white/10 rounded-[35px] py-8 px-12 text-sm font-bold outline-none focus:border-sky-500/40" />
              <button onClick={handleSend} className="bg-sky-500 text-white px-12 rounded-[30px] shadow-xl"><Send /></button>
            </div>
          </>
        ) : (
          <div className="m-auto opacity-10 font-black uppercase tracking-[1em] text-center"><MessageSquare size={80} className="mx-auto mb-8"/>Select A Tile</div>
        )}
      </div>

      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
    </div>
  );
}

// 🧩 THE INDIVIDUAL TILE COMPONENT
function ContactTile({ t, active, onClick }: { t: any, active: boolean, onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-full p-7 rounded-[40px] border transition-all flex items-center gap-6 ${active ? 'bg-sky-600 border-sky-400 shadow-2xl translate-x-3 scale-105' : 'bg-white/5 border-transparent hover:bg-white/10'}`}>
      <div className={`w-14 h-14 rounded-full flex items-center justify-center font-black text-xl shadow-inner ${active ? 'bg-white text-sky-600' : 'bg-slate-800 text-slate-500'}`}>
        {t.initials}
      </div>
      <div className="text-left overflow-hidden">
        {/* 🚀 HARD NOTE: Applied 'truncate' fix here */}
        <div className={`text-xl font-black truncate max-w-[200px] ${active ? 'text-white' : 'text-slate-200'}`}>
          {t.name}
        </div>
        <div className={`text-[11px] font-bold ${active ? 'text-white/60' : 'text-slate-500'}`}>
          {t.phone}
        </div>
      </div>
    </button>
  );
}
