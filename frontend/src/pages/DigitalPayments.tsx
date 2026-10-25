import { errorMessageOf } from "@/components/patterns/errorMessage";
import { useState, useEffect, useCallback } from 'react';
import { formatMoney } from "../lib/currency";
import { CreditCard, Plus, DollarSign, TrendingUp, AlertCircle, CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
import { listPayments, createPayment, getPaymentStats, refundPayment, type DigitalPayment, type PaymentStats, type CreatePaymentPayload, type PaymentMethod } from '../api/digitalPaymentsApi';
import { useToast } from '../components/toast-context';
const tenantCurrency = () => window.__FLOWOPS_CURRENCY__ ?? 'ZAR';

export default function DigitalPayments() {
  const { showToast } = useToast();
  const [payments, setPayments] = useState<DigitalPayment[]>([]);
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState<{ amount: string; method: PaymentMethod; payerName: string; payerEmail: string; waybillId: string }>({
    amount: '', method: 'CARD', payerName: '', payerEmail: '', waybillId: '',
  });

  const load = useCallback(() => (async () => {
    const params: Record<string, string> = {};
    if (filter) params.status = filter;
    const [paymentsData, statsData] = await Promise.all([listPayments(params), getPaymentStats()]);
    setPayments(paymentsData);
    setStats(statsData);

  })().catch((e: unknown) => {
    showToast(errorMessageOf(e), 'error');

  }).finally(() => {
    setLoading(false);

  }), [filter, showToast]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { showToast('Valid amount is required', 'error'); return; }
    try {
      const payload: CreatePaymentPayload = {
        amount, method: form.method,
        payerName: form.payerName || undefined,
        payerEmail: form.payerEmail || undefined,
        waybillId: form.waybillId || undefined,
      };
      await createPayment(payload);
      showToast('Payment created', 'success');
      setShowCreate(false);
      setForm({ amount: '', method: 'CARD', payerName: '', payerEmail: '', waybillId: '' });
      load();
    } catch (e) { showToast(errorMessageOf(e), 'error'); }
  };

  const handleRefund = async (id: string) => {
    try { await refundPayment(id); showToast('Payment refunded', 'success'); load(); }
    catch (e) { showToast(errorMessageOf(e), 'error'); }
  };

  const statusBadge = (s: string) => {
    switch (s) {
      case 'SUCCESS': return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">Success</span>;
      case 'PENDING': return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">Pending</span>;
      case 'FAILED': return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/30">Failed</span>;
      case 'REFUNDED': return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/30">Refunded</span>;
      default: return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30">Processing</span>;
    }
  };

  const methodIcon = (m: string) => {
    switch (m) {
      case 'CARD': return 'text-blue-400';
      case 'EFT': return 'text-emerald-400';
      case 'MOBILE_MONEY': return 'text-purple-400';
      case 'QR_CODE': return 'text-cyan-400';
      default: return 'text-amber-400';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-600/20 border border-green-500/30">
              <CreditCard className="w-6 h-6 text-green-400" />
            </div>
            Digital Payments
          </h1>
          <p className="text-sm text-white/50 mt-1">Card, EFT, mobile money & QR code payment collection</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 rounded-xl bg-green-600 text-white font-bold hover:bg-green-500 transition flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Payment
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2"><DollarSign className="w-4 h-4 text-emerald-400" /><p className="text-xs text-white/50">Revenue</p></div>
            <p className="text-xl font-black text-white mt-1">{formatMoney(stats.totalRevenue, tenantCurrency())}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-blue-400" /><p className="text-xs text-white/50">Success Rate</p></div>
            <p className="text-xl font-black text-white mt-1">{stats.successRate}%</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-violet-400" /><p className="text-xs text-white/50">Total Payments</p></div>
            <p className="text-xl font-black text-white mt-1">{stats.total}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4 text-amber-400" /><p className="text-xs text-white/50">Pending</p></div>
            <p className="text-xl font-black text-amber-400 mt-1">{stats.pending}</p>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2">
        {['', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'].map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${filter === f ? 'bg-green-500/20 text-green-400 border border-green-500/40' : 'bg-white/5 text-white/50 border border-white/10 hover:border-white/20'}`}>
            {f || 'All'}
          </button>
        ))}
      </div>

      {/* Payments List */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-green-400 animate-spin" /></div>
      ) : payments.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-12 text-center">
          <CreditCard className="w-12 h-12 text-white/20 mx-auto mb-4" />
          <p className="text-white/50">No payments found.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-white/10">
                <th className="text-left text-xs text-white/50 font-medium px-4 py-3">Reference</th>
                <th className="text-left text-xs text-white/50 font-medium px-4 py-3">Amount</th>
                <th className="text-left text-xs text-white/50 font-medium px-4 py-3">Method</th>
                <th className="text-left text-xs text-white/50 font-medium px-4 py-3">Status</th>
                <th className="text-left text-xs text-white/50 font-medium px-4 py-3">Payer</th>
                <th className="text-left text-xs text-white/50 font-medium px-4 py-3">Date</th>
                <th className="text-left text-xs text-white/50 font-medium px-4 py-3">Actions</th>
              </tr></thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-white/70 font-mono text-xs">{p.reference || '—'}</td>
                    <td className="px-4 py-3 text-white font-bold">{formatMoney(p.amount, tenantCurrency())}</td>
                    <td className="px-4 py-3"><span className={`flex items-center gap-1.5 ${methodIcon(p.method)}`}><CreditCard className="w-3.5 h-3.5" />{p.method}</span></td>
                    <td className="px-4 py-3">{statusBadge(p.status)}</td>
                    <td className="px-4 py-3 text-white/60 text-xs">{p.payerName || p.payerEmail || '—'}</td>
                    <td className="px-4 py-3 text-white/40 text-xs">{new Date(p.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      {p.status === 'SUCCESS' && (
                        <button onClick={() => handleRefund(p.id)} className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20" title="Refund"><RotateCcw className="w-3.5 h-3.5" /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0a1628] rounded-2xl border border-white/10 p-6 w-full max-w-lg space-y-4">
            <h2 className="text-lg font-bold text-white">Create Payment</h2>
            <input type="number" className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 outline-none" placeholder="Amount (ZAR)" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
            <select className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white/70 outline-none" value={form.method} onChange={e => setForm({ ...form, method: e.target.value as PaymentMethod })}>
              <option value="CARD">Card</option>
              <option value="EFT">EFT</option>
              <option value="MOBILE_MONEY">Mobile Money</option>
              <option value="QR_CODE">QR Code</option>
              <option value="CASH">Cash</option>
            </select>
            <input className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 outline-none" placeholder="Payer name" value={form.payerName} onChange={e => setForm({ ...form, payerName: e.target.value })} />
            <input className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 outline-none" placeholder="Payer email" value={form.payerEmail} onChange={e => setForm({ ...form, payerEmail: e.target.value })} />
            <input className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 outline-none" placeholder="Waybill ID (optional)" value={form.waybillId} onChange={e => setForm({ ...form, waybillId: e.target.value })} />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-xl bg-white/5 text-white/70 hover:bg-white/10">Cancel</button>
              <button onClick={handleCreate} className="px-4 py-2 rounded-xl bg-green-600 text-white font-bold hover:bg-green-500">Create Payment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
