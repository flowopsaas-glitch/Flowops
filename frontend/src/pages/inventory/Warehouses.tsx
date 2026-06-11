import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Warehouse as WarehouseIcon, MapPin, Users, Package, Plus, Trash2, X } from 'lucide-react';
import { inventoryApi } from '../../lib/inventoryApi';

export default function Warehouses() {
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '', code: '', address: '', city: '', province: '',
    postalCode: '', managerName: '', managerPhone: '', capacity: '',
  });

  useEffect(() => { loadWarehouses(); }, []);

  const loadWarehouses = async () => {
    setLoading(true);
    try {
      const res = await inventoryApi.getWarehouses();
      setWarehouses(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error('Failed to load warehouses', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.name.trim() || !form.code.trim()) {
      setError('Branch name and code are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await inventoryApi.createWarehouse({
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        address: form.address || undefined,
        city: form.city || undefined,
        province: form.province || undefined,
        postalCode: form.postalCode || undefined,
        managerName: form.managerName || undefined,
        managerPhone: form.managerPhone || undefined,
        capacity: form.capacity ? Number(form.capacity) : undefined,
      });
      setShowModal(false);
      setForm({ name: '', code: '', address: '', city: '', province: '', postalCode: '', managerName: '', managerPhone: '', capacity: '' });
      loadWarehouses();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create branch');
    }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this branch/warehouse?')) return;
    try {
      await inventoryApi.deleteWarehouse(id);
      loadWarehouses();
    } catch (e) { console.error(e); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60vh', background: '#020617' }}>
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-white p-6 md:p-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black">Branches & Warehouses</h1>
          <p className="text-slate-400 text-sm">Manage your storage facilities and branch locations across South Africa.</p>
        </div>
        <button onClick={() => { setShowModal(true); setError(''); }}
          className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg shadow-blue-500/20 hover:opacity-90 transition-opacity">
          <Plus size={16} /> Add Branch
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {warehouses.map((wh, i) => (
          <motion.div key={wh.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:border-blue-500/30 transition-all group">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-blue-500/10 rounded-xl text-blue-400"><WarehouseIcon size={24} /></div>
              <button onClick={() => handleDelete(wh.id)} className="p-2 bg-slate-800 rounded-lg hover:bg-red-500/20 hover:text-red-400 transition opacity-0 group-hover:opacity-100">
                <Trash2 size={14} />
              </button>
            </div>
            <h3 className="text-xl font-bold mb-1">{wh.name}</h3>
            <p className="text-xs text-blue-400 font-mono mb-4">{wh.code}</p>
            <div className="space-y-3 mb-4">
              {(wh.address || wh.city) && (
                <div className="flex items-start gap-2 text-xs text-slate-400">
                  <MapPin size={14} className="mt-0.5 flex-shrink-0" />
                  <span>{[wh.address, wh.city, wh.province].filter(Boolean).join(', ')}</span>
                </div>
              )}
              {wh.managerName && (
                <div className="flex items-center gap-2 text-xs text-slate-400"><Users size={14} /><span>{wh.managerName}</span></div>
              )}
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Package size={14} /><span>Capacity: {wh.capacity?.toLocaleString() || 'N/A'} units</span>
              </div>
            </div>
            <div className="pt-4 border-t border-white/5 flex justify-between items-center">
              <span className="text-xs text-slate-500">{wh.locations?.length || 0} storage zones</span>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${wh.isActive !== false ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                {wh.isActive !== false ? 'Active' : 'Inactive'}
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      {warehouses.length === 0 && (
        <div className="text-center py-20 text-slate-500">
          <WarehouseIcon className="mx-auto mb-4 opacity-20" size={48} />
          <p className="mb-4">No branches yet. Create your first branch to get started.</p>
          <button onClick={() => setShowModal(true)} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-sm transition-colors">
            + Add Your First Branch
          </button>
        </div>
      )}

      {/* Add Branch Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
          <div className="rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" style={{ background: '#0f1629', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-white">Add Branch / Warehouse</h3>
              <button onClick={() => setShowModal(false)} className="text-white/40 hover:text-white/70"><X size={18} /></button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5' }}>{error}</div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <WhInput label="Branch Name *" value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="Cape Town Hub" />
              <WhInput label="Branch Code *" value={form.code} onChange={v => setForm({ ...form, code: v })} placeholder="CPT-01" />
              <div className="col-span-2"><WhInput label="Address" value={form.address} onChange={v => setForm({ ...form, address: v })} placeholder="123 Logistics Drive" /></div>
              <WhInput label="City" value={form.city} onChange={v => setForm({ ...form, city: v })} placeholder="Cape Town" />
              <WhInput label="Province" value={form.province} onChange={v => setForm({ ...form, province: v })} placeholder="Western Cape" />
              <WhInput label="Postal Code" value={form.postalCode} onChange={v => setForm({ ...form, postalCode: v })} placeholder="8001" />
              <WhInput label="Capacity (units)" value={form.capacity} onChange={v => setForm({ ...form, capacity: v })} placeholder="10000" type="number" />
              <WhInput label="Manager Name" value={form.managerName} onChange={v => setForm({ ...form, managerName: v })} placeholder="John Manager" />
              <WhInput label="Manager Phone" value={form.managerPhone} onChange={v => setForm({ ...form, managerPhone: v })} placeholder="0821234567" />
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-lg text-sm font-medium" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>Cancel</button>
              <button onClick={handleCreate} disabled={saving} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: saving ? 'rgba(59,130,246,0.5)' : 'linear-gradient(135deg, #2563eb, #4f46e5)' }}>
                {saving ? 'Creating...' : 'Create Branch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WhInput({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }} />
    </div>
  );
}
