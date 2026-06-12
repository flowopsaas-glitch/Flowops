import React from 'react';
import { X, ExternalLink, FileDown, Scan, PenTool } from 'lucide-react';
import { FLOWOPS_HTTP_ORIGIN } from '../../lib/env';

interface EvidenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  waybillId: number; 
  signatureUrl: string | null;
  imageUrl?: string | null;
  waybillNumber: string;
}

const EvidenceModal: React.FC<EvidenceModalProps> = ({ 
  isOpen, 
  onClose, 
  waybillId, 
  signatureUrl, 
  imageUrl,
  waybillNumber 
}) => {
  if (!isOpen) return null;

  // Origin without `/api`, used for asset/PDF download URLs.
  const BASE_URL = FLOWOPS_HTTP_ORIGIN;

  const downloadReceipt = () => {
    window.open(`${BASE_URL}/api/waybills/${waybillId}/receipt`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-[#1e293b] border border-white/10 rounded-[30px] w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
        
        {/* Sticky Header */}
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5 shrink-0">
          <div>
            <h3 className="text-white font-black text-xl tracking-tight">Delivery Evidence</h3>
            <p className="text-blue-500 font-mono text-[10px] font-black uppercase tracking-widest">{waybillNumber}</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-white/10 rounded-xl text-white/50 hover:text-white transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Area - Using a custom scrollbar for that tech look */}
        <div className="p-8 flex flex-col gap-8 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          
          {/* Section 1: Scanned Document */}
          <div className="space-y-3">
            <h4 className="text-[10px] text-slate-500 uppercase font-black tracking-[0.2em] flex items-center gap-2">
              <Scan size={14} className="text-blue-500" /> 1. Office Scan (Physical Record)
            </h4>
            <div className="w-full bg-slate-900/50 rounded-2xl flex items-center justify-center p-4 border border-white/5 overflow-hidden min-h-[250px]">
              {imageUrl ? (
                <img 
                  src={`${BASE_URL}${imageUrl}`} 
                  alt="Scanned Document" 
                  className="max-h-[400px] w-auto object-contain rounded-lg shadow-lg hover:scale-[1.02] transition-transform duration-300"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    // Optional: Show a "Missing File" placeholder if the URL exists but image fails
                  }}
                />
              ) : (
                <div className="flex flex-col items-center opacity-40">
                   <Scan size={32} className="mb-2 text-slate-600" />
                   <p className="text-slate-500 text-xs italic tracking-wide">No physical document attached.</p>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Driver Signature */}
          <div className="space-y-3">
            <h4 className="text-[10px] text-slate-500 uppercase font-black tracking-[0.2em] flex items-center gap-2">
              <PenTool size={14} className="text-emerald-500" /> 2. Proof of Delivery (Digital)
            </h4>
            <div className="w-full aspect-video bg-white rounded-2xl flex items-center justify-center p-6 border border-white/5 group relative">
              {signatureUrl ? (
                <img 
                  src={`${BASE_URL}${signatureUrl}`} 
                  alt="POD Signature" 
                  className="max-h-full object-contain filter invert opacity-90 group-hover:opacity-100 transition-opacity"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              ) : (
                <div className="text-center opacity-40">
                  <p className="text-slate-900 italic text-xs mb-1">Awaiting Signature...</p>
                  <p className="text-[9px] text-slate-800 uppercase font-black tracking-tighter">PENDING_POD_UPLOAD</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-8 pt-0 mt-auto shrink-0">
          <div className="space-y-4 pt-6 border-t border-white/5">
            <button 
              onClick={downloadReceipt}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl shadow-xl shadow-blue-500/10 transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-[10px] group active:scale-[0.98]"
            >
              <FileDown size={18} className="group-hover:translate-y-0.5 transition-transform" />
              Generate Official POD Receipt
            </button>

            <div className="flex items-center justify-center gap-6">
              {imageUrl && (
                <a href={`${BASE_URL}${imageUrl}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[10px] font-black text-slate-500 hover:text-blue-400 transition-colors uppercase tracking-widest">
                  View Full Scan <ExternalLink size={12} />
                </a>
              )}
              {signatureUrl && (
                <a href={`${BASE_URL}${signatureUrl}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[10px] font-black text-slate-500 hover:text-blue-400 transition-colors uppercase tracking-widest">
                  Full Signature <ExternalLink size={12} />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EvidenceModal;
