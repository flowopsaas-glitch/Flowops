import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

interface SystemMetric {
  status: string;
  _count: { _all: number };
}

export const WaybillDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<SystemMetric[]>([]);
  const [systemLogs, setSystemLogs] = useState<string[]>([]);
  const [socketStatus, setSocketStatus] = useState<'ONLINE' | 'OFFLINE'>('OFFLINE');

  useEffect(() => {
    // 1. Initialize secure client connection targeting the active BroadcastGateway port
    const socket: Socket = io(window.location.origin || 'http://localhost:5173', {
      transports: ['websocket'],
      autoConnect: true,
    });

    socket.on('connect', () => {
      setSocketStatus('ONLINE');
      // Joins the designated company room matching the backend gateway subscription logic
      socket.emit('joinCompanyRoom', { companyId: 'FLOWOPS_CORE_SECTOR' });
    });

    socket.on('disconnect', () => {
      setSocketStatus('OFFLINE');
    });

    // 2. Real-Time Broadcast Subscriptions
    socket.on('SYSTEM_METRICS_UPDATE', (updatedMetrics: SystemMetric[]) => {
      setMetrics(updatedMetrics);
      setSystemLogs((prev) => [`[${new Date().toLocaleTimeString()}] 📊 Metrics re-calculated by AI-Ops.`, ...prev.slice(0, 9)]);
    });

    socket.on('CHAOS_ALERT', (alert: { targetWaybillId: number; timestamp: string }) => {
      setSystemLogs((prev) => [`[${alert.timestamp}] ⚠️ CHAOS INJECTED: Exception state forced on Waybill #${alert.targetWaybillId}`, ...prev.slice(0, 9)]);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 p-8 font-mono">
      {/* Upper Status Row */}
      <div className="flex justify-between items-center mb-8 border-b border-slate-800/80 pb-6">
        <div>
          <div className="text-xs font-bold text-indigo-400 tracking-widest uppercase">System Supervisor Engine</div>
          <h1 className="text-xl font-black tracking-tight text-slate-200 mt-1">TELEMETRY REAL-TIME DATA MATRIX</h1>
        </div>
        <div className="flex items-center gap-3 bg-slate-900/50 px-4 py-2 border border-slate-800 rounded-lg">
          <span className={`h-2.5 w-2.5 rounded-full ${socketStatus === 'ONLINE' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
          <span className="text-xs font-bold tracking-wider text-slate-400">STREAM: {socketStatus}</span>
        </div>
      </div>

      {/* Metrics Layout Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {metrics.length > 0 ? (
          metrics.map((metric, idx) => (
            <div key={idx} className="bg-[#0c1222] border border-slate-800 p-6 rounded-xl shadow-lg">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">{metric.status}</div>
              <div className="text-3xl font-black text-indigo-400 mt-2">{metric._count._all}</div>
            </div>
          ))
        ) : (
          <div className="col-span-3 text-center bg-[#0c1222] border border-slate-800/40 p-8 rounded-xl text-sm text-slate-500">
            Awaiting systemic broadcast array updates from the server runtime...
          </div>
        )}
      </div>

      {/* Real-time Incident Logs Feed */}
      <div className="bg-[#0c1222] border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        <div className="bg-[#090d1a] border-b border-slate-800 px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">
          Live Operational Audit Feed
        </div>
        <div className="p-6 space-y-3 max-h-60 overflow-y-auto">
          {systemLogs.length > 0 ? (
            systemLogs.map((log, index) => (
              <div key={index} className="text-xs font-medium border-l-2 border-indigo-500/50 pl-3 py-1 text-slate-300 bg-slate-950/20 rounded-r">
                {log}
              </div>
            ))
          ) : (
            <div className="text-xs text-slate-600 italic">No incoming diagnostic events logged in this session session.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WaybillDashboard;

