import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  Clock, 
  CreditCard, 
  Download, 
  FileText, 
  Search, 
  TrendingUp,
  ShieldCheck,
  ArrowUpRight,
  AlertCircle} from 'lucide-react';

const InvoicesPage = () => {
  const [invoices, setInvoices] = useState([]);
  const [metrics, setMetrics] = useState({ outstanding: 0, collected: 0, collectionRate: 0, overdueTotal: 0 });
  const [loading, setLoading] = useState(true);
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadFinanceData();
  }, []);

  const loadFinanceData = async () => {
    setLoading(true);
    try {
      // 🚀 Hits the new endpoints we just built in the BillingService
      const [invRes, metRes] = await Promise.all([
        fetch('/api/invoices'), 
        fetch('/api/invoices/metrics')
      ]);
      
      if (invRes.status === 401 || metRes.status === 401) {
        console.warn("Session expired. Please re-login.");
        return;
      }

      const invData = await invRes.json();
      const metData = await metRes.json();
      
      setInvoices(invData);
      setMetrics(metData);
    } catch (err) {
      console.error("Finance Sync Failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSubmit = async (formData) => {
    const res = await fetch(`/api/invoices/${selectedInvoice.id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    if (res.ok) {
      setShowPayModal(false);
      loadFinanceData(); // Refresh the ledger and cards
    }
  };

  return (
    <div className="p-6 space-y-6 bg-[#020617] min-h-screen text-slate-200">
      {/* --- HEADER --- */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Credit Control</h1>
          <p className="text-slate-500 text-sm mt-1 font-medium">Manage official tax records and revenue collection.</p>
        </div>
        <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">
          <ShieldCheck size={14} />
          Ledger Audited
        </div>
      </div>

      {/* --- REVENUE CARDS --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard 
          title="Outstanding Revenue" 
          value={`R${metrics.outstanding.toLocaleString()}`} 
          icon={<Clock className="text-amber-400" />} 
          status="Awaiting Settlement"
        />
        <MetricCard 
          title="Cash Collected" 
          value={`R${metrics.collected.toLocaleString()}`} 
          icon={<CheckCircle className="text-emerald-400" />} 
          status="Total Verified"
        />
        <MetricCard 
          title="Collection Rate" 
          value={`${metrics.collectionRate.toFixed(1)}%`} 
          icon={<TrendingUp className="text-blue-400" />} 
          status="Revenue Efficiency"
        />
      </div>

      {/* --- INVOICE TABLE --- */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <FileText size={18} className="text-blue-400" />
            </div>
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-300">Invoice Ledger</h2>
          </div>
          <div className="relative w-72 group">
            <Search className="absolute left-3 top-2.5 text-slate-500 group-focus-within:text-blue-400 transition-colors" size={16} />
            <input 
              type="text" 
              placeholder="Search Invoice # or Ref..." 
              className="w-full bg-[#020617] border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-blue-500/50 focus:outline-none transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#020617]/50 text-slate-500 uppercase text-[10px] font-black tracking-widest border-b border-slate-800">
              <tr>
                <th className="px-6 py-5">Invoice Number</th>
                <th className="px-6 py-5">Status</th>
                <th className="px-6 py-5">Reference</th>
                <th className="px-6 py-5 text-right">Amount (ZAR)</th>
                <th className="px-6 py-5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-blue-500/[0.02] transition-colors group">
                  <td className="px-6 py-5">
                    <div className="font-mono text-blue-400 font-bold tracking-tight">{inv.invoiceNumber}</div>
                    <div className="text-[10px] text-slate-600 mt-0.5">{new Date(inv.createdAt).toLocaleDateString()}</div>
                  </td>
                  <td className="px-6 py-5">
                    <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border ${
                      inv.status === 'PAID' 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    }`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <div className="text-xs text-slate-400 truncate max-w-[150px]">{inv.reference || 'SYSTEM_GEN'}</div>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="text-slate-100 font-bold font-mono">R{inv.total.toFixed(2)}</div>
                    <div className="text-[9px] text-slate-600 font-black">INCL. VAT</div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex justify-center gap-2">
                      <button 
                        onClick={() => window.open(`/api/invoices/${inv.id}/pdf`, '_blank')}
                        className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-white transition-all border border-transparent hover:border-slate-700"
                        title="View Official PDF"
                      >
                        <Download size={16} />
                      </button>
                      {inv.status === 'UNPAID' && (
                        <button 
                          onClick={() => { setSelectedInvoice(inv); setShowPayModal(true); }}
                          className="p-2 bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white rounded-lg border border-blue-500/20 transition-all"
                        >
                          <CreditCard size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-600">
                      <AlertCircle size={32} strokeWidth={1} />
                      <p className="text-xs font-medium italic tracking-tight">No invoices have been finalized yet.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showPayModal && (
        <PaymentModal 
          invoice={selectedInvoice} 
          onClose={() => setShowPayModal(false)} 
          onSubmit={handlePaymentSubmit}
        />
      )}
    </div>
  );
};

// --- Metric Card Component ---
const MetricCard = ({ title, value, icon, status }: { title: string; value: string | number; icon: React.ReactNode; status?: string }) => (
  <div className="bg-[#0f172a] border border-slate-800 p-6 rounded-2xl space-y-5 relative group overflow-hidden shadow-lg">
    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
       {React.cloneElement(icon as React.ReactElement<any>, { size: 64 })}
    </div>
    <div className="flex justify-between items-center">
      <div className="p-2.5 bg-[#020617] rounded-xl border border-slate-800 shadow-inner">
        {icon}
      </div>
      <ArrowUpRight className="text-slate-800 group-hover:text-blue-500 transition-colors" size={16} />
    </div>
    <div>
      <p className="text-slate-500 text-[9px] font-black uppercase tracking-[0.25em]">{title}</p>
      <h3 className="text-3xl font-bold text-white mt-1 tracking-tighter">{value}</h3>
    </div>
    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest border-t border-slate-800/50 pt-4 flex items-center gap-2">
      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
      {status}
    </div>
  </div>
);

// --- Payment Receipt Modal ---
const PaymentModal = ({ invoice, onClose, onSubmit }: { invoice: any; onClose: () => void; onSubmit: (data: any) => void }) => {
  const [data, setData] = useState({ paymentRef: '', amountPaid: invoice.total });

  return (
    <div className="fixed inset-0 bg-[#020617]/95 backdrop-blur-md flex items-center justify-center z-[999] p-4">
      <div className="bg-[#0f172a] border border-slate-700 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden ring-1 ring-white/5">
        <div className="p-8 bg-[#020617]/50 border-b border-slate-800 text-center">
          <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-500/20 text-blue-400">
            <CreditCard size={32} />
          </div>
          <h3 className="text-xl font-bold text-white">Record Settlement</h3>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Invoice: {invoice.invoiceNumber}</p>
        </div>
        
        <div className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Bank Reference Number</label>
            <input 
              autoFocus
              className="w-full bg-[#020617] border border-slate-800 rounded-2xl p-4 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all placeholder:text-slate-800"
              placeholder="e.g. EFT-REF-9921"
              value={data.paymentRef}
              onChange={(e) => setData({...data, paymentRef: e.target.value})}
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Amount Verified</label>
            <div className="relative">
              <span className="absolute left-5 top-4 text-slate-500 font-bold">R</span>
              <input 
                type="number"
                className="w-full bg-[#020617] border border-slate-800 rounded-2xl p-4 pl-10 text-white font-mono font-bold text-lg"
                value={data.amountPaid}
                onChange={(e) => setData({...data, amountPaid: parseFloat(e.target.value)})}
              />
            </div>
          </div>
        </div>

        <div className="p-8 bg-[#020617]/50 border-t border-slate-800 flex gap-4">
          <button onClick={onClose} className="flex-1 py-4 text-[10px] font-black text-slate-500 hover:text-white transition-colors uppercase tracking-[0.2em]">Discard</button>
          <button 
            disabled={!data.paymentRef}
            onClick={() => onSubmit(data)}
            className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-20 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-blue-500/20 transition-all"
          >
            Settle Ledger
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvoicesPage;
