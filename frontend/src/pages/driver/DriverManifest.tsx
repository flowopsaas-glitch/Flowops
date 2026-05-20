import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api/client'; // Double-up to reach src/api from src/pages/driver
import { ChevronLeft, Package, CheckCircle, Square, PenTool, X } from 'lucide-react';
import { useToast } from "../../components/ToastProvider"; 
import SignatureCanvas from 'react-signature-canvas';

export default function DriverManifest() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<any>(null);
  const [confirmed, setConfirmed] = useState<number[]>([]);
  const [showSig, setShowSig] = useState(false);
  const sigPad = useRef<any>(null);
  const { showToast } = useToast();

  // 🔄 Sync with FlowOps Backend Engine
  useEffect(() => {
    if (id) {
      api.get(`/waybills/${id}`)
        .then(res => setJob(res.data))
        .catch(() => {
          showToast("Waybill not found in system", "error");
          navigate('/driver/portal');
        });
    }
  }, [id, navigate, showToast]);

  // This state persists until the API returns data
  if (!job) {
    return (
      <div className="min-h-screen bg-[#020817] flex items-center justify-center text-sky-500 font-black italic tracking-widest uppercase animate-pulse">
        Syncing...
      </div>
    );
  }

  const isComplete = confirmed.length === (job.quantity || 1);

  const submitPOD = async () => {
    if (sigPad.current?.isEmpty()) {
      showToast("Signature required for handover.", "error");
      return;
    }

    const canvas = sigPad.current.getTrimmedCanvas();
    canvas.toBlob(async (blob: Blob | null) => {
      if (!blob) return;

      const formData = new FormData();
      // 'signature' matches the @UploadedFile('signature') in NestJS backend
      formData.append('signature', new File([blob], `POD_${job.waybillNumber}.png`, { type: 'image/png' }));

      try {
        await api.post(`/waybills/${id}/complete`, formData);
        showToast("Delivery confirmed successfully!", "success");
        navigate('/driver/portal');
      } catch (err) { 
        showToast("Handover Sync Error. Check Backend Connection.", "error"); 
      }
    }, 'image/png');
  };

  return (
    <div className="min-h-screen bg-[#020817] text-white p-6 pb-32 text-left font-sans">
      <button 
        onClick={() => navigate('/driver/portal')} 
        className="mb-8 text-sky-500 font-black text-[10px] uppercase flex items-center gap-2"
      >
        <ChevronLeft size={16}/> Return to Portal
      </button>

      <h1 className="text-3xl font-black italic tracking-tighter leading-none">
        {job.waybillNumber}
      </h1>
      <p className="text-slate-500 text-[10px] font-black uppercase mt-2">
        Audit List: {job.quantity || 1} Units for Delivery
      </p>

      {/* Parcel Audit List */}
      <section className="space-y-3 my-10">
        {Array.from({ length: job.quantity || 1 }).map((_, i) => (
          <button 
            key={i} 
            onClick={() => setConfirmed(prev => 
              prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
            )}
            className={`w-full p-7 rounded-[32px] border flex items-center justify-between transition-all ${
              confirmed.includes(i) 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                : 'bg-white/5 border-white/5 text-slate-500'
            }`}
          >
            <div className="flex items-center gap-4">
              <Package size={22}/>
              <span className="font-black text-sm uppercase">Item ID: {i + 1}</span>
            </div>
            {confirmed.includes(i) ? (
              <CheckCircle size={24} className="fill-emerald-500 text-slate-950"/>
            ) : (
              <Square size={24}/>
            )}
          </button>
        ))}
      </section>

      {/* Bottom Action Button */}
      <button 
        onClick={() => setShowSig(true)} 
        disabled={!isComplete} 
        className={`w-full py-6 rounded-[32px] font-black text-sm uppercase flex justify-center items-center gap-3 shadow-2xl transition-all ${
          isComplete 
            ? 'bg-sky-500 text-white active:scale-95 shadow-sky-500/20' 
            : 'bg-slate-800 text-slate-600 opacity-50 cursor-not-allowed'
        }`}
      >
        {isComplete ? <PenTool size={20}/> : <Package size={20}/>} 
        {isComplete ? "Sign for Handover" : "Complete Audit First"}
      </button>

      {/* Signature Proof of Delivery Overlay */}
      {showSig && (
        <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-2xl z-50 p-8 flex flex-col">
          <div className="flex justify-between items-center mt-8 mb-8">
             <h2 className="text-3xl font-black italic text-white tracking-tighter uppercase">
               Proof of Delivery
             </h2>
             <button 
               onClick={() => setShowSig(false)} 
               className="p-3 bg-white/5 rounded-full text-white"
             >
               <X size={20}/>
             </button>
          </div>
          
          <div className="flex-1 bg-white rounded-[40px] overflow-hidden shadow-inner">
            <SignatureCanvas 
              ref={sigPad} 
              penColor="black" 
              canvasProps={{ className: 'w-full h-full' }} 
            />
          </div>

          <button 
            onClick={submitPOD} 
            className="w-full mt-10 bg-emerald-500 py-6 rounded-3xl font-black text-xs uppercase tracking-widest text-white shadow-xl shadow-emerald-500/20 transition-all active:scale-95"
          >
            Confirm & Complete
          </button>
        </div>
      )}
    </div>
  );
}
