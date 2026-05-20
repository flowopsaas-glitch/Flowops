import React, { useState, useEffect } from "react";
import { CreditCard, BellRing, TrendingUp, Wallet, ArrowUpRight, Download, Search, CheckCircle, X } from "lucide-react";
import { api } from '../api/client';

const StatCard = ({ title, value, desc, icon: Icon }: any) => (
  <div className="rounded-[26px] border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-md">
    <div className="flex justify-between items-start">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10"><Icon className="h-5 w-5 text-white" /></div>
      <div className="text-[10px] font-black uppercase tracking-widest text-white/40">{desc}</div>
    </div>
    <div className="mt-4 text-xs font-bold uppercase text-white/50">{title}</div>
    <div className="text-3xl font-black text-white mt-1">{value}</div>
  </div>
);

const CreditControl = () => {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [metrics, setMetrics] = useState({ outstanding: 0, collected: 0, collectionRate: 0 });
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [payRef, setPayRef] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [invRes, metRes] = await Promise.all([
        api.get("/invoices"), 
        api.get("/invoices/metrics")
      ]);
      setInvoices(invRes.data);
      setMetrics(metRes.data);
    } catch (e) {
      console.error("Failed to load credit control data", e);
    }
  };

  const handlePayment = async () => {
    try {
      await api.post(`/invoices/${selectedInvoice.id}/pay`, { 
        paymentRef: payRef, 
        amountPaid: selectedInvoice.total 
      });
      setShowPayModal(false); 
      setPayRef(""); 
      loadData(); 
    } catch (e) {
      console.error("Payment recording failed", e);
    }
  };

  // 🚀 THE FIX: Securely fetch the PDF blob with the auth token
  const handleDownloadPdf = async (invoiceId: string) => {
    try {
      setDownloadingId(invoiceId);
      const res = await api.get(`/invoices/${invoiceId}/pdf`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const blobUrl = window.URL.createObjectURL(blob);
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
      
      // Clean up the URL object to prevent memory leaks
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60000);
    } catch (e) {
      console.error("Failed to download PDF", e);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="min-h-full bg-[#07111f] p-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="rounded-[30px] border border-white/10 bg-white/5 p-6 backdrop-blur-2xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/20 px-3 py-1 text-xs font-bold text-blue-400">
            <CreditCard size={14} /> Commercial Oversight
          </div>
          <h1 className="mt-4 text-4xl font-black text-white tracking-tighter">Credit Control</h1>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <StatCard title="Outstanding" value={`R${(metrics.outstanding || 0).toLocaleString()}`} desc="Awaiting Settlement" icon={BellRing} />
          <StatCard title="Cash Collected" value={`R${(metrics.collected || 0).toLocaleString()}`} desc="Verified Revenue" icon={TrendingUp} />
          <StatCard title="Collection Rate" value={`${(metrics.collectionRate || 0).toFixed(1)}%`} desc="Efficiency" icon={Wallet} />
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <div className="flex justify-between items-center mb-6">
            <div className="text-sm font-bold text-white uppercase tracking-widest">Official Ledger</div>
            <div className="relative w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/30" />
              <input type="text" placeholder="Search INV-..." className="w-full bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
          </div>
          <table className="w-full text-left">
            <thead className="text-[10px] font-black uppercase text-white/40 border-b border-white/5">
              <tr><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-center">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {invoices.filter(i => (i.invoiceNumber || '').includes(searchTerm)).map((inv) => (
                <tr key={inv.id} className="hover:bg-white/5">
                  <td className="px-4 py-4"><div className="text-sm font-bold text-white">{inv.invoiceNumber}</div></td>
                  <td className="px-4 py-4"><span className={`px-2 py-1 rounded text-[10px] font-bold ${inv.status === 'PAID' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>{inv.status}</span></td>
                  <td className="px-4 py-4 text-right text-white font-bold font-mono">R{Number(inv.total || 0).toFixed(2)}</td>
                  <td className="px-4 py-4 text-center">
                    <button onClick={() => handleDownloadPdf(inv.id)} className="p-2 text-white/40 hover:text-white transition-colors">
                      <Download size={16} className={downloadingId === inv.id ? "animate-bounce text-blue-400" : ""} />
                    </button>
                    {inv.status === 'UNPAID' && <button onClick={() => { setSelectedInvoice(inv); setShowPayModal(true); }} className="p-2 text-blue-400 ml-2"><ArrowUpRight size={16} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showPayModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-[32px] bg-[#0f172a] p-8 border border-white/10 shadow-2xl">
            <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-black text-white">Record Payment</h2><button onClick={() => setShowPayModal(false)} className="text-white/40"><X size={20}/></button></div>
            <input placeholder="Bank Reference..." className="w-full bg-black/20 border border-white/10 rounded-2xl p-4 text-white mb-4" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
            <button onClick={handlePayment} className="w-full bg-white text-black font-black py-4 rounded-2xl hover:bg-slate-200 transition-colors">Confirm Settlement</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreditControl;
