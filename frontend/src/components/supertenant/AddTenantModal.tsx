import { useState } from 'react';
import { X } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

interface AddTenantModalProps {
  onClose: () => void;
  onSaved: () => void;
}

export default function AddTenantModal({ onClose, onSaved }: AddTenantModalProps) {
  const [form, setForm] = useState({ name: '', plan: 'STARTER', status: 'Active' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_BASE}/companies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: form.name, plan: form.plan, status: form.status, isActive: true })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to create tenant');
      }
      onSaved();
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="rounded-2xl p-6 w-full max-w-md"
        style={{ background: '#0f1629', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-white">Add New Tenant</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white/70"><X size={18} /></button>
        </div>
        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm"
            style={{ background: 'rgba(239,68,68,0.2)', color: '#fca5a5' }}>{error}</div>
        )}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5"
              style={{ color: 'rgba(255,255,255,0.5)' }}>Tenant Name</label>
            <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
              className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5"
              style={{ color: 'rgba(255,255,255,0.5)' }}>Plan</label>
            <select value={form.plan} onChange={e => setForm({...form, plan: e.target.value})}
              className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <option value="STARTER">Starter</option>
              <option value="PROFESSIONAL">Pro</option>
              <option value="ENTERPRISE">Enterprise</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm font-medium"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: saving ? 'rgba(108,158,255,0.5)' : 'linear-gradient(135deg, #6C9EFF, #A78BFA)' }}>
            {saving ? 'Creating...' : 'Add Tenant'}
          </button>
        </div>
      </div>
    </div>
  );
}
