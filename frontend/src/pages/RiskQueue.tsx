import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useToast } from '../components/ToastProvider';
import { 
  ShieldAlert, CheckCircle, Clock, 
  ArrowRight, RefreshCw, Zap, UserCheck
} from 'lucide-react';

export default function RiskQueue() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRisks = async () => {
    try {
      setLoading(true);
      const res = await api.get('/ai-events'); 
      setEvents(res.data || []);
    } catch (err) {
      console.error("❌ RISK_FETCH_FAILED:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRisks();
  }, []);

  const handleResolve = async (id: number | string) => {
    try {
      await api.post(`/ai-events/${id}/resolve`, {
        resolutionNote: "System anomaly corrected via manual intervention."
      });
      fetchRisks(); 
    } catch (err) {
      console.error("❌ RESOLUTION_FAILED:", err);
    }
  };

  // 🚀 THE NEW AUTO-PILOT EXECUTION
  const { showToast } = useToast();

  const handleAutoAssign = async (eventId: number | string) => {
    try {
      // Assuming '1' is the ID for your seeded test driver
      const targetDriverId = 1; 
      
      // 1. Hit the new backend route we just built!
      await api.post(`/drivers-dispatch/${targetDriverId}/assign-bulk`, { eventId });
      
      // 2. Resolve the anomaly to clear it from the board
      await api.post(`/ai-events/${eventId}/resolve`, {
        resolutionNote: "AI Auto-Pilot successfully dispatched recovery driver."
      });
      
      // 3. Refresh the UI
      fetchRisks();
    } catch (err) {
      console.error("❌ AUTO_ASSIGN_FAILED:", err);
      showToast("Failed to auto-assign. Check browser console and terminal logs.", "error");
    }
  };

  return (
    <div className="p-8 space-y-8 text-white min-h-screen bg-[#020817]">
      <header className="flex justify-between items-end">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-red-500/10 rounded-2xl border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]">
              <ShieldAlert className="text-red-500 animate-pulse" size={32} />
            </div>
            <div>
              <h1 className="text-4xl font-black italic uppercase tracking-tighter leading-none">Risk Queue</h1>
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] mt-2">
                Operational Anomalies & AI Decision Support
              </p>
            </div>
          </div>
        </div>
        
        <button 
          onClick={fetchRisks} 
          className="p-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all flex items-center gap-2 group"
        >
          <RefreshCw size={16} className={`group-hover:text-blue-400 ${loading ? 'animate-spin' : ''}`} />
          <span className="text-[10px] font-black uppercase tracking-widest">Refresh Sync</span>
        </button>
      </header>

      {/* 📋 RISK LEDGER TABLE */}
      <div className="bg-white/[0.02] border border-white/5 rounded-[40px] overflow-hidden shadow-2xl backdrop-blur-md">
        <table className="w-full text-left border-separate border-spacing-0">
          <thead>
            <tr className="bg-white/[0.03] border-b border-white/5">
              <th className="p-6 text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] border-b border-white/5">Severity</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] border-b border-white/5">Intelligence Summary</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-500 text-right tracking-[0.2em] border-b border-white/5">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {events.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-24 text-center">
                   <div className="p-6 bg-emerald-500/5 rounded-full inline-block mb-4">
                     <CheckCircle size={48} className="text-emerald-500/30" />
                   </div>
                   <p className="text-slate-500 font-black uppercase text-xs tracking-widest leading-relaxed">
                     Operational Shield 100% Intact.<br/>No anomalies detected.
                   </p>
                </td>
              </tr>
            ) : (
              events.map((event) => (
                <tr key={event.id} className="group transition-all hover:bg-white/[0.03]">
                  <td className="p-6 align-top">
                    <div className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase inline-block tracking-widest ${
                      event.severity === 'HIGH' ? 'bg-red-500/20 text-red-500 border border-red-500/30' : 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30'
                    }`}>
                      {event.severity} RISK
                    </div>
                  </td>
                  <td className="p-6">
                    <div className="flex flex-col gap-4">
                      <div>
                        <div className="font-black text-white text-lg tracking-tight uppercase italic group-hover:text-blue-400 transition-colors">
                          {event.type || event.title || 'SYSTEM_ANOMALY'}
                        </div>
                        <p className="text-slate-400 text-xs font-bold leading-relaxed max-w-xl mt-1">
                          {event.message || event.summary}
                        </p>
                        <div className="flex items-center gap-2 mt-4 text-[9px] font-black text-slate-600 uppercase tracking-widest">
                          <Clock size={12} /> {new Date(event.createdAt).toLocaleString()}
                        </div>
                      </div>

                      {/* 🚀 AI DECISION SUPPORT PANEL */}
                      <div className="p-4 bg-blue-600/10 border border-blue-500/20 rounded-2xl flex items-start gap-4">
                        <div className="p-2 bg-blue-500/20 rounded-lg">
                          <Zap size={16} className="text-blue-400 animate-pulse" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">AI Recommendation</p>
                          <p className="text-xs font-bold text-white leading-tight">
                            {event.suggestion || "Fleet monitoring active. Awaiting driver telemetry."}
                          </p>
                          
                          {/* 🚀 THE AUTO-ASSIGN TRIGGER */}
                          <button 
                            onClick={() => handleAutoAssign(event.id)}
                            className="mt-3 flex items-center gap-1.5 text-[9px] font-black text-blue-500 uppercase hover:text-white transition-colors"
                          >
                            <UserCheck size={12} /> Execute Auto-Assign & Clear
                          </button>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-6 text-right align-top">
                    <button 
                      onClick={() => handleResolve(event.id)}
                      className="bg-emerald-600/10 border border-emerald-500/20 text-emerald-500 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:bg-emerald-500 hover:text-white shadow-lg flex items-center gap-2 ml-auto"
                    >
                      Manual Override <ArrowRight size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
