import { useEffect, useState } from 'react';
import { Users, Plus, Search, RefreshCw, Building2, Mail, Phone, X, CreditCard } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import PageSkeleton from '@/components/ui/PageSkeleton';
import EmptyState from '@/components/ui/EmptyState';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

interface Client {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  billingType?: string;
  accountCode?: string;
  creditLimit?: number;
  createdAt?: string;
}

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', billingType: 'PREPAID', accountCode: '', creditLimit: '' });
  const [saving, setSaving] = useState(false);

  const token = localStorage.getItem('access_token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/clients`, { headers });
      if (res.ok) {
        const data = await res.json();
        setClients(Array.isArray(data) ? data : []);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/clients`, {
        method: 'POST', headers,
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          billingType: formData.billingType,
          accountCode: formData.accountCode || undefined,
          creditLimit: formData.creditLimit ? Number(formData.creditLimit) : undefined,
        }),
      });
      if (res.ok) { setShowForm(false); setFormData({ name: '', email: '', phone: '', billingType: 'PREPAID', accountCode: '', creditLimit: '' }); loadData(); }
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  useEffect(() => { loadData(); }, []);

  const filtered = clients.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: '24px', minHeight: '100%' }}>
      <PageHeader icon={Users} title="Clients" description="Manage your client portfolio" color="#4ADE80">
        <button onClick={loadData} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 500,
          background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)',
          border: 'none', cursor: 'pointer',
        }}>
          <RefreshCw size={13} />
        </button>
        <button onClick={() => setShowForm(true)} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
          background: 'linear-gradient(135deg, #4ADE80, #22D3EE)', color: 'white',
          border: 'none', cursor: 'pointer',
        }}>
          <Plus size={13} /> Add Client
        </button>
      </PageHeader>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '20px', maxWidth: '400px' }}>
        <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients..."
          style={{ width: '100%', paddingLeft: '36px', paddingRight: '12px', paddingTop: '10px', paddingBottom: '10px', borderRadius: '10px', fontSize: '13px', color: 'white', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none' }} />
      </div>

      {/* Content */}
      {loading ? (
        <PageSkeleton type="table" rows={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search ? "No matching clients" : "No clients yet"}
          description={search ? "Try a different search term." : "Add your first client to start managing your portfolio."}
          actionLabel={!search ? "Add First Client" : undefined}
          onAction={() => setShowForm(true)}
          color="#4ADE80"
        />
      ) : (
        <div style={{ borderRadius: '12px', overflow: 'hidden', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Client', 'Email', 'Phone', 'Billing', 'Added'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr key={c.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                  className="hover:bg-white/[0.02] transition-colors">
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(74,222,128,0.1)' }}>
                        <Building2 size={14} color="#4ADE80" />
                      </div>
                      <span style={{ fontWeight: 600, color: 'white' }}>{c.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.6)' }}>{c.email || '—'}</td>
                  <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.6)' }}>{c.phone || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    {(() => {
                      const bt = (c.billingType || 'PREPAID').toUpperCase();
                      const colors: Record<string, { bg: string; color: string }> = {
                        PREPAID: { bg: 'rgba(74,222,128,0.12)', color: '#4ADE80' },
                        CONTRACT: { bg: 'rgba(108,158,255,0.12)', color: '#6C9EFF' },
                        COD: { bg: 'rgba(251,191,36,0.12)', color: '#FBBF24' },
                      };
                      const cc = colors[bt] || colors.PREPAID;
                      return (
                        <span style={{ fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px', background: cc.bg, color: cc.color }}>
                          {bt}{bt === 'CONTRACT' && c.accountCode ? ` · ${c.accountCode}` : ''}
                        </span>
                      );
                    })()}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>
                    {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Client Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
          <div style={{ borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '420px', background: '#0f1629', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'white' }}>Add New Client</h3>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color="rgba(255,255,255,0.4)" /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <FormInput icon={Building2} label="Company Name *" value={formData.name} onChange={v => setFormData({ ...formData, name: v })} placeholder="Client company name" />
              <FormInput icon={Mail} label="Email" value={formData.email} onChange={v => setFormData({ ...formData, email: v })} placeholder="client@company.co.za" type="email" />
              <FormInput icon={Phone} label="Phone" value={formData.phone} onChange={v => setFormData({ ...formData, phone: v })} placeholder="+27 XX XXX XXXX" />
              {/* Billing Type */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 500, marginBottom: '6px', color: 'rgba(255,255,255,0.5)' }}>
                  <CreditCard size={11} /> Billing Type
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[
                    { v: 'PREPAID', label: 'Prepaid', desc: 'Pay upfront' },
                    { v: 'CONTRACT', label: 'Contract', desc: 'Monthly account' },
                    { v: 'COD', label: 'COD', desc: 'Cash on delivery' },
                  ].map(opt => {
                    const active = formData.billingType === opt.v;
                    return (
                      <button key={opt.v} type="button" onClick={() => setFormData({ ...formData, billingType: opt.v })}
                        style={{
                          flex: 1, padding: '10px 8px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center',
                          border: `2px solid ${active ? '#4ADE80' : 'rgba(255,255,255,0.08)'}`,
                          background: active ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.03)',
                        }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: active ? '#4ADE80' : 'rgba(255,255,255,0.6)' }}>{opt.label}</div>
                        <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', marginTop: '2px' }}>{opt.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Conditional fields based on billing type */}
              {formData.billingType === 'CONTRACT' && (
                <>
                  <FormInput icon={Building2} label="Account Code (optional)" value={formData.accountCode} onChange={v => setFormData({ ...formData, accountCode: v })} placeholder="e.g. ACC-00123" />
                  <FormInput icon={CreditCard} label="Credit Limit (R)" value={formData.creditLimit} onChange={v => setFormData({ ...formData, creditLimit: v })} placeholder="e.g. 50000" type="number" />
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: 'none', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleCreate} disabled={saving} style={{ flex: 1, padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, background: 'linear-gradient(135deg, #4ADE80, #22D3EE)', color: 'white', border: 'none', cursor: 'pointer' }}>
                {saving ? 'Saving...' : 'Add Client'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FormInput({ icon: Icon, label, value, onChange, placeholder, type = 'text' }: any) {
  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 500, marginBottom: '6px', color: 'rgba(255,255,255,0.5)' }}>
        <Icon size={11} /> {label}
      </label>
      <input type={type} value={value} onChange={(e: any) => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', color: 'white', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none' }} />
    </div>
  );
}
