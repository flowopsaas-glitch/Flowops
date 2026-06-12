import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { CheckCircle, FileSearch, Trash2, Loader2, X, RefreshCw } from 'lucide-react';
import { FLOWOPS_HTTP_ORIGIN } from '../../lib/env';

interface Props {
  item: any;
  onClose: () => void;
  onCommitted: () => void;
}

const InboxCorrection: React.FC<Props> = ({ item, onClose, onCommitted }) => {
  // Use fileUrl (matching your Prisma schema)
  const assetUrl = `${FLOWOPS_HTTP_ORIGIN}${item.fileUrl}`;
  
  const [formData, setFormData] = useState({
    waybillNumber: item.waybillNumber || '',
    consignee: item.recipient || '',
    address: item.address || '',
    weight: item.weight || '',
    pieces: item.pieces || ''
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleChange = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value });
  };

  const commitToSystem = async () => {
    setIsSaving(true);
    try {
      await api.post<any, any>(`/waybills/inbox/${item.id}/commit`, formData);
      onCommitted();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const rejectWaybill = async () => {
    if (!window.confirm("Discard this asset?")) return;
    setIsDeleting(true);
    try {
      await api.delete<any, any>(`/waybills/inbox/${item.id}`);
      onCommitted();
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex h-[82vh] gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700 relative">
      <button 
        onClick={onClose}
        className="absolute -top-12 right-0 h-10 w-10 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center border border-white/10 text-white/40 hover:text-white transition-all z-50"
      >
        <X size={20} />
      </button>

      {/* 🖼️ Asset Preview - Switched to <img> for better JPEG support */}
      <div className="flex-1 bg-black/40 rounded-[40px] border border-white/10 overflow-hidden relative shadow-2xl flex items-center justify-center">
        <div className="absolute top-6 left-6 z-10 bg-black/80 backdrop-blur-xl px-5 py-2.5 rounded-full flex items-center gap-2 border border-white/10">
          <FileSearch size={14} className="text-blue-400" />
          <span className="text-[10px] font-black text-white uppercase tracking-widest">Document Source</span>
        </div>
        
        <img 
          src={assetUrl} 
          className="max-w-full max-h-full object-contain p-4"
          alt="Waybill Source"
          onError={(e) => {
            console.error("Image load failed:", assetUrl);
            (e.target as HTMLImageElement).src = 'https://via.placeholder.com/800x1000?text=Image+Load+Error';
          }}
        />
      </div>

      {/* Control Panel */}
      <div className="w-[480px] bg-white/5 rounded-[40px] border border-white/10 p-10 flex flex-col gap-8 backdrop-blur-3xl shadow-2xl">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tighter">Metadata Audit</h2>
          <p className="text-[10px] text-blue-500 uppercase font-black tracking-[0.3em] mt-1">Operator Verification</p>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto pr-4 custom-scrollbar">
          {item.status === 'EXTRACTING' ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
              <RefreshCw className="text-blue-500 animate-spin" size={40} />
              <p className="text-[10px] font-black text-white uppercase tracking-[0.3em]">AI Brain Thinking...</p>
            </div>
          ) : (
            Object.entries(formData).map(([key, value]) => (
              <div key={key} className="space-y-2">
                <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">
                  {key.replace(/([A-Z])/g, ' $1')}
                </label>
                <input
                  type="text"
                  value={value as string}
                  onChange={(e) => handleChange(key, e.target.value)}
                  placeholder="Awaiting input..."
                  className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-6 py-4 text-white font-bold focus:border-blue-500 transition-all outline-none placeholder:text-white/10"
                />
              </div>
            ))
          )}
        </div>

        <div className="flex gap-4">
          <button
            onClick={rejectWaybill}
            disabled={isDeleting || isSaving}
            className="flex-1 py-5 bg-white/5 hover:bg-red-500/20 text-red-500 font-black rounded-2xl border border-red-500/20 transition-all text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"
          >
            {isDeleting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
            Discard
          </button>

          <button
            onClick={commitToSystem}
            disabled={isSaving || isDeleting || item.status === 'EXTRACTING'}
            className="flex-[2] py-5 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl shadow-2xl shadow-blue-500/20 transition-all text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-30"
          >
            {isSaving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
            Commit to Ledger
          </button>
        </div>
      </div>
    </div>
  );
};

export default InboxCorrection;