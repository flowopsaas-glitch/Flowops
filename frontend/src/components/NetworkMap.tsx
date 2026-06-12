import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { TransferCargoModal } from './modals/TransferCargoModal';
import { FLOWOPS_API_URL } from '../lib/env';

interface BranchSnapshot {
  id: string;
  name: string;
  code: string;
  totalItems: number;
  statusBreakdown: { status: string; _count: number | { inventory: number } }[];
}

export const NetworkMap: React.FC = () => {
  const [hubs, setHubs] = useState<BranchSnapshot[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);

  const fetchNetwork = async () => {
    try {
      const res = await axios.get(`${FLOWOPS_API_URL}/branches/snapshot`);
      setHubs(res.data);
    } catch (err) {
      console.error("Failed to fetch network snapshot", err);
    }
  };

  useEffect(() => {
    fetchNetwork();
    const interval = setInterval(fetchNetwork, 10000); // 10s refresh for "10x" feel
    return () => clearInterval(interval);
  }, []);

  const handleManage = (branchId: string) => {
    setActiveBranchId(branchId);
    setIsModalOpen(true);
  };

  return (
    <div className="text-white">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {hubs.map((hub) => (
          <div 
            key={hub.id} 
            className="bg-[rgba(13,25,48,0.6)] border border-[rgba(118,166,255,0.15)] p-5 rounded-2xl hover:border-blue-500/50 transition-all group"
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-md font-bold text-slate-100">{hub.name}</h3>
                <span className="text-[10px] text-blue-400 font-black bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 uppercase">
                  {hub.code}
                </span>
              </div>
              <div className="text-right">
                <div className={`text-2xl font-black ${hub.totalItems > 20 ? 'text-orange-400' : 'text-green-400'}`}>
                  {hub.totalItems}
                </div>
                <button 
                  onClick={() => handleManage(hub.id)}
                  className="text-[10px] font-bold text-blue-400 hover:text-white uppercase tracking-tighter transition-colors"
                >
                  Manage Hub →
                </button>
              </div>
            </div>

            <div className="space-y-1.5 mt-4 border-t border-white/5 pt-4">
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-2">Live Status Breakdown</p>
              {hub.statusBreakdown.length > 0 ? (
                hub.statusBreakdown.map((s, idx) => (
                  <div key={idx} className="flex justify-between text-xs items-center">
                    <span className="text-slate-400 font-medium">{s.status}</span>
                    <span className="font-mono bg-white/5 px-2 rounded text-slate-200">
                      {typeof s._count === 'number' ? s._count : (s._count as any).inventory || 0}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-[11px] text-slate-600 italic">No active inventory</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 🚛 The Transfer Modal */}
      {isModalOpen && activeBranchId && (
        <TransferCargoModal
  isOpen={true}
          // For now, passing a dummy array. In Step 2 we'll link real Waybill selectors
          selectedWaybills={[]} 
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            setIsModalOpen(false);
            fetchNetwork();
          }}
        />
      )}
    </div>
  );
};