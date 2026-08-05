import { useState, useEffect, useCallback } from 'react';
import { Navigation, Plus, Play, Square, Ban, Calendar, MapPin, Clock, Truck, Loader2, Route } from 'lucide-react';
import { listRoutePlans, createRoutePlan, activateRoutePlan, completeRoutePlan, cancelRoutePlan, type RoutePlan, type CreateRoutePlanPayload } from '../api/smartRoutingApi';
import { useToast } from '../components/ToastProvider';

export default function SmartRouting() {
  const { showToast } = useToast();
  const [plans, setPlans] = useState<RoutePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState({ name: '', stops: '', scheduledDate: '' });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (filter) params.status = filter;
      setPlans(await listRoutePlans(params));
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [filter, showToast]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    const stops = form.stops.split('\n').filter(Boolean).map(line => {
      const parts = line.split(',').map(s => s.trim());
      return { waybillId: parts[0], lat: parseFloat(parts[1]) || undefined, lng: parseFloat(parts[2]) || undefined, address: parts[3] || undefined };
    });
    if (!stops.length) { showToast('At least one stop is required', 'error'); return; }
    try {
      const payload: CreateRoutePlanPayload = { name: form.name || undefined, stops, scheduledDate: form.scheduledDate || undefined };
      await createRoutePlan(payload);
      showToast('Route plan created with optimized stop order', 'success');
      setShowCreate(false);
      setForm({ name: '', stops: '', scheduledDate: '' });
      load();
    } catch (e: any) { showToast(e.message, 'error'); }
  };

  const handleAction = async (id: string, action: 'activate' | 'complete' | 'cancel') => {
    try {
      if (action === 'activate') await activateRoutePlan(id);
      else if (action === 'complete') await completeRoutePlan(id);
      else await cancelRoutePlan(id);
      showToast(`Route ${action}d successfully`, 'success');
      load();
    } catch (e: any) { showToast(e.message, 'error'); }
  };

  const statusStyle = (s: string) => {
    switch (s) {
      case 'ACTIVE': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'COMPLETED': return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'CANCELLED': return 'bg-red-500/10 text-red-400 border-red-500/30';
      default: return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-600/20 border border-emerald-500/30">
              <Navigation className="w-6 h-6 text-emerald-400" />
            </div>
            Smart Routing
          </h1>
          <p className="text-sm text-white/50 mt-1">Route planning & scheduling with 2-opt optimization</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-500 transition flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Route Plan
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Plans', value: plans.length, color: 'text-white' },
          { label: 'Active', value: plans.filter(p => p.status === 'ACTIVE').length, color: 'text-emerald-400' },
          { label: 'Avg Distance', value: `${Math.round(plans.filter(p => p.estimatedDistance).reduce((s, p) => s + (p.estimatedDistance || 0), 0) / Math.max(plans.filter(p => p.estimatedDistance).length, 1))} km`, color: 'text-blue-400' },
          { label: 'Completed', value: plans.filter(p => p.status === 'COMPLETED').length, color: 'text-violet-400' },
        ].map((s, i) => (
          <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs text-white/50">{s.label}</p>
            <p className={`text-xl font-black mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {['', 'DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED'].map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${filter === f ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-white/5 text-white/50 border border-white/10 hover:border-white/20'}`}>
            {f || 'All'}
          </button>
        ))}
      </div>

      {/* Plans */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-emerald-400 animate-spin" /></div>
      ) : plans.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-12 text-center">
          <Route className="w-12 h-12 text-white/20 mx-auto mb-4" />
          <p className="text-white/50">No route plans yet. Create one to start optimizing delivery routes.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map(plan => (
            <div key={plan.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 hover:border-white/20 transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                    <Navigation className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold">{plan.name || 'Unnamed Route'}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-white/40">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{plan.totalStops} stops</span>
                      {plan.estimatedDistance && <span className="flex items-center gap-1"><Route className="w-3 h-3" />{plan.estimatedDistance.toFixed(1)} km</span>}
                      {plan.estimatedTime && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{plan.estimatedTime} min</span>}
                      {plan.scheduledDate && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(plan.scheduledDate).toLocaleDateString()}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${statusStyle(plan.status)}`}>{plan.status}</span>
                  <div className="flex gap-1">
                    {plan.status === 'DRAFT' && <button onClick={() => handleAction(plan.id, 'activate')} className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20" title="Activate"><Play className="w-4 h-4" /></button>}
                    {plan.status === 'ACTIVE' && <button onClick={() => handleAction(plan.id, 'complete')} className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20" title="Complete"><Square className="w-4 h-4" /></button>}
                    {plan.status !== 'COMPLETED' && plan.status !== 'CANCELLED' && <button onClick={() => handleAction(plan.id, 'cancel')} className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20" title="Cancel"><Ban className="w-4 h-4" /></button>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0a1628] rounded-2xl border border-white/10 p-6 w-full max-w-lg space-y-4">
            <h2 className="text-lg font-bold text-white">Create Route Plan</h2>
            <input className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 outline-none" placeholder="Route name (optional)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <textarea className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 outline-none resize-none font-mono text-xs" rows={6} placeholder="Stops (one per line): waybillId, lat, lng, address" value={form.stops} onChange={e => setForm({ ...form, stops: e.target.value })} />
            <input type="date" className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white/70 outline-none" value={form.scheduledDate} onChange={e => setForm({ ...form, scheduledDate: e.target.value })} />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-xl bg-white/5 text-white/70 hover:bg-white/10">Cancel</button>
              <button onClick={handleCreate} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-500">Create Plan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
