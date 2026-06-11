import { useEffect, useState } from 'react';
import {
  Users, UserPlus, Truck, Shield, Key, Trash2, RefreshCw, Search,
  Mail, Phone, Car, X, CheckCircle, Eye, EyeOff
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import PageSkeleton from '@/components/ui/PageSkeleton';
import EmptyState from '@/components/ui/EmptyState';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

interface StaffUser {
  id: number;
  name?: string;
  email: string;
  role: string;
  isActive?: boolean;
  createdAt?: string;
}

interface Driver {
  id: number;
  name: string;
  phone: string;
  email?: string;
  vehicleReg?: string;
  vehicleType?: string;
  zone?: string;
  status?: string;
  availabilityStatus?: string;
}

type Tab = 'staff' | 'drivers';

const roleConfig: Record<string, { label: string; color: string }> = {
  COMPANY_ADMIN: { label: 'Company Admin', color: '#A78BFA' },
  ADMIN: { label: 'Admin', color: '#A78BFA' },
  DISPATCHER: { label: 'Dispatcher', color: '#6C9EFF' },
  WAREHOUSE_CLERK: { label: 'Warehouse Clerk', color: '#FBBF24' },
  OPERATOR: { label: 'Operator', color: '#4ADE80' },
  USER: { label: 'User', color: 'rgba(255,255,255,0.5)' },
  DRIVER: { label: 'Driver', color: '#22D3EE' },
};

export default function TenantUsersRolesPage() {
  const [tab, setTab] = useState<Tab>('staff');
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  // Staff form
  const [staffForm, setStaffForm] = useState({ name: '', email: '', password: '', role: 'DISPATCHER' });
  // Driver form
  const [driverForm, setDriverForm] = useState({ name: '', phone: '', email: '', vehicleReg: '', vehicleType: '', zone: '', pin: '' });

  const token = localStorage.getItem('access_token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const loadData = async () => {
    setLoading(true);
    try {
      const [staffRes, driversRes] = await Promise.all([
        fetch(`${API_URL}/users/my-company`, { headers }),
        fetch(`${API_URL}/drivers`, { headers }),
      ]);
      if (staffRes.ok) {
        const data = await staffRes.json();
        setStaff(Array.isArray(data) ? data : data.users || []);
      }
      if (driversRes.ok) {
        const data = await driversRes.json();
        setDrivers(Array.isArray(data) ? data : []);
      }
    } catch (e) { console.error('Failed to load team:', e); }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let pwd = '';
    for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
    return pwd + '!' + new Date().getFullYear();
  };

  const handleCreateStaff = async () => {
    if (!staffForm.name.trim() || !staffForm.email.trim()) {
      setStatus('Name and email are required');
      return;
    }
    setSaving(true);
    setStatus('');
    const password = staffForm.password || generatePassword();
    try {
      const res = await fetch(`${API_URL}/users/my-company`, {
        method: 'POST', headers,
        body: JSON.stringify({ name: staffForm.name, email: staffForm.email.toLowerCase().trim(), password, role: staffForm.role }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to create staff member');
      }
      setStatus(`✓ Created ${staffForm.name} (${staffForm.role}) — password: ${password}`);
      setStaffForm({ name: '', email: '', password: '', role: 'DISPATCHER' });
      setShowStaffModal(false);
      loadData();
    } catch (e: any) {
      setStatus(e.message);
    }
    setSaving(false);
  };

  const handleCreateDriver = async () => {
    if (!driverForm.name.trim() || !driverForm.phone.trim()) {
      setStatus('Driver name and phone are required');
      return;
    }
    setSaving(true);
    setStatus('');
    try {
      const res = await fetch(`${API_URL}/drivers`, {
        method: 'POST', headers,
        body: JSON.stringify(driverForm),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to create driver');
      }
      setStatus(`✓ Driver ${driverForm.name} added to fleet`);
      setDriverForm({ name: '', phone: '', email: '', vehicleReg: '', vehicleType: '', zone: '', pin: '' });
      setShowDriverModal(false);
      loadData();
    } catch (e: any) {
      setStatus(e.message);
    }
    setSaving(false);
  };

  const handleDeleteDriver = async (id: number) => {
    if (!confirm('Remove this driver from your fleet?')) return;
    try {
      await fetch(`${API_URL}/drivers/${id}`, { method: 'DELETE', headers });
      loadData();
    } catch (e) { console.error(e); }
  };

  const filteredStaff = staff.filter(s =>
    s.name?.toLowerCase().includes(search.toLowerCase()) || s.email?.toLowerCase().includes(search.toLowerCase())
  );
  const filteredDrivers = drivers.filter(d =>
    d.name?.toLowerCase().includes(search.toLowerCase()) || d.phone?.includes(search)
  );

  return (
    <div style={{ padding: '24px', minHeight: '100%' }}>
      <PageHeader icon={Users} title="Team Management" description="Manage your staff, dispatchers, warehouse clerks, and driver fleet" color="#6C9EFF">
        <button onClick={loadData} style={btnGhost}>
          <RefreshCw size={13} /> Refresh
        </button>
      </PageHeader>

      {/* Status banner */}
      {status && (
        <div style={{
          marginBottom: '16px', padding: '12px 16px', borderRadius: '10px', fontSize: '13px',
          background: status.startsWith('✓') ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
          color: status.startsWith('✓') ? '#4ADE80' : '#fca5a5',
          border: `1px solid ${status.startsWith('✓') ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.25)'}`,
        }}>
          {status}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" style={{ marginBottom: '20px' }}>
        <MiniStat label="Total Staff" value={staff.length} icon={Users} color="#6C9EFF" />
        <MiniStat label="Dispatchers" value={staff.filter(s => s.role === 'DISPATCHER').length} icon={Truck} color="#6C9EFF" />
        <MiniStat label="Warehouse Clerks" value={staff.filter(s => s.role === 'WAREHOUSE_CLERK').length} icon={Shield} color="#FBBF24" />
        <MiniStat label="Drivers" value={drivers.length} icon={Car} color="#22D3EE" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button onClick={() => setTab('staff')} style={tabBtn(tab === 'staff', '#6C9EFF')}>
          <Users size={14} /> Staff ({staff.length})
        </button>
        <button onClick={() => setTab('drivers')} style={tabBtn(tab === 'drivers', '#22D3EE')}>
          <Car size={14} /> Drivers ({drivers.length})
        </button>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tab === 'staff' ? 'Search staff...' : 'Search drivers...'}
            style={{ width: '100%', paddingLeft: '36px', paddingRight: '12px', paddingTop: '10px', paddingBottom: '10px', borderRadius: '10px', fontSize: '13px', color: 'white', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none' }} />
        </div>
        {tab === 'staff' ? (
          <button onClick={() => { setShowStaffModal(true); setStatus(''); }} style={btnPrimary('#6C9EFF', '#A78BFA')}>
            <UserPlus size={14} /> Add Staff
          </button>
        ) : (
          <button onClick={() => { setShowDriverModal(true); setStatus(''); }} style={btnPrimary('#22D3EE', '#6C9EFF')}>
            <Car size={14} /> Add Driver
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <PageSkeleton type="table" rows={5} />
      ) : tab === 'staff' ? (
        filteredStaff.length === 0 ? (
          <EmptyState icon={Users} title={search ? 'No matching staff' : 'No staff members'} description={search ? 'Try a different search.' : 'Add dispatchers, warehouse clerks, and operators to your team.'} actionLabel={!search ? 'Add Staff Member' : undefined} onAction={() => setShowStaffModal(true)} color="#6C9EFF" />
        ) : (
          <div style={tableWrap}>
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Name', 'Email', 'Role', 'Status', 'Joined'].map(h => <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((u, i) => {
                  const rc = roleConfig[u.role] || roleConfig.USER;
                  return (
                    <tr key={u.id} style={{ borderBottom: i < filteredStaff.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }} className="hover:bg-white/[0.02] transition-colors">
                      <td style={{ ...td, fontWeight: 600, color: 'white' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '30px', height: '30px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, background: `${rc.color}15`, color: rc.color }}>
                            {(u.name || u.email)[0].toUpperCase()}
                          </div>
                          {u.name || u.email.split('@')[0]}
                        </div>
                      </td>
                      <td style={{ ...td, color: 'rgba(255,255,255,0.6)' }}>{u.email}</td>
                      <td style={td}><span style={{ fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px', background: `${rc.color}15`, color: rc.color }}>{rc.label}</span></td>
                      <td style={td}>
                        <span style={{ fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px', background: (u.isActive ?? true) ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)', color: (u.isActive ?? true) ? '#4ADE80' : '#F87171' }}>
                          {(u.isActive ?? true) ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ ...td, color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        filteredDrivers.length === 0 ? (
          <EmptyState icon={Car} title={search ? 'No matching drivers' : 'No drivers in fleet'} description={search ? 'Try a different search.' : 'Add drivers to your fleet. They become available for collection and dispatch assignment.'} actionLabel={!search ? 'Add First Driver' : undefined} onAction={() => setShowDriverModal(true)} color="#22D3EE" />
        ) : (
          <div style={tableWrap}>
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Driver', 'Phone', 'Vehicle', 'Zone', 'Status', ''].map(h => <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filteredDrivers.map((d, i) => (
                  <tr key={d.id} style={{ borderBottom: i < filteredDrivers.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }} className="hover:bg-white/[0.02] transition-colors">
                    <td style={{ ...td, fontWeight: 600, color: 'white' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '30px', height: '30px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(34,211,238,0.12)' }}>
                          <Car size={14} color="#22D3EE" />
                        </div>
                        {d.name}
                      </div>
                    </td>
                    <td style={{ ...td, color: 'rgba(255,255,255,0.6)' }}>{d.phone}</td>
                    <td style={{ ...td, color: 'rgba(255,255,255,0.6)' }}>{d.vehicleReg || d.vehicleType || '—'}</td>
                    <td style={{ ...td, color: 'rgba(255,255,255,0.6)' }}>{d.zone || '—'}</td>
                    <td style={td}>
                      <span style={{ fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px', background: (d.availabilityStatus || d.status) === 'AVAILABLE' ? 'rgba(74,222,128,0.12)' : 'rgba(251,191,36,0.12)', color: (d.availabilityStatus || d.status) === 'AVAILABLE' ? '#4ADE80' : '#FBBF24' }}>
                        {d.availabilityStatus || d.status || 'AVAILABLE'}
                      </span>
                    </td>
                    <td style={td}>
                      <button onClick={() => handleDeleteDriver(d.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F87171', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                        <Trash2 size={12} /> Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Add Staff Modal */}
      {showStaffModal && (
        <Modal title="Add Staff Member" onClose={() => setShowStaffModal(false)}>
          <FieldInput icon={Users} label="Full Name *" value={staffForm.name} onChange={v => setStaffForm({ ...staffForm, name: v })} placeholder="John Smith" />
          <FieldInput icon={Mail} label="Email *" value={staffForm.email} onChange={v => setStaffForm({ ...staffForm, email: v })} placeholder="john@company.co.za" type="email" />
          <div style={{ marginBottom: '14px' }}>
            <label style={fieldLabel}><Shield size={11} /> Role</label>
            <select value={staffForm.role} onChange={e => setStaffForm({ ...staffForm, role: e.target.value })} style={selectStyle}>
              <option value="DISPATCHER" style={optStyle}>Dispatcher</option>
              <option value="WAREHOUSE_CLERK" style={optStyle}>Warehouse Clerk</option>
              <option value="OPERATOR" style={optStyle}>Operator</option>
              <option value="COMPANY_ADMIN" style={optStyle}>Company Admin</option>
            </select>
          </div>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ ...fieldLabel, justifyContent: 'space-between' }}>
              <span><Key size={11} style={{ display: 'inline', marginRight: '4px' }} /> Password (blank = auto-generate)</span>
              <button type="button" onClick={() => setStaffForm({ ...staffForm, password: generatePassword() })} style={{ fontSize: '11px', color: '#6C9EFF', background: 'none', border: 'none', cursor: 'pointer' }}>Generate</button>
            </label>
            <div style={{ position: 'relative' }}>
              <input type={showPassword ? 'text' : 'password'} value={staffForm.password} onChange={e => setStaffForm({ ...staffForm, password: e.target.value })} placeholder="Auto-generated if empty"
                style={{ ...inputStyle, paddingRight: '38px' }} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer' }}>
                {showPassword ? <EyeOff size={15} color="rgba(255,255,255,0.4)" /> : <Eye size={15} color="rgba(255,255,255,0.4)" />}
              </button>
            </div>
          </div>
          <ModalActions onCancel={() => setShowStaffModal(false)} onSave={handleCreateStaff} saving={saving} saveLabel="Create Staff" />
        </Modal>
      )}

      {/* Add Driver Modal */}
      {showDriverModal && (
        <Modal title="Add Driver to Fleet" onClose={() => setShowDriverModal(false)}>
          <FieldInput icon={Users} label="Driver Name *" value={driverForm.name} onChange={v => setDriverForm({ ...driverForm, name: v })} placeholder="Sipho Dlamini" />
          <FieldInput icon={Phone} label="Phone *" value={driverForm.phone} onChange={v => setDriverForm({ ...driverForm, phone: v })} placeholder="0821234567" />
          <FieldInput icon={Mail} label="Email" value={driverForm.email} onChange={v => setDriverForm({ ...driverForm, email: v })} placeholder="driver@company.co.za" type="email" />
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}><FieldInput icon={Car} label="Vehicle Reg" value={driverForm.vehicleReg} onChange={v => setDriverForm({ ...driverForm, vehicleReg: v })} placeholder="CA 123-456" /></div>
            <div style={{ flex: 1 }}><FieldInput icon={Truck} label="Vehicle Type" value={driverForm.vehicleType} onChange={v => setDriverForm({ ...driverForm, vehicleType: v })} placeholder="Van" /></div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}><FieldInput icon={Search} label="Zone" value={driverForm.zone} onChange={v => setDriverForm({ ...driverForm, zone: v })} placeholder="Sandton" /></div>
            <div style={{ flex: 1 }}><FieldInput icon={Key} label="Driver PIN" value={driverForm.pin} onChange={v => setDriverForm({ ...driverForm, pin: v })} placeholder="4-digit PIN" /></div>
          </div>
          <ModalActions onCancel={() => setShowDriverModal(false)} onSave={handleCreateDriver} saving={saving} saveLabel="Add Driver" />
        </Modal>
      )}
    </div>
  );
}

// ── Reusable styles ──
const btnGhost: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: 'none', cursor: 'pointer' };
const btnPrimary = (c1: string, c2: string): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, background: `linear-gradient(135deg, ${c1}, ${c2})`, color: 'white', border: 'none', cursor: 'pointer' });
const tabBtn = (active: boolean, color: string): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: `1px solid ${active ? `${color}40` : 'rgba(255,255,255,0.06)'}`, background: active ? `${color}15` : 'rgba(255,255,255,0.03)', color: active ? color : 'rgba(255,255,255,0.5)' });
const tableWrap: React.CSSProperties = { borderRadius: '12px', overflow: 'hidden', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)' };
const th: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' };
const td: React.CSSProperties = { padding: '12px 16px' };
const fieldLabel: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 500, marginBottom: '6px', color: 'rgba(255,255,255,0.5)' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', color: 'white', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none' };
const selectStyle: React.CSSProperties = { ...inputStyle };
const optStyle: React.CSSProperties = { background: '#0f1629' };

function MiniStat({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <div style={{ borderRadius: '10px', padding: '14px 16px', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div style={{ width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}12` }}>
        <Icon size={15} color={color} />
      </div>
      <div>
        <div style={{ fontSize: '20px', fontWeight: 700, color: 'white' }}>{value}</div>
        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{label}</div>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div style={{ borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '460px', background: '#0f1629', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'white' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color="rgba(255,255,255,0.4)" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ onCancel, onSave, saving, saveLabel }: { onCancel: () => void; onSave: () => void; saving: boolean; saveLabel: string }) {
  return (
    <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
      <button onClick={onCancel} style={{ flex: 1, padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: 'none', cursor: 'pointer' }}>Cancel</button>
      <button onClick={onSave} disabled={saving} style={{ flex: 1, padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, background: 'linear-gradient(135deg, #6C9EFF, #A78BFA)', color: 'white', border: 'none', cursor: 'pointer' }}>
        {saving ? 'Saving...' : saveLabel}
      </button>
    </div>
  );
}

function FieldInput({ icon: Icon, label, value, onChange, placeholder, type = 'text' }: any) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={fieldLabel}><Icon size={11} /> {label}</label>
      <input type={type} value={value} onChange={(e: any) => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
    </div>
  );
}
