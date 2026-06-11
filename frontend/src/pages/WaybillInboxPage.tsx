import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { 
  ArrowRight, UploadCloud, Loader2, FileText, 
  Cpu, CheckCircle2, Zap, DollarSign 
} from 'lucide-react';
import InboxCorrection from '../components/Inbox/InboxCorrection';

interface InboxItem {
  id: string;
  fileUrl: string;
  status: string; // 'EXTRACTING', 'READY', 'FAILED', etc.
  createdAt: string;
  waybillNumber?: string;
  weight?: string;
  pieces?: string;
  extractedData?: { confidence?: number; };
}

export default function WaybillInboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [recentCommits, setRecentCommits] = useState<any[]>([]);
  const [stats, setStats] = useState({ cpu: 0, memory: 0, loadColor: 'text-emerald-500' });
  const [selectedItem, setSelectedItem] = useState<InboxItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 💰 THE REVENUE ENGINE: Matches your seeded RateCard "1"
  const calculateEstimate = (weightStr?: string) => {
    const weight = parseFloat(weightStr || '0');
    const distance = 45; // Placeholder: In prod, this comes from Route logic
    const rates = { base: 150, km: 18.50, kg: 3.25, fuel: 1.125, vat: 1.15 };
    
    const subtotal = rates.base + (distance * rates.km) + (weight * rates.kg);
    return (subtotal * rates.fuel * rates.vat).toFixed(2);
  };

  const fetchData = async () => {
    try {
      const [inboxRes, recentRes, statsRes] = await Promise.all([
        axios.get('http://localhost:3000/api/waybills/inbox'),
        axios.get('http://localhost:3000/api/waybills/recent'), // Endpoint assumes you have this
        axios.get('http://localhost:3000/api/waybills/inbox/stats')
      ]);
      setItems(inboxRes.data);
      setRecentCommits(recentRes.data);
      setStats(statsRes.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { 
    fetchData(); 
    const interval = setInterval(fetchData, 5000); 
    return () => clearInterval(interval);
  }, []);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      await axios.post('http://localhost:3000/api/waybills/inbox/upload', formData);
      fetchData();
    } catch (err) { console.error(err); } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (selectedItem) {
    return (
      <div className="min-h-full bg-[#07111f] p-8">
        <InboxCorrection item={selectedItem} onClose={() => setSelectedItem(null)} onCommitted={() => { setSelectedItem(null); fetchData(); }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07111f] flex overflow-hidden font-sans">
      <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" accept="image/*,application/pdf" />

      <div className="flex-1 p-10 overflow-y-auto">
        <div className="flex justify-between items-end mb-16">
          <div>
            <h1 className="text-6xl font-black text-white tracking-tighter">Waybill Inbox</h1>
            <p className="text-blue-400/50 font-bold uppercase tracking-widest text-[10px] mt-2">AI-Powered Asset Ingestion</p>
          </div>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="bg-blue-600 hover:bg-blue-500 text-white font-black py-5 px-10 rounded-[24px] flex items-center gap-3 transition-all active:scale-95 shadow-[0_0_40px_rgba(37,99,235,0.3)]">
            {uploading ? <Loader2 className="animate-spin" size={18} /> : <UploadCloud size={18} />}
            INGEST ASSETS
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {items.map((item) => (
            <div key={item.id} onClick={() => setSelectedItem(item)} className={`bg-white/[0.03] border rounded-[48px] p-10 transition-all cursor-pointer group relative ${item.status === 'READY' ? 'border-emerald-500/30 bg-emerald-500/[0.02]' : 'border-white/10 hover:bg-white/[0.06]'}`}>
              
              <div className="flex justify-between items-start mb-10">
                <div className={`h-16 w-16 rounded-[24px] flex items-center justify-center border ${item.status === 'READY' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-blue-500/10 border-blue-500/20'}`}>
                  {item.status === 'EXTRACTING' ? <Cpu className="text-blue-400 animate-pulse" size={32} /> : item.status === 'READY' ? <CheckCircle2 className="text-emerald-400" size={32} /> : <FileText className="text-blue-400" size={32} />}
                </div>
                
                <div className="text-right">
                  <div className={`px-4 py-2 rounded-full border text-[9px] font-black uppercase tracking-widest ${item.status === 'READY' ? 'text-emerald-500 border-emerald-500/20 bg-emerald-500/5' : 'text-blue-400 border-blue-500/20 bg-blue-500/5'}`}>
                    {item.status}
                  </div>
                  {item.status === 'READY' && (
                    <p className="text-[10px] font-black text-emerald-500/60 mt-2 uppercase tracking-tighter flex items-center justify-end gap-1">
                      <Zap size={10} /> Estimate: R{calculateEstimate(item.weight)}
                    </p>
                  )}
                </div>
              </div>

              <h3 className="text-white font-black text-3xl truncate mb-2">{item.waybillNumber || "Scanning..."}</h3>
              <p className="text-white/20 text-[10px] font-bold uppercase tracking-widest mb-8">{item.pieces || 0} Pieces • {item.weight || 0}kg</p>

              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden mb-8">
                <div className={`h-full transition-all duration-[2000ms] ${item.status === 'EXTRACTING' ? 'bg-blue-500 w-2/3 animate-pulse' : 'bg-emerald-500 w-full shadow-[0_0_15px_rgba(16,185,129,0.4)]'}`} />
              </div>

              <div className="flex justify-between items-center text-blue-400 font-black text-[10px] uppercase tracking-widest group-hover:gap-4 transition-all">
                {item.status === 'READY' ? 'Finalize & Commit' : 'Verify Metadata'} <ArrowRight size={16} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sidebar - Remains consistent with your Ledger/Resource monitor */}
      <div className="w-[420px] bg-black/40 border-l border-white/10 p-10 flex flex-col">
        <h2 className="text-white font-black text-xs uppercase tracking-[0.4em] mb-10 flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" /> Live Ledger Feed
        </h2>
        {/* ... Recent Commits & System Resources (Keep your existing code here) ... */}
      </div>
    </div>
  );
}
