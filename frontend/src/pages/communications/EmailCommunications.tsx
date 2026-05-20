import { useToast } from '../../components/ToastProvider';
import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Mail, Search, CheckCircle2, Inbox, Send, Archive, Star, 
  RefreshCw, Clock, ArrowLeft, Paperclip, Smile, Trash2, Package, MapPin
} from "lucide-react";

// Mock data kept as a fallback to prevent the "Blank Screen" if fetch fails
const MOCK_EMAILS = [
  {
    id: 1,
    sender: "Dispatch Desk",
    email: "ops@jd-fasteners.co.za",
    subject: "Collection request for... [JD-991]",
    summary: "Collection request with 14 pallets scheduled for 16:00.",
    body: "Hi Team,\n\nPlease arrange a collection for JD-991. We have 14 pallets ready at the main loading bay. Closing time is strictly 16:00.\n\nRegards,\nDispatch",
    category: "Collection Intake",
    time: "5:03 PM",
    isRead: false,
    isStarred: true,
    confidence: 0.92,
    extractedData: { pallets: 14, closingTime: "16:00", referenceNumber: "JD-991" }
  }
];

export default function EmailCommunications() {
  const [emails, setEmails] = useState<any[]>(MOCK_EMAILS);
  const [selectedEmail, setSelectedEmail] = useState<any>(null);
  const [isNewMessage, setIsNewMessage] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("All Items");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fetchEmails = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      // Updated endpoint to match the corrected NestJS Controller
      const response = await fetch("http://localhost:3000/api/communications", {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) throw new Error(`Status: ${response.status}`);
      
      const data = await response.json();
      // Handle NestJS paginated or wrapped responses
      const emailList = Array.isArray(data) ? data : (data.data || []);
      
      if (emailList.length > 0) {
        setEmails(emailList);
      }
    } catch (error) {
      console.warn("API Offline or 404 - Using Mock Data fallback.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { 
    fetchEmails(); 
  }, []);

  const filteredEmails = useMemo(() => {
    if (!Array.isArray(emails)) return [];
    return emails.filter(email => {
      const matchesSearch = (email.subject?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            email.sender?.toLowerCase().includes(searchQuery.toLowerCase()));
      if (activeFilter === "AI Flagged") return matchesSearch && email.isStarred;
      if (activeFilter === "Pending") return matchesSearch && email.category === "Pending AI";
      if (activeFilter === "Processed") return matchesSearch && email.isRead;
      return matchesSearch;
    });
  }, [emails, searchQuery, activeFilter]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const token = localStorage.getItem('token');
      // Triggers the sync-ai-events logic on the backend
      const response = await fetch("http://localhost:3000/api/communications/sync", { 
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        await fetchEmails();
      }
    } catch (error) {
      console.error("Logistics AI Sync failed");
    } finally {
      setIsSyncing(false);
    }
  };

  const { showToast } = useToast();

  const handleSend = () => {
    // In a real scenario, this would POST to /api/communications/send
    showToast("Dispatching via Google SMTP...", "success");
    setReplyText("");
    setSelectedEmail(null);
    setIsNewMessage(false);
  };

  return (
    <div className="flex h-full flex-col bg-transparent animate-in fade-in duration-500">
      <div className="p-6 pb-2">
        <div className="rounded-[30px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {(selectedEmail || isNewMessage) && (
                <button onClick={() => { setSelectedEmail(null); setIsNewMessage(false); }} className="p-2 hover:bg-white/10 rounded-full text-white transition">
                  <ArrowLeft size={20} />
                </button>
              )}
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/85 ring-1 ring-white/15">
                  <Mail className="h-4 w-4" /> Shared Tenant Email Layer
                </div>
                <h1 className="mt-2 text-2xl font-black tracking-tight text-white uppercase italic">
                  {isNewMessage ? "Compose New" : selectedEmail ? "Reading Thread" : "Email Hub"}
                </h1>
              </div>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={handleSync} 
                disabled={isSyncing || isLoading} 
                className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 text-sm font-bold text-white border border-white/10 hover:bg-white/20 transition disabled:opacity-50"
              >
                <RefreshCw size={16} className={isSyncing ? "animate-spin" : ""} /> 
                {isSyncing ? "Syncing AI..." : "Sync"}
              </button>
              <button onClick={() => {setIsNewMessage(true); setSelectedEmail(null);}} className="flex items-center gap-2 rounded-2xl bg-indigo-600 px-6 py-2 text-sm font-black text-white shadow-lg hover:bg-indigo-500 transition">
                <Send size={16} /> New Message
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden p-6 pt-2 gap-6">
        {(!selectedEmail && !isNewMessage) && (
          <aside className="w-56 space-y-2 hidden xl:block">
            <nav className="space-y-1">
              {[
                { icon: Inbox, label: "All Items" }, 
                { icon: Star, label: "AI Flagged" }, 
                { icon: Clock, label: "Pending" }, 
                { icon: Archive, label: "Processed" }
              ].map((item) => (
                <button 
                  key={item.label} 
                  onClick={() => setActiveFilter(item.label)} 
                  className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition ${activeFilter === item.label ? "bg-white/10 text-white border border-white/10" : "text-white/50 hover:bg-white/5"}`}
                >
                  <item.icon size={18} /> {item.label}
                </button>
              ))}
            </nav>
          </aside>
        )}

        <main className="flex-1 flex flex-col rounded-[28px] border border-white/10 bg-white/5 shadow-2xl backdrop-blur-xl overflow-hidden">
          {(!selectedEmail && !isNewMessage) ? (
            <>
              <div className="flex items-center border-b border-white/5 px-6 py-4 bg-black/20">
                <Search size={18} className="text-white/30 mr-4" />
                <input 
                  type="text" 
                  placeholder="Filter by Ref # or Sender..." 
                  className="bg-transparent text-sm text-white focus:outline-none w-full" 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                />
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredEmails.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-white/20">
                    <Inbox size={48} className="mb-4 opacity-10" />
                    <p className="font-bold uppercase italic tracking-widest">No communications found</p>
                  </div>
                ) : (
                  filteredEmails.map((email) => (
                    <div key={email.id} onClick={() => setSelectedEmail(email)} className="group flex items-center gap-6 border-b border-white/5 px-6 py-4 hover:bg-white/10 cursor-pointer transition-all">
                      <div className="w-44 text-sm truncate font-bold text-white/90 uppercase italic">{email.sender}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm truncate font-medium ${email.isRead ? "text-white/40" : "text-white/80"}`}>{email.subject}</span>
                          {email.confidence > 0.8 && <CheckCircle2 size={14} className="text-emerald-500" />}
                        </div>
                      </div>
                      <div className="bg-white/5 text-[10px] font-black px-2 py-1 rounded border border-white/10 text-white/40 uppercase">{email.category}</div>
                      <div className="text-[11px] font-bold text-white/20">{email.time || 'Recent'}</div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-8 flex-1 overflow-y-auto space-y-6">
                <h2 className="text-xl font-black text-white italic uppercase tracking-tight">
                  {isNewMessage ? "NEW OUTBOUND MESSAGE" : selectedEmail.subject}
                </h2>
                
                {!isNewMessage && selectedEmail.extractedData && (
                  <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-5 flex items-center justify-between animate-in zoom-in-95 duration-300">
                    <div className="flex gap-8">
                      <div>
                        <p className="text-[10px] font-black text-indigo-400 uppercase mb-1 tracking-tighter">Units/Pallets</p>
                        <p className="text-lg font-black text-white leading-none">{selectedEmail.extractedData.pallets || 'N/A'}</p>
                      </div>
                      <div className="border-l border-white/10 pl-8">
                        <p className="text-[10px] font-black text-indigo-400 uppercase mb-1 tracking-tighter">Logistics Ref</p>
                        <p className="text-lg font-black text-white leading-none italic">{selectedEmail.extractedData.referenceNumber || 'Pending'}</p>
                      </div>
                    </div>
                    <button className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black px-4 py-2 rounded-xl transition shadow-lg shadow-emerald-900/20">
                      CREATE OPERATIONAL JOB
                    </button>
                  </div>
                )}
                
                <div className="text-white/80 text-[15px] leading-relaxed whitespace-pre-wrap font-medium">
                  {isNewMessage ? (
                    <input 
                      type="text" 
                      placeholder="Recipient Email..." 
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:outline-none mb-4" 
                    />
                  ) : selectedEmail?.body}
                </div>
              </div>

              <div className="p-6 bg-black/40 border-t border-white/10">
                <textarea 
                  value={replyText} 
                  onChange={(e) => setReplyText(e.target.value)} 
                  placeholder={isNewMessage ? "Compose your message..." : "Type your reply..."} 
                  className="w-full bg-transparent text-sm text-white focus:outline-none min-h-[100px] resize-none" 
                />
                <div className="flex justify-between items-center mt-2">
                  <div className="flex gap-2">
                    <button className="p-2 text-white/30 hover:text-white transition"><Paperclip size={18} /></button>
                    <button className="p-2 text-white/30 hover:text-white transition"><Smile size={18} /></button>
                  </div>
                  <button 
                    onClick={handleSend} 
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black px-8 py-2.5 rounded-xl flex items-center gap-2 transition active:scale-95"
                  >
                    <Send size={14} /> {isNewMessage ? "SEND MESSAGE" : "DISPATCH REPLY"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
