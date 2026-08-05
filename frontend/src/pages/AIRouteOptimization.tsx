import { useState, useEffect, useCallback } from 'react';
import { Route, MapPin, Truck, Zap, Clock, TrendingDown, Brain, Loader2, Plus, RefreshCw } from 'lucide-react';
import { listOptimizations, createOptimization, getOptimization, type RouteOptimization, type CreateOptimizationPayload } from '../api/routeOptimizationApi';
import { useToast } from '../hooks/useToast';

export default function AIRouteOptimization() {
  const { showToast } = useToast();
  const [optimizations, setOptimizations] = useState<RouteOptimization[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<RouteOptimization | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', deliveryIds: '', vehicleIds: '' });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listOptimizations();
      setOptimizations(data);
    } catch (e: any) {
      showToast(e.message || 'Failed to load optimizations', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.deliveryIds.trim() || !form.vehicleIds.trim()) {
      showToast('Delivery IDs and Vehicle IDs are required', 'error');
      return;
    }
    setCreating(true);
    try {
      const payload: CreateOptimizationPayload = {
        name: form.name || undefined,
        deliveryIds: form.deliveryIds.split(',').map(s => s.trim()).filter(Boolean),
        vehicleIds: form.vehicleIds.split(',').map(s => s.trim()).filter(Boolean),
      };
      await createOptimization(payload);
      showToast('Optimization started — AI is calculating optimal routes', 'success');
      setShowCreate(false);
      setForm({ name: '', deliveryIds: '', vehicleIds: '' });
      load();
    } catch (e: any) {
      showToast(e.message || 'Failed to create optimization', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleSelect = async (opt: RouteOptimization) => {
    try {
      const full = await getOptimization(opt.id);
      setSelected(full);
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'COMPLETED': return 'text-emerald-400 bg-emerald-500/10';
      case 'OPTIMIZING': return 'text-blue-400 bg-blue-500/10';
      case 'FAILED': return 'text-red-400 bg-red-500/10';
      default: return 'text-amber-400 bg-amber-500/10';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-600/20 border border-violet-500/30">
              <Brain className="w-6 h-6 text-violet-400" />
            </div>
            AI Route Optimization
          </h1>
          <p className="text-sm text-white/50 mt-1">Powered by Groq AI — minimize distance, maximize efficiency</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 transition flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 rounded-xl bg-violet-600 text-white font-bold hover:bg-violet-500 transition flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Optimization
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Runs', value: optimizations.length, icon: Route, color: 'text-blue-400' },
          { label: 'Completed', value: optimizations.filter(o => o.status === 'COMPLETED').length, icon: Zap, color: 'text-emerald-400' },
          { label: 'Avg Savings', value: `${Math.round(optimizations.filter(o => o.savingsPercent).reduce((s, o) => s + (o.savingsPercent || 0), 0) / Math.max(optimizations.filter(o => o.savingsPercent).length, 1))}%`, icon: TrendingDown, color: 'text-violet-400' },
          { label: 'In Progress', value: optimizations.filter(o => o.status === 'OPTIMIZING').length, icon: Loader2, color: 'text-amber-400' },
        ].map((s, i) => (
          <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5">
            <div className="flex items-center gap-3">
              <s.icon className={`w-5 h-5 ${s.color}`} />
              <span className="text-xs text-white/50 uppercase tracking-wider">{s.label}</span>
            </div>
            <p className="text-2xl font-black text-white mt-2">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0a1628] rounded-2xl border border-white/10 p-6 w-full max-w-lg space-y-4">
            <h2 className="text-lg font-bold text-white">Create Route Optimization</h2>
            <input
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-violet-500/50 outline-none"
              placeholder="Name (optional)"
              value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            />
            <textarea
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-violet-500/50 outline-none resize-none"
              placeholder="Delivery/Waybill IDs (comma separated)"
              rows={3}
              value={form.deliveryIds} onChange={e => setForm({ ...form, deliveryIds: e.target.value })}
            />
            <textarea
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-violet-500/50 outline-none resize-none"
              placeholder="Vehicle/Driver IDs (comma separated)"
              rows={3}
              value={form.vehicleIds} onChange={e => setForm({ ...form, vehicleIds: e.target.value })}
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-xl bg-white/5 text-white/70 hover:bg-white/10">Cancel</button>
              <button onClick={handleCreate} disabled={creating} className="px-4 py-2 rounded-xl bg-violet-600 text-white font-bold hover:bg-violet-500 disabled:opacity-50 flex items-center gap-2">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {creating ? 'Optimizing...' : 'Run AI Optimization'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Optimizations List */}
        <div className="lg:col-span-2 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
            </div>
          ) : optimizations.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-12 text-center">
              <Route className="w-12 h-12 text-white/20 mx-auto mb-4" />
              <p className="text-white/50">No optimizations yet. Create one to get AI-powered route suggestions.</p>
            </div>
          ) : (
            optimizations.map(opt => (
              <div key={opt.id} onClick={() => handleSelect(opt)} className={`rounded-2xl border ${selected?.id === opt.id ? 'border-violet-500/50 bg-violet-500/5' : 'border-white/10 bg-white/[0.03]'} p-5 cursor-pointer hover:border-white/20 transition`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-bold">{opt.name || 'Unnamed Route'}</h3>
                    <p className="text-xs text-white/40 mt-1">{opt.deliveryIds.length} deliveries / {opt.vehicleIds.length} vehicles</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusColor(opt.status)}`}>{opt.status}</span>
                </div>
                {opt.status === 'COMPLETED' && (
                  <div className="flex gap-6 mt-3 pt-3 border-t border-white/5">
                    <div className="flex items-center gap-1.5 text-xs text-white/60"><MapPin className="w-3.5 h-3.5" />{opt.totalDistance?.toFixed(1)} km</div>
                    <div className="flex items-center gap-1.5 text-xs text-white/60"><Clock className="w-3.5 h-3.5" />{opt.totalDuration?.toFixed(0)} min</div>
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400"><TrendingDown className="w-3.5 h-3.5" />{opt.savingsPercent?.toFixed(1)}% saved</div>
                    <div className="flex items-center gap-1.5 text-xs text-violet-400"><Brain className="w-3.5 h-3.5" />{opt.modelUsed}</div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Detail Panel */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5">
          {selected ? (
            <div className="space-y-4">
              <h3 className="text-white font-bold text-lg">{selected.name}</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-white/50">Status</span><span className={`font-bold ${statusColor(selected.status).split(' ')[0]}`}>{selected.status}</span></div>
                <div className="flex justify-between"><span className="text-white/50">Total Distance</span><span className="text-white">{selected.totalDistance?.toFixed(1) || '—'} km</span></div>
                <div className="flex justify-between"><span className="text-white/50">Total Duration</span><span className="text-white">{selected.totalDuration?.toFixed(0) || '—'} min</span></div>
                <div className="flex justify-between"><span className="text-white/50">Savings</span><span className="text-emerald-400 font-bold">{selected.savingsPercent?.toFixed(1) || '—'}%</span></div>
                <div className="flex justify-between"><span className="text-white/50">AI Model</span><span className="text-violet-400">{selected.modelUsed || '—'}</span></div>
              </div>
              {selected.allocations?.length > 0 && (
                <div className="pt-3 border-t border-white/10">
                  <h4 className="text-xs text-white/50 uppercase tracking-wider mb-2">Allocations ({selected.allocations.length})</h4>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {selected.allocations.map((a, i) => (
                      <div key={a.id} className="flex items-center gap-2 text-xs text-white/70 px-2 py-1.5 rounded-lg bg-white/5">
                        <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-[10px] font-bold">{a.sequence}</span>
                        <span className="truncate flex-1">{a.waybillId.slice(0, 12)}...</span>
                        {a.distance && <span className="text-white/40">{a.distance}km</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selected.aiInsights && (
                <div className="pt-3 border-t border-white/10">
                  <h4 className="text-xs text-white/50 uppercase tracking-wider mb-2">AI Insights</h4>
                  <p className="text-sm text-white/70">{typeof selected.aiInsights === 'object' ? JSON.stringify(selected.aiInsights.summary || selected.aiInsights) : selected.aiInsights}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-white/30">
              <Truck className="w-10 h-10 mb-3" />
              <p className="text-sm">Select an optimization to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
