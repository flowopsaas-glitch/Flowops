import React, { useState } from 'react';
import { Cpu, HardDrive, Plus, Radio, ShieldAlert } from 'lucide-react';
import { api } from '../../../api/client';

export default function BranchHardware() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [devices, setDevices] = useState([
    { id: 'HW-NODE-019', device: 'Zebra TC21 Scanner', branch: 'Johannesburg Core Hub', trackingId: 'FL-SCN-01', state: 'ONLINE' },
    { id: 'HW-NODE-024', device: 'Honeywell ScanPal', branch: 'Pretoria Distribution Center', trackingId: 'FL-SCN-05', state: 'ONLINE' }
  ]);

  const handleAutoRegisterNode = async () => {
    setIsRegistering(true);
    try {
      const response = await api.post('/api/v2/hardware/auto-register', { platform: 'FlowOps-ClawMesh' });
      if (response.data) {
        setDevices(prev => [...prev, {
          id: `HW-NODE-0${Math.floor(Math.random() * 90) + 10}`,
          device: 'Auto-Discovered Scanner Node',
          branch: 'Localized Active Sector',
          trackingId: 'FL-SCN-NEW',
          state: 'ONLINE'
        }]);
      }
    } catch (err) {
      console.error("Hardware Auto-Registration Failure", err);
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="animate-in slide-in-from-right-4 fade-in duration-300 space-y-6 font-mono text-xs text-slate-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-black/40 border border-white/5 p-6 rounded-[24px] gap-4">
        <div>
          <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Cpu size={14} className="text-cyan-400" /> Dynamic Asset Discovered Hardware Mesh
          </h3>
          <p className="text-white/40 text-[11px] mt-1">Manage and provision edge logistics tracking hardware scanner units.</p>
        </div>
        <button 
          onClick={handleAutoRegisterNode}
          disabled={isRegistering}
          className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-900 text-white font-black uppercase tracking-widest px-4 py-2.5 rounded-xl text-[10px] transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)] shrink-0"
        >
          {isRegistering ? 'Scanning Channels...' : 'Auto-Register Node'}
        </button>
      </div>

      <div className="border border-white/10 bg-black/20 rounded-2xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white/5 border-b border-white/10 text-cyan-400 font-black tracking-widest uppercase text-[10px]">
              <th className="p-4">Node ID</th>
              <th className="p-4">Device Model</th>
              <th className="p-4">Branch Placement</th>
              <th className="p-4">Internal Tracking Identifier</th>
              <th className="p-4">State</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {devices.map((dev) => (
              <tr key={dev.id} className="hover:bg-white/5 transition-colors">
                <td className="p-4 font-bold text-white flex items-center gap-2">
                  <HardDrive size={12} className="text-cyan-500/50" />
                  {dev.id}
                </td>
                <td className="p-4 text-slate-200">{dev.device}</td>
                <td className="p-4 text-slate-400">{dev.branch}</td>
                <td className="p-4 text-slate-400 font-bold">{dev.trackingId}</td>
                <td className="p-4">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black tracking-wider bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                    <Radio size={10} className="animate-pulse" /> {dev.state}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

