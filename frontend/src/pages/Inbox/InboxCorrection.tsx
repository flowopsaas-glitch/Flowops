import React, { useState } from 'react';
import axios from 'axios';
import { CheckCircle, AlertCircle, Save, FileSearch } from 'lucide-react';
import { FLOWOPS_API_URL, FLOWOPS_HTTP_ORIGIN } from '../../lib/env';

interface InboxItem {
  id: number;
  originalFileUrl: string;
  extractedData: any; // This comes from your OpenAI/Local OCR services
  status: string;
}

interface Props {
  item: InboxItem;
  onCommitted: () => void;
}

const InboxCorrection: React.FC<Props> = ({ item, onCommitted }) => {
  const [formData, setFormData] = useState(item.extractedData || {});
  const [isSaving, setIsSaving] = useState(false);

  // 📝 Manual Override: Allow operator to correct AI mistakes
  const handleChange = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value });
  };

  const commitToSystem = async () => {
    setIsSaving(true);
    try {
      // 📡 Hitting your existing commit endpoint verified in the logs
      await axios.post(`${FLOWOPS_API_URL}/waybills/inbox/${item.id}/commit`, formData);
      onCommitted();
    } catch (err) {
      console.error("Commit failed:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-[80vh] gap-6 p-2">
      {/* 🖼️ Original Asset View */}
      <div className="flex-1 bg-slate-900 rounded-3xl border border-white/10 overflow-hidden relative group">
        <div className="absolute top-4 left-4 z-10 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/10">
          <FileSearch size={14} className="text-blue-400" />
          <span className="text-[10px] font-black text-white uppercase tracking-widest">Source Document</span>
        </div>
        <iframe 
          src={`${FLOWOPS_HTTP_ORIGIN}${item.originalFileUrl}`} 
          className="w-full h-full border-none"
          title="Waybill Source"
        />
      </div>

      {/* ✍️ Operator Correction Form */}
      <div className="w-[400px] bg-white/5 rounded-3xl border border-white/10 p-6 flex flex-col gap-6 backdrop-blur-xl">
        <div>
          <h2 className="text-xl font-black text-white tracking-tighter">Field Verification</h2>
          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-[0.2em]">Operator Correction Handle</p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar">
          {Object.keys(formData).map((key) => (
            <div key={key} className="space-y-1.5">
              <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest ml-1">{key.replace(/([A-Z])/g, ' $1')}</label>
              <input
                type="text"
                value={formData[key] || ''}
                onChange={(e) => handleChange(key, e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-medium focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none"
              />
            </div>
          ))}
        </div>

        <button
          onClick={commitToSystem}
          disabled={isSaving}
          className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white font-black rounded-2xl shadow-xl shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-xs"
        >
          {isSaving ? (
            <span className="flex items-center gap-2 animate-pulse"><Save size={18} /> Committing...</span>
          ) : (
            <span className="flex items-center gap-2"><CheckCircle size={18} /> Confirm & Commit</span>
          )}
        </button>
      </div>
    </div>
  );
};

export default InboxCorrection;