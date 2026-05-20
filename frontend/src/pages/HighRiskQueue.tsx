import React, { useState } from 'react';
import { ShieldAlert, Radio, RefreshCw, AlertTriangle, Eye, ShieldCheck } from 'lucide-react';

export default function HighRiskQueue() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const [anomalies, setAnomalies] = useState([
    { id: 'ANM-2026-9041', threat: 'Geofence Breach Event', sector: 'Sector-ZA-Soweto', detail: 'Vehicle tracker indicated path deviation 3.4km out of active delivery route.', priority: 'CRITICAL', time: '2 mins ago' },
    { id: 'ANM-2026-9042', threat: 'OCR Waybill Tamper Flag', sector: 'Waybill-Inbox Cluster', detail: 'Consignee signature verification pass uniformity failed structure check.', priority: 'HIGH', time: '14 mins ago' },
    { id: 'ANM-2026-9043', threat: 'Unscheduled Stop Detected', sector: 'Sector-ZA-Pretoria', detail: 'Fleet asset delayed in high-crime index area without network query flag.', priority: 'MEDIUM', time: '38 mins ago' }
  ]);

  const runForceSystemPulse = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 900);
  };

  return (
    <div className="p-6 font-mono text-slate-100 min-h-screen bg-[#05030d]">
      {/* Analytical Monitoring Header Block */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-white/10 pb-6 mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 text-rose-400 text-xs tracking-widest font-black uppercase mb-1">
            <Radio size={12} className="animate-pulse text-rose-500" />
            Watchdog Threat Security Loop Active
          </div>
          <h1 className="text-2xl font-black uppercase tracking-wider text-white italic">High-Risk Anomaly Queue</h1>
        </div>
        
        <button 
          onClick={runForceSystemPulse}
          className="flex items-center gap-2 border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 rounded-xl px-4 py-2.5 text-xs text-rose-400 transition-all font-black uppercase tracking-widest"
        >
          <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
          {isRefreshing ? 'Polling Security Nodes...' : 'Force Sector Pulse'}
        </button>
      </div>

      {/* Overview Analytics Banner Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 text-xs">
        <div className="p-4 bg-rose-950/20 border border-rose-500/20 rounded-xl">
          <div className="text-white/40 font-bold uppercase tracking-wider text-[10px]">Critical Exceptions</div>
          <div className="text-xl font-black text-rose-400 mt-1">1 Active</div>
        </div>
        <div className="p-4 bg-amber-950/20 border border-amber-500/20 rounded-xl">
          <div className="text-white/40 font-bold uppercase tracking-wider text-[10px]">High Priority Flags</div>
          <div className="text-xl font-black text-amber-400 mt-1">1 Pending</div>
        </div>
        <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
          <div className="text-white/40 font-bold uppercase tracking-wider text-[10px]">Claw Neural Mesh State</div>
          <div className="text-xl font-black text-emerald-400 mt-1 flex items-center gap-1.5">
            <ShieldCheck size={18} /> Nominal
          </div>
        </div>
      </div>

      {/* Exception Stream Array Feed Items List */}
      <div className="space-y-4">
        {anomalies.map((item) => (
          <div key={item.id} className="border border-white/10 bg-black/30 p-5 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-rose-500/30 transition-all backdrop-blur-xl group">
            <div className="flex items-start gap-4">
              <div className={`p-2.5 rounded-xl border mt-1 shrink-0 ${
                item.priority === 'CRITICAL' ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 animate-pulse' :
                item.priority === 'HIGH' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                'bg-sky-500/10 border-sky-500/30 text-sky-400'
              }`}>
                <ShieldAlert size={16} />
              </div>
              
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black text-white tracking-wider uppercase group-hover:text-rose-400 transition-colors">{item.threat}</span>
                  <span className="text-[9px] font-bold text-white/30 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">{item.id}</span>
                  <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest">{item.sector}</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed max-w-2xl">{item.detail}</p>
              </div>
            </div>

            <div className="flex md:flex-col items-end justify-between w-full md:w-auto border-t md:border-t-0 border-white/5 pt-3 md:pt-0 gap-2 shrink-0">
              <span className={`text-[9px] font-black tracking-widest px-2.5 py-1 rounded-md border ${
                item.priority === 'CRITICAL' ? 'bg-rose-500/20 border-rose-500/40 text-rose-400' :
                item.priority === 'HIGH' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                'bg-sky-500/10 border-sky-500/20 text-sky-400'
              }`}>{item.priority}</span>
              <span className="text-[10px] text-slate-500 font-medium tracking-wide">{item.time}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

