import React, { useEffect, useState, useRef } from 'react';
import { api } from '../api/client';
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
  const [stats, setStats] = useState({ cpu: 0, memory: 0, loadColor: 'text-emerald-500', total: 0, ready: 0, extracting: 0, failed: 0 });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InboxItem | null>(null);
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
      const [inboxRes, statsRes] = await Promise.all([
        api.get<any, any>(`/waybills/inbox`),
        api.get<any, any>(`/waybills/inbox/stats`),
      ]);
      // Unwrap TransformInterceptor envelope
      const inboxRaw: any = inboxRes?.data ?? inboxRes;
      const inboxList: InboxItem[] = Array.isArray(inboxRaw) ? inboxRaw : (inboxRaw?.data ?? []);
      setItems(inboxList);

      const statsRaw: any = statsRes?.data ?? statsRes;
      setStats({
        cpu: statsRaw?.cpu ?? statsRaw?.processing ?? 0,
        memory: statsRaw?.memory ?? 0,
        loadColor: (statsRaw?.cpu ?? 0) > 80 ? 'text-rose-500' : (statsRaw?.cpu ?? 0) > 50 ? 'text-amber-500' : 'text-emerald-500',
        total:      statsRaw?.total      ?? inboxList.length,
        ready:      statsRaw?.ready      ?? inboxList.filter(i => i.status === 'READY').length,
        extracting: statsRaw?.extracting ?? inboxList.filter(i => i.status === 'EXTRACTING').length,
        failed:     statsRaw?.failed     ?? inboxList.filter(i => i.status === 'FAILED').length,
      });
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
      await api.post<any, any>('/waybills/inbox/upload', formData);
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

      {/* Stats strip */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-10">
        {[
          { label: "Total",      value: stats.total,      color: "text-white",         bg: "border-white/10 bg-white/4" },
          { label: "Ready",      value: stats.ready,      color: "text-emerald-300",   bg: "border-emerald-500/20 bg-emerald-500/6" },
          { label: "Extracting", value: stats.extracting, color: "text-blue-300",      bg: "border-blue-500/20 bg-blue-500/6" },
          { label: "Failed",     value: stats.failed,     color: "text-rose-300",      bg: "border-rose-500/20 bg-rose-500/6" },
        ].map(s => (
          <div key={s.label} className={`rounded-[22px] border ${s.bg} px-5 py-4`}>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35 mb-1">{s.label}</div>
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

        {loading && items.length === 0 && (
          <div className="flex items-center justify-center py-20 text-white/20 text-sm">Loading inbox…</div>
        )}
        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <UploadCloud className="h-12 w-12 text-white/10 mb-4" />
            <p className="text-white/25 font-bold text-lg">Inbox is empty</p>
            <p className="text-white/15 text-sm mt-1">Upload a waybill image or PDF to start AI extraction</p>
          </div>
        )}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {items.map(item => (
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

      {/* Right sidebar — live stats */}
      <div className="w-[380px] bg-black/40 border-l border-white/10 p-8 flex flex-col gap-6 overflow-y-auto">
        <h2 className="text-white font-black text-xs uppercase tracking-[0.4em] flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" /> Hub Status
        </h2>

        {/* Breakdown */}
        <div className="space-y-2">
          {[
            { label: "Awaiting Extraction",  value: stats.extracting, color: "bg-blue-500" },
            { label: "Ready to Commit",       value: stats.ready,      color: "bg-emerald-500" },
            { label: "Failed",                value: stats.failed,     color: "bg-rose-500" },
          ].map(s => (
            <div key={s.label} className="flex items-center justify-between text-sm">
              <span className="text-white/50 flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${s.color}`} />
                {s.label}
              </span>
              <span className="font-black text-white">{s.value}</span>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        {stats.total > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-white/30 mb-2">Completion</div>
            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${Math.round((stats.ready / stats.total) * 100)}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-white/25 mt-1">
              <span>{stats.ready} committed</span>
              <span>{Math.round((stats.ready / stats.total) * 100)}%</span>
            </div>
          </div>
        )}

        {/* Recently committed */}
        <div>
          <h3 className="text-[10px] uppercase tracking-[0.16em] text-white/30 mb-3">Ready to Commit</h3>
          <div className="space-y-2">
            {items.filter(i => i.status === 'READY').slice(0, 5).map(item => (
              <button key={item.id} onClick={() => setSelectedItem(item)}
                className="w-full flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 hover:bg-emerald-500/10 transition text-left">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate">{item.waybillNumber || "Pending"}</div>
                  <div className="text-[10px] text-white/30">{item.weight ?? "—"}kg · {item.pieces ?? "—"} pcs</div>
                </div>
              </button>
            ))}
            {items.filter(i => i.status === 'READY').length === 0 && (
              <div className="text-center py-6 text-white/15 text-xs">No items ready yet</div>
            )}
          </div>
        </div>

        {/* Failed items */}
        {items.filter(i => i.status === 'FAILED').length > 0 && (
          <div>
            <h3 className="text-[10px] uppercase tracking-[0.16em] text-rose-400/50 mb-3">Failed Extraction</h3>
            {items.filter(i => i.status === 'FAILED').map(item => (
              <button key={item.id} onClick={() => setSelectedItem(item)}
                className="w-full flex items-center gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 hover:bg-rose-500/10 transition text-left mb-2">
                <FileText className="h-4 w-4 text-rose-400 shrink-0" />
                <div className="text-sm font-bold text-white truncate">{item.waybillNumber || "Unknown"}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
