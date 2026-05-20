import React from "react";
import { ArrowLeft, Package, Trash2, CheckCircle } from "lucide-react";

export default function BatchDetails({ batch, onBack }: { batch: any, onBack: () => void }) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
      <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white font-bold text-xs uppercase tracking-widest transition-colors">
        <ArrowLeft size={16} /> Back to Batches
      </button>

      <div className="bg-slate-900/50 border border-white/10 p-8 rounded-[40px] flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Batch #{batch.id} Breakdown</h2>
          <p className="text-sky-500 font-bold text-sm uppercase mt-1">{batch.company?.name}</p>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Batch Value</div>
          <div className="text-4xl font-black text-emerald-400 font-mono">R {Number(batch.total || 0).toFixed(2)}</div>
        </div>
      </div>

      <div className="grid gap-3">
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] ml-2">Itemized Waybills</h3>
        {batch.waybills?.length === 0 ? (
          <p className="p-10 text-center text-slate-600 italic">No waybills found in this batch.</p>
        ) : (
          batch.waybills.map((wb: any) => (
            <div key={wb.id} className="bg-white/5 border border-white/5 p-4 rounded-2xl flex justify-between items-center hover:bg-white/[0.07] transition-all">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-sky-500/10 rounded-xl flex items-center justify-center text-sky-400">
                  <Package size={20} />
                </div>
                <div>
                  <div className="font-bold text-white text-sm">{wb.waybillNumber}</div>
                  <div className="text-[10px] text-slate-500 font-black uppercase tracking-wider">To: {wb.recipient}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-black text-white text-sm">R {Number(wb.totalAmount || 0).toFixed(2)}</div>
                <div className="text-[9px] text-emerald-500 font-bold uppercase">{wb.status}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}