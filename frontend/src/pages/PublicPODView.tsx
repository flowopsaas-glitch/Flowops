import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { 
  CheckCircle2, Download, Package, 
  MapPin, Calendar, Image as ImageIcon,
  ShieldCheck
} from 'lucide-react';
import { FLOWOPS_HTTP_ORIGIN } from "../lib/env";

export default function PublicPODView() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // 🛰️ Ensure your backend serves assets correctly
  const assetBase = (FLOWOPS_HTTP_ORIGIN || "http://localhost:3000").replace(/\/+$/, "");

  useEffect(() => {
    // Hits the public endpoint (No Authentication Guard on backend for this route)
    api.get(`/waybills/public/${id}`)
      .then(res => setData(res.data))
      .catch(err => console.error("POD Fetch Error:", err))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="min-h-screen bg-[#07111f] flex flex-col items-center justify-center text-white gap-4">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
      <p className="font-black uppercase tracking-[0.2em] text-xs opacity-40">Decrypting Evidence...</p>
    </div>
  );

  if (!data) return (
    <div className="min-h-screen bg-[#07111f] flex flex-col items-center justify-center text-white p-6 text-center">
      <Package size={64} className="text-slate-800 mb-4" />
      <h1 className="text-2xl font-black uppercase tracking-tighter">Record Not Found</h1>
      <p className="text-slate-500 text-sm mt-2 max-w-xs">This shipment may still be in transit or the link has expired.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#07111f] p-6 pb-20 flex flex-col items-center font-sans">
      
      {/* 🟦 MAIN RECEIPT CARD */}
      <div className="w-full max-w-xl bg-slate-900 border border-white/10 rounded-[40px] overflow-hidden shadow-2xl">
        
        {/* Header Section */}
        <div className="p-8 text-center border-b border-white/5 bg-slate-950/50">
          <div className="bg-emerald-500/20 p-4 rounded-3xl inline-block mb-4 border border-emerald-500/20">
            <CheckCircle2 size={40} className="text-emerald-500" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Delivery Confirmed</h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Verified Proof of Delivery</p>
        </div>

        <div className="p-8 space-y-10">
          
          {/* Waybill Info Grid */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1">
              <p className="text-[10px] font-black text-cyan-500 uppercase tracking-widest">Waybill Reference</p>
              <p className="text-xl font-black text-white truncate">{data.waybillNumber}</p>
            </div>
            <div className="space-y-1 text-right">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Delivered On</p>
              <p className="text-sm font-bold text-slate-200">
                {data.completedAt ? new Date(data.completedAt).toLocaleDateString() : '---'}
              </p>
            </div>
          </div>

          {/* ✍️ DIGITAL SIGNATURE */}
          <div className="space-y-4">
             <div className="flex items-center gap-2 text-slate-500">
                <ShieldCheck size={14} className="text-emerald-500" />
                <span className="text-[10px] font-black uppercase tracking-widest">Recipient Signature</span>
             </div>
             <div className="bg-white rounded-[32px] p-8 shadow-inner flex items-center justify-center min-h-[160px]">
                <img 
                  src={`${assetBase}${data.signatureUrl || data.podUrl}`} 
                  alt="Proof Signature" 
                  className="max-h-24 object-contain grayscale contrast-125" 
                />
             </div>
          </div>

          {/* 📸 PARCEL EVIDENCE GALLERY */}
          {data.parcelImages?.length > 0 && (
            <div className="space-y-4">
               <div className="flex items-center gap-2 text-slate-500">
                  <ImageIcon size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Loading Evidence</span>
               </div>
               <div className="grid grid-cols-2 gap-4">
                  {data.parcelImages.map((img: string, idx: number) => (
                    <div key={idx} className="aspect-square bg-slate-950 rounded-3xl border border-white/5 overflow-hidden">
                      <img src={`${assetBase}${img}`} alt="Parcel" className="w-full h-full object-cover opacity-80" />
                    </div>
                  ))}
               </div>
            </div>
          )}

          {/* Download Button */}
          <button 
            onClick={() => window.open(`${assetBase}/api/waybills/${id}/pdf`, '_blank')}
            className="w-full py-5 bg-cyan-600 hover:bg-cyan-500 rounded-[24px] text-white font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-cyan-900/20 transition-all active:scale-95"
          >
            <Download size={20} /> Download Official PDF Audit
          </button>

        </div>
      </div>
      
      {/* Footer Meta */}
      <div className="mt-10 flex flex-col items-center gap-2 opacity-30">
        <p className="text-[9px] text-white font-black uppercase tracking-[0.4em]">Powered by FlowOps AI Engine</p>
        <div className="flex items-center gap-4">
           <span className="h-px w-8 bg-white/20" />
           <ShieldCheck size={16} className="text-white" />
           <span className="h-px w-8 bg-white/20" />
        </div>
      </div>
    </div>
  );
}
