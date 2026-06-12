import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { ShieldCheck, Activity, AlertCircle, Clock } from 'lucide-react';

interface AuditLog {
  id: string;
  actionType: string;
  entityType: string;
  entityId: string;
  reason: string;
  outcome: string;
  timestamp: string;
}

export default function AiAudit() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      const res = await api.get<any, any>(`/ai-audit/logs`, { params: { companyId: 1 } }); // Replace with actual companyId
      setLogs(res);
    } catch (err) {
      console.error("Failed to fetch logs", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-8 bg-slate-950 min-h-screen text-slate-200">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <ShieldCheck className="text-emerald-400 w-8 h-8" />
            CLAW_4 Operational Ledger
          </h1>
          <p className="text-slate-400 mt-1">Real-time autonomous intervention history</p>
        </div>
        
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-full">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <span className="text-emerald-400 font-mono text-sm font-bold">OVERSEER LIVE</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard title="Auto-Resolutions" value={logs.filter(l => l.outcome === 'SUCCESS').length} icon={<Activity className="text-blue-400" />} />
        <StatCard title="System Skips" value={logs.filter(l => l.outcome === 'SKIPPED').length} icon={<Clock className="text-amber-400" />} />
        <StatCard title="Failed Attempts" value={logs.filter(l => l.outcome === 'FAILED').length} icon={<AlertCircle className="text-rose-400" />} />
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-widest">
              <th className="p-4">Timestamp</th>
              <th className="p-4">Action</th>
              <th className="p-4">Target</th>
              <th className="p-4">Reason/Logic</th>
              <th className="p-4">Outcome</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="p-4 text-slate-500 font-mono text-sm">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </td>
                <td className="p-4">
                  <span className="px-2 py-1 bg-slate-800 rounded text-xs font-semibold">
                    {log.actionType}
                  </span>
                </td>
                <td className="p-4 text-sm font-medium">
                  {log.entityType} <span className="text-slate-500 font-normal">#{log.entityId.replace('repair_', '')}</span>
                </td>
                <td className="p-4 text-sm text-slate-400 italic">
                  "{log.reason}"
                </td>
                <td className="p-4 text-right">
                  <StatusBadge outcome={log.outcome} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ outcome }: { outcome: string }) {
  const styles: any = {
    SUCCESS: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    FAILED: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    SKIPPED: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${styles[outcome] || styles.FAILED}`}>
      {outcome}
    </span>
  );
}

function StatCard({ title, value, icon }: { title: string, value: number, icon: any }) {
  return (
    <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">{title}</p>
          <h3 className="text-3xl font-bold mt-1">{value}</h3>
        </div>
        <div className="bg-slate-800 p-2 rounded-lg">{icon}</div>
      </div>
    </div>
  );
}
