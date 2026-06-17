import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from '../api/client';
import { FileText, ShieldAlert, Download, RefreshCw, CheckCircle2 } from "lucide-react";

export default function Invoices() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = (searchParams.get("status") || "").toUpperCase();

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      // Cache buster added to the URL
      const res = await api.get(`/invoices/supervisor?t=${Date.now()}`);
      

      // 🚀 UNWRAPPER: Handle both flat arrays and { invoices: [] } objects
      const dataArray = Array.isArray(res.data) 
        ? res.data 
        : (res.data?.invoices || []);
      
      setInvoices(dataArray);
    } catch (err) {
      console.error("Ledger sync error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInvoices(); }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#07111f]">
      <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
    </div>
  );

  // Deep-link filter: dashboard "Outstanding" KPI navigates here with
  // ?status=OVERDUE to land on a focused arrears view.
  const visibleInvoices = statusFilter
    ? invoices.filter((inv) => String(inv.status).toUpperCase() === statusFilter)
    : invoices;

  return (
    <div className="p-8 space-y-8 bg-[#07111f] min-h-screen text-slate-200">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black italic uppercase tracking-tighter text-white">Official Invoices</h1>
          {statusFilter && (
            <button
              onClick={() => setSearchParams({})}
              className="mt-2 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-blue-300 hover:bg-blue-500/20"
            >
              Filter: {statusFilter}
              <span className="text-blue-400">✕ clear</span>
            </button>
          )}
        </div>
        <button onClick={fetchInvoices} className="p-2 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10">
          <RefreshCw size={20} />
        </button>
      </div>

      {visibleInvoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-white/5 rounded-3xl bg-white/[0.02]">
          <FileText className="h-12 w-12 mb-3 text-slate-700" />
          <p className="text-lg font-bold text-slate-400 uppercase tracking-widest italic">
            {statusFilter ? `No ${statusFilter} Invoices` : "No Finalized Invoices Found"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {visibleInvoices.map((inv) => (
            <div key={inv.id} className="bg-slate-900 border border-white/10 rounded-[24px] p-6 shadow-2xl">
              <div className="flex justify-between items-start">
                <div>
                  <span className="px-2 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-black rounded-full uppercase tracking-widest">
                    {inv.status}
                  </span>
                  <h3 className="text-xl font-black text-white mt-2">{inv.clientName}</h3>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">{inv.invoiceNumber}</p>
                </div>
                <div className="text-right">
                   <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Value</div>
                   <div className="text-2xl font-black text-emerald-400 font-mono">R {Number(inv.total).toFixed(2)}</div>
                </div>
              </div>
              
              <div className="mt-6 p-4 bg-black/40 rounded-xl border border-white/5 grid grid-cols-2 gap-4">
                 <div>
                    <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Health Score</div>
                    <div className="text-lg font-black text-white">{inv.healthScore}/100</div>
                 </div>
                 <div className="text-right">
                    <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Risk Level</div>
                    <div className="text-lg font-black text-blue-400">{inv.risk}</div>
                 </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
