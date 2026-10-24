import { errorMessageOf } from "@/components/patterns/errorMessage";
import { useState, useEffect, useCallback } from 'react';
import { Plug, Plus, Power, PowerOff, Trash2, RefreshCw, Loader2, ArrowRightLeft, AlertCircle, CheckCircle2 } from 'lucide-react';
import { listIntegrations, createIntegration, activateIntegration, deactivateIntegration, deleteIntegration, type OrderFlowIntegration, type CreateIntegrationPayload, type IntegrationType } from '../api/orderFlowApi';
import { useToast } from '../components/toast-context';

export default function OrderFlowIntegrations() {
  const { showToast } = useToast();
  const [integrations, setIntegrations] = useState<OrderFlowIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'SHOPIFY' as IntegrationType, autoDispatch: false });

  const load = useCallback(() => (async () => {
    setIntegrations(await listIntegrations());

  })().catch((e: unknown) => {
    showToast(errorMessageOf(e) || 'Failed to load integrations', 'error');

  }).finally(() => {
    setLoading(false);

  }), [showToast]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.name.trim()) { showToast('Name is required', 'error'); return; }
    try {
      const payload: CreateIntegrationPayload = { name: form.name, type: form.type, autoDispatch: form.autoDispatch };
      await createIntegration(payload);
      showToast('Integration created', 'success');
      setShowCreate(false);
      setForm({ name: '', type: 'SHOPIFY', autoDispatch: false });
      load();
    } catch (e) { showToast(errorMessageOf(e), 'error'); }
  };

  const handleActivate = async (id: string) => {
    try { await activateIntegration(id); showToast('Integration activated', 'success'); load(); }
    catch (e) { showToast(errorMessageOf(e), 'error'); }
  };

  const handleDeactivate = async (id: string) => {
    try { await deactivateIntegration(id); showToast('Integration deactivated', 'success'); load(); }
    catch (e) { showToast(errorMessageOf(e), 'error'); }
  };

  const handleDelete = async (id: string) => {
    try { await deleteIntegration(id); showToast('Integration deleted', 'success'); load(); }
    catch (e) { showToast(errorMessageOf(e), 'error'); }
  };

  const statusBadge = (s: string) => {
    switch (s) {
      case 'ACTIVE': return <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"><CheckCircle2 className="w-3 h-3" />Active</span>;
      case 'ERROR': return <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/30"><AlertCircle className="w-3 h-3" />Error</span>;
      case 'CONFIGURING': return <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30"><RefreshCw className="w-3 h-3" />Configuring</span>;
      default: return <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/5 text-white/40 border border-white/10"><PowerOff className="w-3 h-3" />Inactive</span>;
    }
  };

  const typeIcon = (t: string) => {
    const colors: Record<string, string> = { SHOPIFY: 'text-green-400', WOOCOMMERCE: 'text-purple-400', MAGENTO: 'text-orange-400', CUSTOM_API: 'text-blue-400', CSV_IMPORT: 'text-cyan-400', WEBHOOK: 'text-pink-400' };
    return colors[t] || 'text-white/50';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-600/20 border border-blue-500/30">
              <Plug className="w-6 h-6 text-blue-400" />
            </div>
            Order Flow Integrations
          </h1>
          <p className="text-sm text-white/50 mt-1">Connect e-commerce platforms for automatic order dispatch</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 transition flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Integration
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-white/50">Total Integrations</p><p className="text-xl font-black text-white mt-1">{integrations.length}</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-white/50">Active</p><p className="text-xl font-black text-emerald-400 mt-1">{integrations.filter(i => i.status === 'ACTIVE').length}</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-white/50">Orders Synced</p><p className="text-xl font-black text-blue-400 mt-1">{integrations.reduce((s, i) => s + i.totalOrders, 0)}</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-white/50">Auto-Dispatch</p><p className="text-xl font-black text-violet-400 mt-1">{integrations.filter(i => i.autoDispatch).length}</p></div>
      </div>

      {/* Integrations Grid */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>
      ) : integrations.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-12 text-center">
          <Plug className="w-12 h-12 text-white/20 mx-auto mb-4" />
          <p className="text-white/50">No integrations configured. Connect your first e-commerce platform.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {integrations.map(ig => (
            <div key={ig.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 hover:border-white/20 transition">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center ${typeIcon(ig.type)}`}>
                    <ArrowRightLeft className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-sm">{ig.name}</h3>
                    <p className="text-xs text-white/40">{ig.type.replace('_', ' ')}</p>
                  </div>
                </div>
                {statusBadge(ig.status)}
              </div>
              <div className="grid grid-cols-3 gap-3 py-3 border-t border-white/5">
                <div><p className="text-[10px] text-white/40 uppercase">Orders</p><p className="text-sm font-bold text-white">{ig.totalOrders}</p></div>
                <div><p className="text-[10px] text-white/40 uppercase">Failed</p><p className="text-sm font-bold text-red-400">{ig.failedOrders}</p></div>
                <div><p className="text-[10px] text-white/40 uppercase">Auto</p><p className="text-sm font-bold text-violet-400">{ig.autoDispatch ? 'ON' : 'OFF'}</p></div>
              </div>
              {ig.lastSyncAt && <p className="text-[10px] text-white/30 mt-2">Last sync: {new Date(ig.lastSyncAt).toLocaleString()}</p>}
              <div className="flex gap-2 mt-3 pt-3 border-t border-white/5">
                {ig.status !== 'ACTIVE' ? (
                  <button onClick={() => handleActivate(ig.id)} className="flex-1 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 flex items-center justify-center gap-1"><Power className="w-3.5 h-3.5" />Activate</button>
                ) : (
                  <button onClick={() => handleDeactivate(ig.id)} className="flex-1 px-3 py-2 rounded-lg bg-amber-500/10 text-amber-400 text-xs font-bold hover:bg-amber-500/20 flex items-center justify-center gap-1"><PowerOff className="w-3.5 h-3.5" />Deactivate</button>
                )}
                <button onClick={() => handleDelete(ig.id)} className="px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-xs font-bold hover:bg-red-500/20 flex items-center justify-center gap-1"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0a1628] rounded-2xl border border-white/10 p-6 w-full max-w-lg space-y-4">
            <h2 className="text-lg font-bold text-white">Add Integration</h2>
            <input className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 outline-none" placeholder="Integration name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <select className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white/70 outline-none" value={form.type} onChange={e => setForm({ ...form, type: e.target.value as IntegrationType })}>
              <option value="SHOPIFY">Shopify</option>
              <option value="WOOCOMMERCE">WooCommerce</option>
              <option value="MAGENTO">Magento</option>
              <option value="CUSTOM_API">Custom API</option>
              <option value="CSV_IMPORT">CSV Import</option>
              <option value="WEBHOOK">Webhook</option>
            </select>
            <label className="flex items-center gap-3 text-sm text-white/70">
              <input type="checkbox" checked={form.autoDispatch} onChange={e => setForm({ ...form, autoDispatch: e.target.checked })} className="w-4 h-4 rounded" />
              Enable auto-dispatch (automatically assign orders to available drivers)
            </label>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-xl bg-white/5 text-white/70 hover:bg-white/10">Cancel</button>
              <button onClick={handleCreate} className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500">Create Integration</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
