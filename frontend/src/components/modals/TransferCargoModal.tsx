import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { X, ArrowRightLeft, Loader2, AlertCircle } from 'lucide-react';
import { useToast } from '../ToastProvider';

interface TransferCargoModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedWaybills: any[]; 
  onSuccess: () => void;
}

export const TransferCargoModal: React.FC<TransferCargoModalProps> = ({ 
  isOpen, 
  onClose, 
  selectedWaybills, 
  onSuccess 
}) => {
  const [branches, setBranches] = useState([]);
  const [destinationId, setDestinationId] = useState('');
  const [loading, setLoading] = useState(false);

  // 🛡️ Logic: Identify the source hub from the first selected item
  const sourceHubId = selectedWaybills[0]?.currentBranchId;
  const sourceHubName = selectedWaybills[0]?.currentBranch?.name || "Selected Hub";

  useEffect(() => {
    if (isOpen) {
      axios.get('http://localhost:3000/api/branches/snapshot')
        .then(res => setBranches(res.data))
        .catch(err => console.error("Failed to fetch branches", err));
    }
  }, [isOpen]);

  const { showToast } = useToast();

  const handleTransfer = async () => {
    if (!destinationId) return;
    
    setLoading(true);
    try {
      const waybillIds = selectedWaybills.map(w => w.id);
      
      const response = await axios.post('http://localhost:3000/api/branches/linehaul', {
        waybillIds,
        destinationBranchId: destinationId
      });

      const manifestId = response.data.id;
      window.open(`http://localhost:3000/api/branches/manifest/${manifestId}/pdf`, '_blank');

      onSuccess();
      onClose();
    } catch (err) {
      console.error("Transfer error:", err);
      showToast("System failed to generate manifest. Check backend logs.", "error");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="bg-slate-900 border border-white/10 w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-white/5 flex justify-between items-center">
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <ArrowRightLeft className="text-blue-500" size={20} />
            Ship Inter-Branch
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-8">
          <div className="mb-6 bg-blue-500/5 border border-blue-500/10 p-4 rounded-2xl">
            <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1 block">Origin Hub</label>
            <div className="text-lg font-bold text-white">{sourceHubName}</div>
            <div className="text-[10px] text-blue-300/50 font-mono mt-1">Cargo Count: {selectedWaybills.length} Items</div>
          </div>

          <div className="mb-8">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Destination Branch</label>
            <select 
              className="w-full bg-slate-800 border border-white/10 p-4 rounded-xl text-white font-bold focus:border-blue-500 outline-none appearance-none"
              value={destinationId}
              onChange={(e) => setDestinationId(e.target.value)}
            >
              <option value="">Select Target...</option>
              {branches
                .filter((b: any) => b.id !== sourceHubId) // 🚀 This line no longer crashes!
                .map((b: any) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))
              }
            </select>
          </div>

          <button 
            onClick={handleTransfer}
            disabled={loading || !destinationId}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 p-5 rounded-2xl text-white font-black transition-all flex items-center justify-center gap-3"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : "Finalize & Print Manifest"}
          </button>
        </div>
      </div>
    </div>
  );
};
