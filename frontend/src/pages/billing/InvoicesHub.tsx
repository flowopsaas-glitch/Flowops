import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  Clock, 
  CreditCard, 
  Download, 
  FileText, 
  MoreVertical, 
  Search, 
  TrendingUp 
} from 'lucide-react';

const InvoicesHub = () => {
  const [invoices, setInvoices] = useState([]);
  const [metrics, setMetrics] = useState({ outstanding: 0, collected: 0, collectionRate: 0 });
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  // 📊 Fetch metrics and list on mount
  useEffect(() => {
    fetchMetrics();
    fetchInvoices();
  }, []);

  const fetchMetrics = async () => {
    const res = await fetch('/api/invoices/metrics');
    const data = await res.json();
    setMetrics(data);
  };

  const fetchInvoices = async () => {
    const res = await fetch('/api/invoices'); // Adjust based on your general list route
    const data = await res.json();
    setInvoices(data);
  };

  const handlePaymentSubmit = async (formData) => {
    const res = await fetch(`/api/invoices/${selectedInvoice.id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    if (res.ok) {
      setShowPayModal(false);
      fetchMetrics();
      fetchInvoices();
    }
  };

  return (
    <div className="p-6 space-y-6 bg-slate-950 min-h-screen text-slate-200">
      {/* 🚀 REVENUE STAT CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard 
          title="Outstanding Revenue" 
          value={`R${metrics.outstanding.toLocaleString()}`} 
          icon={<Clock className="text-amber-400" />} 
          trend="Awaiting Settlement"
        />
        <StatCard 
          title="Cash Collected" 
          value={`R${metrics.collected.toLocaleString()}`} 
          icon={<CheckCircle className="text-emerald-400" />} 
          trend="Total Settled"
        />
        <StatCard 
          title="Collection Efficiency" 
          value={`${metrics.collectionRate.toFixed(1)}%`} 
          icon={<TrendingUp className="text-blue-400" />} 
          trend="Success Rate"
        />
      </div>

      {/* 🧾 INVOICE LEDGER */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileText size={20} className="text-blue-400" />
            Official Invoice Ledger
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
            <input 
              type="text" 
              placeholder="Search INV-..." 
              className="bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-950 text-slate-400 uppercase text-xs">
            <tr>
              <th className="px-6 py-4">Invoice #</th>
              <th className="px-6 py-4">Client</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4 text-right">Total</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {invoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-slate-800/50 transition-colors">
                <td className="px-6 py-4 font-mono text-blue-400">{inv.invoiceNumber}</td>
                <td className="px-6 py-4 font-medium">{inv.company?.name || 'General Client'}</td>
                <td className="px-6 py-4 text-slate-400">{new Date(inv.createdAt).toLocaleDateString()}</td>
                <td className="px-6 py-4 text-right font-semibold text-slate-100">R{inv.total.toFixed(2)}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                    inv.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                  }`}>
                    {inv.status}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => window.open(`/api/invoices/${inv.id}/pdf`, '_blank')}
                      className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
                      title="Download PDF"
                    >
                      <Download size={18} />
                    </button>
                    {inv.status === 'UNPAID' && (
                      <button 
                        onClick={() => { setSelectedInvoice(inv); setShowPayModal(true); }}
                        className="p-2 hover:bg-blue-600 rounded-lg bg-blue-500/10 text-blue-400 hover:text-white transition-colors"
                        title="Record Payment"
                      >
                        <CreditCard size={18} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

// --- Sub-components ---

const StatCard = ({ title, value, icon, trend }) => (
  <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-3">
    <div className="flex justify-between items-start">
      <div className="p-2 bg-slate-950 rounded-lg border border-slate-800">
        {icon}
      </div>
    </div>
    <div>
      <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">{title}</p>
      <h3 className="text-2xl font-bold text-slate-100">{value}</h3>
    </div>
    <div className="text-xs text-slate-500 flex items-center gap-1">
      {trend}
    </div>
  </div>
);

const PaymentModal = ({ invoice, onClose, onSubmit }) => {
  const [ref, setRef] = useState('');
  const [amount, setAmount] = useState(invoice.total);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="p-6 bg-slate-950 border-b border-slate-800">
          <h3 className="text-xl font-bold">Record Bank Settlement</h3>
          <p className="text-sm text-slate-500">Capturing payment for {invoice.invoiceNumber}</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase">Bank Reference</label>
            <input 
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="e.g. FNB-TRANSFER-9921" 
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase">Amount Received</label>
            <input 
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
        <div className="p-6 bg-slate-950 border-t border-slate-800 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 px-4 rounded-xl border border-slate-700 hover:bg-slate-800 transition-colors">Cancel</button>
          <button 
            onClick={() => onSubmit({ paymentRef: ref, amountPaid: amount })}
            className="flex-1 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold transition-all"
          >
            Confirm Payment
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvoicesHub;
