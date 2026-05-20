import React, { useState, useEffect } from 'react';
// ✅ FIXED: Adjusted relative paths to correctly reach src/api and src/components
import { api } from '../api/client'; 
import { Cpu, RefreshCw, Printer, ScanLine, CheckCircle2, Search } from "lucide-react";
import { useToast } from "../components/ToastProvider";

export default function BranchHardware() {
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const { showToast } = useToast();

  const fetchHardware = async () => {
    try {
      setLoading(true);
      const res = await api.get('/v2/hardware');
      setDevices(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Hardware fetch failed", err);
      // Fallback to empty to prevent blank page crashes
      setDevices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHardware(); }, []);

  const scanForNewHardware = async () => {
    if (!('usb' in navigator)) {
      showToast("WebUSB not supported in this browser.", "error");
      return;
    }

    setScanning(true);
    try {
      // @ts-ignore
      const device = await navigator.usb.requestDevice({ filters: [] });
      
      const payload = {
        name: device.productName || 'Unknown Device',
        deviceType: device.productName?.toLowerCase().includes('printer') ? 'PRINTER' : 'SCANNER',
        vendorId: device.vendorId.toString(),
        productId: device.productId.toString(),
        serialNumber: device.serialNumber || 'N/A'
      };

      await api.post('/v2/hardware/auto-register', payload);
      fetchHardware();
      showToast(`Device Linked: ${payload.name}`, "success");
    } catch (err) {
      console.warn("Scan cancelled or failed.");
    } finally {
      setScanning(false);
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-20 space-y-4">
      <RefreshCw className="animate-spin text-cyan-500" size={32} />
      <span className="text-[10px] font-black text-cyan-500 uppercase tracking-[0.2em]">Synchronizing Hardware Mesh...</span>
    </div>
  );

  return (
    <div className="animate-in slide-in-from-right-4 fade-in duration-300 space-y-6">
      <div className="flex justify-between items-end mb-4">
        <div>
          <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">Hardware Registry</h3>
          <p className="text-white/40 text-[10px] uppercase font-bold tracking-widest">Station Peripheral Management</p>
        </div>
        <button 
          onClick={scanForNewHardware}
          disabled={scanning}
          className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg shadow-cyan-500/20"
        >
          {scanning ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
          Scan Local Mesh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {devices.length === 0 ? (
          <div className="col-span-2 p-12 rounded-[32px] border-2 border-dashed border-white/5 bg-white/[0.02] text-center">
            <Cpu size={48} className="mx-auto text-white/10 mb-4" />
            <p className="text-white/30 text-sm font-medium italic">No peripheral nodes detected.</p>
            <p className="text-white/20 text-[10px] uppercase tracking-wighter mt-1 font-bold">Connect a USB printer or scanner to authorize</p>
          </div>
        ) : (
          devices.map((d: any) => (
            <div key={d.id} className="p-5 rounded-3xl border border-white/10 bg-black/40 flex items-center justify-between group hover:border-cyan-500/50 transition-all shadow-xl">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl bg-white/5 text-cyan-400 group-hover:bg-cyan-500/10 transition-colors shadow-inner">
                  {d.deviceType === 'PRINTER' ? <Printer size={20} /> : <ScanLine size={20} />}
                </div>
                <div>
                  <div className="text-sm font-bold text-white tracking-tight">{d.name}</div>
                  <div className="text-[10px] text-white/40 font-mono">ID: {d.vendorId}:{d.productId}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-emerald-400 text-[9px] font-black uppercase bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                <CheckCircle2 size={12} /> {d.status || 'Verified'}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
