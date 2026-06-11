import React, { useState, useEffect } from "react";
import { api } from '../api/client'; // 🚀 FIX: The missing import
import { 
  Truck, MapPin, ChevronRight, Send, 
  FileText, Box, RefreshCw, CheckCircle2, 
  ArrowRightLeft, AlertCircle 
} from "lucide-react";
import { useToast } from "../components/ToastProvider";

export default function Linehaul() {
  // --- STATE ---
  const [readyWaybills, setReadyWaybills] = useState<any[]>([]);
  const [manifests, setManifests] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const { showToast } = useToast();
  
  const [destBranch, setDestBranch] = useState("");
  const [selectedDriver, setSelectedDriver] = useState("");
  const [loading, setLoading] = useState(true);
  const [isDispatching, setIsDispatching] = useState(false);

  // --- DATA LOADING ---
  const loadData = async () => {
    try {
      setLoading(true);
      const [wbRes, brRes, drRes, mnRes] = await Promise.all([
        api.get("/waybills?status=PENDING"),
        api.get("/companies"), // Using companies as hubs for demo/MVP
        api.get("/drivers"),
        api.get("/branches/manifests/incoming") // Fetching current ledger
      ]);
      setReadyWaybills(wbRes.data || []);
      setBranches(brRes.data || []);
      setDrivers(drRes.data || []);
      setManifests(mnRes.data || []);
    } catch (err) {
      console.error("Load failed", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // --- ACTIONS ---
  const handleDispatch = async () => {
    if (!destBranch || !selectedDriver || selectedIds.length === 0) return;
    try {
      setIsDispatching(true);
      await api.post("/branches/linehaul", {
        waybillIds: selectedIds,
        destinationBranchId: destBranch,
        driverId: selectedDriver,
        vehicleId: "VHC-AUTO-01" 
      });
      loadData(); // Refresh list
      setSelectedIds([]);
      showToast("🚛 Linehaul Dispatched! Waybills are now IN_TRANSIT.", "success");
    } catch (err) {
      showToast("Dispatch failed. Check backend logs.", "error");
    } finally {
      setIsDispatching(false);
    }
  };

  const handleDownloadManifest = async (id: string, num: string) => {
    try {
      const res = await api.get(`/branches/manifest/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `manifest-${num}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      showToast("PDF Generation failed", "error");
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  if (loading) return <div className="p-10 text-white animate-pulse font-black uppercase tracking-widest">Initialising Hub...</div>;

  return (
    <div className="p-8 space-y-8 bg-[#020817] min-h-screen text-slate-200">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-5xl font-black text-white italic uppercase tracking-tighter leading-none">Linehaul Hub</h1>
          <p className="text-blue-500 font-bold uppercase text-[10px] tracking-[0.3em] mt-2 flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-ping" /> AI Dispatch Active
          </p>
        </div>
        <button onClick={loadData} className="p-3 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all">
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* 🛠️ DISPATCH BUILDER */}
        <div className="xl:col-span-2 space-y-6">
          <section className="bg-white/[0.02] border border-white/5 rounded-[40px] p-8">
            <h2 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
              <Box size={14} /> Ready for Transfer ({readyWaybills.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {readyWaybills.map(wb => (
                <div 
                  key={wb.id} 
                  onClick={() => toggleSelect(wb.id)}
                  className={`p-5 rounded-2xl border cursor-pointer transition-all flex justify-between items-center group ${
                    selectedIds.includes(wb.id) 
                      ? 'bg-blue-600/20 border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.1)]' 
                      : 'bg-black/40 border-white/5 hover:border-white/20'
                  }`}
                >
                  <div>
                    <div className="font-black text-white text-lg tracking-tight">{wb.waybillNumber}</div>
                    <div className="text-[10px] text-slate-500 font-black uppercase mt-1">{wb.recipient || 'Retail Parcel'}</div>
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                    selectedIds.includes(wb.id) ? 'bg-blue-500 border-blue-500' : 'border-white/10'
                  }`}>
                    {selectedIds.includes(wb.id) && <CheckCircle2 size={14} className="text-white" />}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 📄 RECENT MANIFESTS LEDGER */}
          <section>
             <h2 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Operational Ledger</h2>
             <div className="space-y-3">
               {manifests.map(m => (
                 <div key={m.id} className="bg-slate-900/50 border border-white/5 rounded-2xl p-4 flex justify-between items-center">
                   <div className="flex items-center gap-4">
                      <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400"><Truck size={20} /></div>
                      <div>
                        <div className="font-black text-white">{m.manifestNumber}</div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase">{m.sourceBranch?.name} → {m.destinationBranch?.name}</div>
                      </div>
                   </div>
                   <button 
                      onClick={() => handleDownloadManifest(m.id, m.manifestNumber)}
                      className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl hover:bg-blue-500/20 transition-all text-[10px] font-black uppercase italic"
                   >
                     <FileText size={14} className="text-blue-400" />
                     Download PDF
                   </button>
                 </div>
               ))}
             </div>
          </section>
        </div>

        {/* 🚛 DISPATCH CONTROL PANEL */}
        <aside className="space-y-6">
          <div className="bg-gradient-to-br from-slate-900 to-black border border-white/10 rounded-[40px] p-8 shadow-2xl sticky top-8">
            <h2 className="text-2xl font-black text-white mb-8 italic uppercase tracking-tighter">Dispatch Control</h2>
            
            <div className="space-y-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <MapPin size={12} /> Target Hub
                </label>
                <select 
                  onChange={(e) => setDestBranch(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm font-bold text-white outline-none focus:border-blue-500 transition-all appearance-none"
                >
                  <option value="">Select Destination...</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Truck size={12} /> Assigned Driver
                </label>
                <select 
                  onChange={(e) => setSelectedDriver(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm font-bold text-white outline-none focus:border-blue-500 transition-all appearance-none"
                >
                  <option value="">Select Driver...</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              <div className="pt-6 border-t border-white/5">
                <div className="bg-black/40 rounded-2xl p-4 mb-6 flex justify-between items-center">
                  <span className="text-[10px] font-black text-slate-500 uppercase">Load Capacity</span>
                  <span className="text-white font-black">{selectedIds.length} Items</span>
                </div>
                
                <button 
                  onClick={handleDispatch}
                  disabled={isDispatching || selectedIds.length === 0 || !destBranch || !selectedDriver}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-5 rounded-[24px] flex items-center justify-center gap-3 transition-all disabled:opacity-30 disabled:grayscale uppercase tracking-widest text-xs italic shadow-lg shadow-blue-500/20"
                >
                  {isDispatching ? <RefreshCw className="animate-spin" size={18} /> : <Send size={18} />}
                  Disatch Fleet
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}