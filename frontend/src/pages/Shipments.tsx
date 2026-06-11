import React, { useEffect, useState } from 'react';
import { api } from '../api/client'; 
import { 
  FileText, 
  MapPin, 
  Eye, 
  Truck,
  AlertCircle
} from 'lucide-react';
import EvidenceModal from '../components/Shipments/EvidenceModal';

interface Waybill {
  id: number;
  waybillNumber: string;
  status: string;
  recipient: string;
  signatureUrl: string | null;
  imageUrl: string | null;
  createdAt: string;
  currentBranch?: { name: string };
}

export default function ShipmentsPage() {
  const [waybills, setWaybills] = useState<Waybill[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedWaybill, setSelectedWaybill] = useState<Waybill | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // FIXED: Backend currently returning 404 or non-array data in some states
      const { data } = await api.get('/waybills');
      
      // 🛡️ Safety Bridge: Ensures waybills is always an array to prevent .map() crashes
      setWaybills(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("OPERATIONAL_CLAW_ERROR:", err);
      setWaybills([]); // Fallback to empty state on fetch failure
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { 
    fetchData(); 
  }, []);

  const openEvidence = (wb: Waybill) => {
    setSelectedWaybill(wb);
    setIsModalOpen(true);
  };

  // Helper to count active linehauls safely
  const activeLinehauls = Array.isArray(waybills) 
    ? waybills.filter(w => w.status === 'IN_TRANSIT').length 
    : 0;

  return (
    <div className="min-h-full bg-[#07111f] p-8">
      {/* Header Area */}
      <div className="flex justify-between items-end mb-10">
        <div>
          <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em] mb-2">
            Operations Table
          </p>
          <h1 className="text-4xl font-black text-white tracking-tighter">
            Shipments & Logistics
          </h1>
        </div>
        <button className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-2xl flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all active:scale-95">
          <Truck size={18} /> Initiate Linehaul ({activeLinehauls})
        </button>
      </div>

      {/* The Table */}
      <div className="rounded-[30px] border border-white/10 bg-white/5 overflow-hidden backdrop-blur-md shadow-2xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              <th className="p-5 text-[10px] font-black text-white/40 uppercase tracking-widest">Waybill / ID</th>
              <th className="p-5 text-[10px] font-black text-white/40 uppercase tracking-widest">Current Hub</th>
              <th className="p-5 text-[10px] font-black text-white/40 uppercase tracking-widest">Status</th>
              <th className="p-5 text-[10px] font-black text-white/40 uppercase tracking-widest">Evidence</th>
              <th className="p-5 text-[10px] font-black text-white/40 uppercase tracking-widest text-right">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? (
               <tr>
                <td colSpan={5} className="p-20 text-center">
                  <div className="animate-pulse flex flex-col items-center gap-2">
                    <div className="h-2 w-48 bg-blue-500/20 rounded-full mb-2" />
                    <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Hydrating Dashboard...</p>
                  </div>
                </td>
              </tr>
            ) : Array.isArray(waybills) && waybills.length > 0 ? (
              waybills.map((wb) => (
                <tr key={wb.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="p-5">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                        <FileText className="text-blue-400 h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-white font-bold text-sm tracking-tight">{wb.waybillNumber}</p>
                        <p className="text-[10px] font-mono text-white/30 uppercase">UUID: {wb.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-5">
                    <div className="flex items-center gap-2 text-white/60 text-xs font-medium">
                      <MapPin size={14} className="text-blue-500" />
                      {wb.currentBranch?.name || 'Unassigned Hub'}
                    </div>
                  </td>
                  <td className="p-5">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                      wb.status === 'DELIVERED' 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                        : 'bg-pink-500/10 text-pink-400 border-pink-500/20'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${wb.status === 'DELIVERED' ? 'bg-emerald-400' : 'bg-pink-400'}`} />
                      {wb.status}
                    </span>
                  </td>
                  <td className="p-5">
                    {wb.status === 'DELIVERED' ? (
                      <button 
                        onClick={() => openEvidence(wb)}
                        className="flex items-center gap-2 text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors uppercase tracking-widest"
                      >
                        <Eye size={14} /> View POD
                      </button>
                    ) : (
                      <span className="text-[10px] font-bold text-white/10 uppercase tracking-widest italic">In Transit</span>
                    )}
                  </td>
                  <td className="p-5 text-right">
                    <p className="text-white/40 text-xs font-medium">
                      {wb.createdAt ? new Date(wb.createdAt).toLocaleDateString() : 'N/A'}
                    </p>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="p-24 text-center">
                  <div className="flex flex-col items-center gap-4 opacity-40">
                    <AlertCircle size={40} className="text-pink-500" />
                    <div className="space-y-1">
                      <p className="text-[11px] font-black uppercase tracking-[0.4em] text-white">
                        Signal Lost: No Waybills Found
                      </p>
                      <p className="text-[9px] font-mono text-blue-400">
                        Check API endpoint /waybills or database sync state
                      </p>
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 🖼️ The Signature Viewer Modal */}
      {selectedWaybill && (
        <EvidenceModal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          waybillId={selectedWaybill.id} 
          signatureUrl={selectedWaybill.signatureUrl} 
          imageUrl={selectedWaybill.imageUrl}
          waybillNumber={selectedWaybill.waybillNumber} 
        />
      )}
    </div>
  );
}
