import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Activity, ArrowRightLeft, PackageCheck } from 'lucide-react';

export const ActivityFeed: React.FC = () => {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const fetchLogs = () => api.get<any, any>(`/dashboard/activities`).then(res => setLogs(res));
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-slate-900/50 border border-white/10 rounded-3xl p-6 h-full backdrop-blur-sm">
      <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
        <Activity size={16} className="text-blue-500" /> Live Ops Feed
      </h3>
      <div className="space-y-4">
        {logs.map((log: any) => (
          <div key={log.id} className="flex gap-4 items-start border-l-2 border-blue-500/20 pl-4 py-1">
            <div className="mt-1">
              {log.type === 'MOVEMENT' ? <ArrowRightLeft size={14} className="text-blue-400" /> : <PackageCheck size={14} className="text-green-400" />}
            </div>
            <div>
              <p className="text-xs text-slate-200 font-medium leading-relaxed">{log.message}</p>
              <span className="text-[10px] text-slate-500 font-mono">{new Date(log.createdAt).toLocaleTimeString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};