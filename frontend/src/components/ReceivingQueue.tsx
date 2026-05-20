import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Truck, CheckCircle, Package } from 'lucide-react';
import { useToast } from './ToastProvider';

export const ReceivingQueue: React.FC = () => {
  const [manifests, setManifests] = useState([]);

  const fetchIncoming = async () => {
    const res = await axios.get('http://localhost:3000/api/branches/manifests/incoming');
    setManifests(res.data);
  };

  useEffect(() => {
    fetchIncoming();
    const timer = setInterval(fetchIncoming, 15000);
    return () => clearInterval(timer);
  }, []);

  const { showToast } = useToast();

  const handleReceive = async (id: string) => {
    try {
      await axios.post(`http://localhost:3000/api/branches/manifest/${id}/receive`);
      fetchIncoming();
      showToast("Manifest received successfully! Inventory updated.", "success");
    } catch (err) {
      console.error("Reception failed", err);
      showToast("Failed to receive manifest. Check backend logs.", "error");
    }
  };

  if (manifests.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="text-xl font-black text-white mb-4 flex items-center gap-2">
        <Truck className="text-blue-500" size={20} />
        Incoming Inter-Branch Transfers
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {manifests.map((m: any) => (
          <div key={m.id} className="bg-slate-900 border border-white/10 p-5 rounded-2xl flex justify-between items-center group">
            <div className="flex gap-4 items-center">
              <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20 text-blue-400">
                <Package size={24} />
              </div>
              <div>
                <div className="text-xs font-black text-slate-500 uppercase tracking-widest">Manifest {m.manifestNumber}</div>
                <div className="text-sm font-bold text-white">
                  {m.sourceBranch.name} → <span className="text-blue-400">{m.destinationBranch.name}</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1 font-mono uppercase">
                  Cargo: {m._count.waybills} Items
                </div>
              </div>
            </div>
            
            <button 
              onClick={() => handleReceive(m.id)}
              className="bg-green-600/10 hover:bg-green-600 text-green-500 hover:text-white border border-green-600/20 p-3 rounded-xl transition-all flex items-center gap-2 text-xs font-bold"
            >
              <CheckCircle size={16} />
              Check-In Cargo
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};