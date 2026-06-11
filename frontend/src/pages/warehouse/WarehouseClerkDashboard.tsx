import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import {
  Warehouse, Package, PackageCheck, PackageMinus, Search, PenTool,
  X, CheckCircle, Loader2, LayoutDashboard, ArrowLeftRight, Bell, LogOut,
  Plus, Scan, ScanLine, RefreshCw, AlertTriangle, Clock
} from 'lucide-react';
import axios from 'axios';
import { FLOWOPS_API_URL } from '@/lib/env';

const API = FLOWOPS_API_URL;

type ModalType = 'none' | 'checkin' | 'checkout';
type NavTab = 'dashboard' | 'checkin' | 'checkout' | 'search';

const navItems = [
  { id: 'dashboard' as NavTab, icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'checkin' as NavTab, icon: PackageCheck, label: 'Check In' },
  { id: 'checkout' as NavTab, icon: PackageMinus, label: 'Check Out' },
  { id: 'search' as NavTab, icon: Search, label: 'Search' },
];

const token = () => localStorage.getItem('access_token');
const headers = () => ({ Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' });

export default function WarehouseClerkDashboard() {
  const navigate = useNavigate();
  const [warehouseId] = useState<number>(1);
  const [stats, setStats] = useState<any>(null);
  const [parcels, setParcels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState('');

  // Check-in form
  const [checkInForm, setCheckInForm] = useState({
    senderName: '', senderPhone: '', receiverName: '', receiverPhone: '',
    destination: '', description: '', weight: '', storageLocation: ''
  });
  // Check-out form
  const [checkOutQuery, setCheckOutQuery] = useState('');
  const [foundWaybill, setFoundWaybill] = useState<any>(null);
  const [collectorName, setCollectorName] = useState('');
  const [collectorPhone, setCollectorPhone] = useState('');
  const [collectorId, setCollectorId] = useState('');
  const [saving, setSaving] = useState(false);
  const sigPad = useRef<any>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, parcelsRes] = await Promise.all([
        axios.get(`${API}/warehouse-clerk/overview/${warehouseId}`, { headers: headers() }),
        axios.get(`${API}/warehouse-clerk/recent/${warehouseId}?limit=20`, { headers: headers() }),
      ]);
      setStats(statsRes.data);
      setParcels(Array.isArray(parcelsRes.data) ? parcelsRes.data : []);
    } catch (err: any) {
      if (err.response?.status === 401) navigate('/warehouse/login');
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [warehouseId]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await axios.get(`${API}/warehouse-clerk/search/${warehouseId}?q=${encodeURIComponent(searchQuery)}`, { headers: headers() });
      setSearchResults(Array.isArray(res.data) ? res.data : []);
    } catch (e) { setSearchResults([]); }
    setSearching(false);
  };

  const handleCheckIn = async () => {
    if (!checkInForm.senderName || !checkInForm.receiverName) { setStatus('Sender and receiver name are required'); return; }
    setSaving(true);
    setStatus('');
    try {
      await axios.post(`${API}/warehouse-clerk/check-in`, {
        ...checkInForm, warehouseId,
        weight: checkInForm.weight ? Number(checkInForm.weight) : undefined,
      }, { headers: headers() });
      setStatus('✓ Parcel checked in successfully');
      setCheckInForm({ senderName: '', senderPhone: '', receiverName: '', receiverPhone: '', destination: '', description: '', weight: '', storageLocation: '' });
      loadData();
    } catch (err: any) {
      setStatus(err.response?.data?.message || 'Check-in failed');
    }
    setSaving(false);
  };

  const findWaybill = async () => {
    if (!checkOutQuery.trim()) return;
    try {
      const res = await axios.get(`${API}/warehouse-clerk/search/${warehouseId}?q=${encodeURIComponent(checkOutQuery)}`, { headers: headers() });
      const results = Array.isArray(res.data) ? res.data : [];
      setFoundWaybill(results[0] || null);
      if (!results[0]) setStatus('No waybill found with that number');
    } catch { setStatus('Search failed'); }
  };

  const handleCheckOut = async () => {
    if (!foundWaybill || !collectorName) { setStatus('Find a waybill and enter collector name'); return; }
    setSaving(true);
    setStatus('');
    try {
      const signatureData = sigPad.current && !sigPad.current.isEmpty()
        ? sigPad.current.toDataURL('image/png') : undefined;
      await axios.post(`${API}/warehouse-clerk/check-out`, {
        waybillNumber: foundWaybill.waybillNumber,
        warehouseId, collectorName, collectorPhone, collectorId, signatureData,
      }, { headers: headers() });
      setStatus('✓ Parcel checked out successfully');
      setFoundWaybill(null);
      setCollectorName(''); setCollectorPhone(''); setCollectorId('');
      sigPad.current?.clear();
      loadData();
    } catch (err: any) {
      setStatus(err.response?.data?.message || 'Check-out failed');
    }
    setSaving(false);
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    navigate('/warehouse/login', { replace: true });
  };

  const statCards = [
    { label: 'In Warehouse', value: stats?.stats?.totalParcels ?? 0, icon: Package, color: '#6C9EFF', bg: 'rgba(108,158,255,0.12)' },
    { label: 'Pending Pickup', value: stats?.stats?.pendingPickup ?? 0, icon: Clock, color: '#FBBF24', bg: 'rgba(251,191,36,0.12)' },
    { label: 'Ready for Collection', value: stats?.stats?.pendingCollection ?? 0, icon: PackageCheck, color: '#4ADE80', bg: 'rgba(74,222,128,0.12)' },
    { label: "Today's In", value: stats?.stats?.todayIn ?? 0, icon: ArrowLeftRight, color: '#A78BFA', bg: 'rgba(167,139,250,0.12)' },
  ];

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0a0f1e', fontFamily: 'sans-serif', color: 'white', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{ width: '200px', minWidth: '200px', display: 'flex', flexDirection: 'column', background: '#080d1a', borderRight: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, height: '100vh' }}>
        {/* Logo */}
        <div style={{ padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #FBBF24, #F59E0B)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Warehouse size={16} color="white" />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 900, color: 'white', letterSpacing: '0.5px' }}>FLOWOPS</div>
            <div style={{ fontSize: '9px', fontWeight: 600, color: 'rgba(255,255,255,0.35)' }}>WAREHOUSE</div>
          </div>
        </div>

        {/* Branch info */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginBottom: '2px' }}>Location</div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'white' }}>{stats?.warehouse?.name || 'Warehouse 1'}</div>
          <div style={{ fontSize: '10px', color: '#FBBF24', marginTop: '2px' }}>{stats?.warehouse?.code || 'WHN-01'}</div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
          {navItems.map(({ id, icon: Icon, label }) => {
            const active = activeTab === id;
            return (
              <button key={id} onClick={() => setActiveTab(id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 12px', borderRadius: '8px', fontSize: '13px', border: 'none',
                  cursor: 'pointer', textAlign: 'left', marginBottom: '2px',
                  color: active ? '#FBBF24' : 'rgba(255,255,255,0.5)',
                  background: active ? 'rgba(251,191,36,0.12)' : 'transparent',
                  fontWeight: active ? 600 : 400,
                }}>
                <Icon size={15} />
                {label}
              </button>
            );
          })}
        </nav>

        {/* Logout */}
        <div style={{ padding: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={logout}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', color: 'rgba(255,255,255,0.4)', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
            <LogOut size={15} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Topbar */}
        <header style={{ height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', background: 'rgba(8,13,26,0.95)', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <div>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'white' }}>
              {navItems.find(n => n.id === activeTab)?.label || 'Dashboard'}
            </span>
            <span style={{ marginLeft: '10px', fontSize: '11px', padding: '2px 8px', borderRadius: '9999px', fontWeight: 700, background: 'rgba(251,191,36,0.15)', color: '#FBBF24' }}>
              WAREHOUSE CLERK
            </span>
          </div>
          <button onClick={loadData} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: 'none', cursor: 'pointer' }}>
            <RefreshCw size={12} /> Refresh
          </button>
        </header>

        {/* Status Banner */}
        {status && (
          <div style={{
            margin: '12px 24px 0', padding: '10px 14px', borderRadius: '8px', fontSize: '13px',
            background: status.startsWith('✓') ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
            color: status.startsWith('✓') ? '#4ADE80' : '#fca5a5',
            border: `1px solid ${status.startsWith('✓') ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.25)'}`,
          }}>
            {status}
          </div>
        )}

        {/* Page Content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

          {/* ── DASHBOARD ── */}
          {activeTab === 'dashboard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '48px', color: 'rgba(255,255,255,0.4)' }}><Loader2 size={24} style={{ margin: '0 auto 8px', display: 'block' }} />Loading...</div>
              ) : (
                <>
                  {/* Stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                    {statCards.map(({ label, value, icon: Icon, color, bg }) => (
                      <div key={label} style={{ borderRadius: '12px', padding: '18px', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>{label}</span>
                          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={14} style={{ color }} /></div>
                        </div>
                        <div style={{ fontSize: '28px', fontWeight: 700, color: 'white' }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Quick Actions */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <button onClick={() => setActiveTab('checkin')} style={{ padding: '16px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #FBBF24, #F59E0B)', color: 'white', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <PackageCheck size={16} /> Check In Parcel
                    </button>
                    <button onClick={() => setActiveTab('checkout')} style={{ padding: '16px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #6C9EFF, #A78BFA)', color: 'white', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <PackageMinus size={16} /> Check Out Parcel
                    </button>
                  </div>

                  {/* Recent Parcels */}
                  <div>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'white', marginBottom: '12px' }}>Recent Activity</h3>
                    {parcels.length === 0 ? (
                      <div style={{ borderRadius: '12px', padding: '32px', textAlign: 'center', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>
                        No recent parcels. Check in the first one!
                      </div>
                    ) : (
                      <div style={{ borderRadius: '12px', overflow: 'hidden', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        {parcels.slice(0, 8).map((p: any, i: number) => (
                          <div key={p.id || i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: i < Math.min(parcels.length - 1, 7) ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <Package size={14} style={{ color: '#6C9EFF' }} />
                              <div>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: 'white' }}>{p.waybillNumber || `WB-${p.id}`}</div>
                                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{p.receiverName || p.recipient || '—'}</div>
                              </div>
                            </div>
                            <span style={{
                              fontSize: '9px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', textTransform: 'uppercase',
                              background: p.status === 'RECEIVED' ? 'rgba(108,158,255,0.12)' : p.status === 'IN_WAREHOUSE' ? 'rgba(251,191,36,0.12)' : 'rgba(74,222,128,0.12)',
                              color: p.status === 'RECEIVED' ? '#6C9EFF' : p.status === 'IN_WAREHOUSE' ? '#FBBF24' : '#4ADE80',
                            }}>{p.status?.replace('_', ' ') || 'RECEIVED'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── CHECK IN ── */}
          {activeTab === 'checkin' && (
            <div style={{ maxWidth: '600px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'white', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PackageCheck size={18} style={{ color: '#FBBF24' }} /> Check In Parcel
              </h2>
              <div style={{ background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <WField label="Sender Name *" value={checkInForm.senderName} onChange={v => setCheckInForm({ ...checkInForm, senderName: v })} placeholder="Sender" />
                  <WField label="Sender Phone" value={checkInForm.senderPhone} onChange={v => setCheckInForm({ ...checkInForm, senderPhone: v })} placeholder="+27 XX XXX" />
                  <WField label="Receiver Name *" value={checkInForm.receiverName} onChange={v => setCheckInForm({ ...checkInForm, receiverName: v })} placeholder="Receiver" />
                  <WField label="Receiver Phone" value={checkInForm.receiverPhone} onChange={v => setCheckInForm({ ...checkInForm, receiverPhone: v })} placeholder="+27 XX XXX" />
                  <WField label="Destination" value={checkInForm.destination} onChange={v => setCheckInForm({ ...checkInForm, destination: v })} placeholder="City/Branch" />
                  <WField label="Weight (kg)" value={checkInForm.weight} onChange={v => setCheckInForm({ ...checkInForm, weight: v })} placeholder="0.5" type="number" />
                  <WField label="Storage Location" value={checkInForm.storageLocation} onChange={v => setCheckInForm({ ...checkInForm, storageLocation: v })} placeholder="Shelf A-3" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '6px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Description</label>
                  <textarea value={checkInForm.description} onChange={e => setCheckInForm({ ...checkInForm, description: e.target.value })} placeholder="Package contents..." rows={2}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', color: 'white', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
                </div>
                <button onClick={handleCheckIn} disabled={saving} style={{ padding: '13px', borderRadius: '10px', fontWeight: 700, fontSize: '13px', color: 'white', border: 'none', cursor: 'pointer', background: saving ? 'rgba(251,191,36,0.4)' : 'linear-gradient(135deg, #FBBF24, #F59E0B)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</> : <><PackageCheck size={14} /> Check In Parcel</>}
                </button>
              </div>
            </div>
          )}

          {/* ── CHECK OUT ── */}
          {activeTab === 'checkout' && (
            <div style={{ maxWidth: '600px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'white', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PackageMinus size={18} style={{ color: '#6C9EFF' }} /> Check Out Parcel
              </h2>
              <div style={{ background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Find waybill */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '6px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Waybill Number / Reference</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input value={checkOutQuery} onChange={e => setCheckOutQuery(e.target.value)} onKeyPress={e => e.key === 'Enter' && findWaybill()} placeholder="Scan or type waybill number..."
                      style={{ flex: 1, padding: '11px 14px', borderRadius: '10px', fontSize: '13px', color: 'white', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none' }} />
                    <button onClick={findWaybill} style={{ padding: '11px 16px', borderRadius: '10px', background: 'rgba(108,158,255,0.15)', color: '#6C9EFF', border: '1px solid rgba(108,158,255,0.25)', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}>
                      <Search size={14} />
                    </button>
                  </div>
                </div>

                {/* Found waybill */}
                {foundWaybill && (
                  <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'white' }}>{foundWaybill.waybillNumber}</div>
                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>For: {foundWaybill.receiverName || foundWaybill.recipient}</div>
                      </div>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: 'rgba(74,222,128,0.12)', color: '#4ADE80' }}>FOUND</span>
                    </div>
                  </div>
                )}

                {foundWaybill && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <WField label="Collector Name *" value={collectorName} onChange={setCollectorName} placeholder="Full name" />
                      <WField label="Collector Phone" value={collectorPhone} onChange={setCollectorPhone} placeholder="+27 XX XXX" />
                      <WField label="ID Number" value={collectorId} onChange={setCollectorId} placeholder="ID / Passport" />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '6px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Collector Signature</label>
                      <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background: 'white', marginBottom: '6px' }}>
                        <SignatureCanvas ref={sigPad} penColor="black" canvasProps={{ height: 130, style: { width: '100%', height: 130 } }} />
                      </div>
                      <button onClick={() => sigPad.current?.clear()} style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer' }}>Clear Signature</button>
                    </div>
                    <button onClick={handleCheckOut} disabled={saving} style={{ padding: '13px', borderRadius: '10px', fontWeight: 700, fontSize: '13px', color: 'white', border: 'none', cursor: 'pointer', background: saving ? 'rgba(108,158,255,0.4)' : 'linear-gradient(135deg, #6C9EFF, #A78BFA)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Processing...</> : <><CheckCircle size={14} /> Confirm Check Out</>}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── SEARCH ── */}
          {activeTab === 'search' && (
            <div style={{ maxWidth: '700px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'white', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Search size={18} style={{ color: '#A78BFA' }} /> Search Parcels
              </h2>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSearch()} placeholder="Search by waybill number, name, reference..."
                  style={{ flex: 1, padding: '13px 16px', borderRadius: '12px', fontSize: '14px', color: 'white', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none' }} />
                <button onClick={handleSearch} disabled={searching} style={{ padding: '13px 20px', borderRadius: '12px', background: 'linear-gradient(135deg, #A78BFA, #6C9EFF)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}>
                  {searching ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : 'Search'}
                </button>
              </div>
              {searchResults.length > 0 ? (
                <div style={{ borderRadius: '12px', overflow: 'hidden', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {searchResults.map((p: any, i: number) => (
                    <div key={p.id || i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: i < searchResults.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(167,139,250,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Package size={16} style={{ color: '#A78BFA' }} />
                        </div>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: 'white' }}>{p.waybillNumber || `WB-${p.id}`}</div>
                          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{p.receiverName || p.recipient} · {p.storageLocation || 'No location'}</div>
                        </div>
                      </div>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: 'rgba(251,191,36,0.12)', color: '#FBBF24', textTransform: 'uppercase' }}>
                        {p.status?.replace('_', ' ') || 'IN WAREHOUSE'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : searchQuery && !searching ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>No parcels found for "{searchQuery}"</div>
              ) : null}
            </div>
          )}
        </main>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function WField({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '6px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', color: 'white', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none', boxSizing: 'border-box' }} />
    </div>
  );
}
