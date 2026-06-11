import { useState, useEffect } from 'react';
import { Layers, Plus, Search, Eye, RefreshCw, X, Camera, Package } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import PageSkeleton from '@/components/ui/PageSkeleton';
import EmptyState from '@/components/ui/EmptyState';
import BarcodeQrScanner from '@/components/BarcodeQrScanner';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

export default function ManifestsPage() {
  const [manifests, setManifests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [selectedManifestId, setSelectedManifestId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({ destination: '', notes: '' });

  const token = localStorage.getItem('access_token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchManifests = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/manifests`, { headers });
      if (res.ok) setManifests(await res.json());
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { fetchManifests(); }, []);

  const handleCreate = async () => {
    if (!formData.destination.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`${API_URL}/manifests`, {
        method: 'POST', headers,
        body: JSON.stringify({ destination: formData.destination, notes: formData.notes, status: 'OPEN' }),
      });
      if (res.ok) { setShowCreateModal(false); setFormData({ destination: '', notes: '' }); fetchManifests(); }
    } catch (err) { console.error(err); }
    setCreating(false);
  };

  const handleScanResult = async (result: string) => {
    if (!selectedManifestId) return;
    try {
      await fetch(`${API_URL}/manifests/${selectedManifestId}/scan`, {
        method: 'POST', headers,
        body: JSON.stringify({ barcode: result }),
      });
      setShowScanner(false);
      fetchManifests();
    } catch (err) { console.error(err); }
  };

  const statusConfig: Record<string, { bg: string; color: string }> = {
    OPEN: { bg: 'rgba(108,158,255,0.12)', color: '#6C9EFF' },
    SEALED: { bg: 'rgba(74,222,128,0.12)', color: '#4ADE80' },
    IN_TRANSIT: { bg: 'rgba(167,139,250,0.12)', color: '#A78BFA' },
    DELIVERED: { bg: 'rgba(74,222,128,0.12)', color: '#4ADE80' },
    CLOSED: { bg: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' },
  };

  return (
    <div style={{ padding: '24px', minHeight: '100%' }}>
      <PageHeader icon={Layers} title="Manifests" description="Group shipments into manifests for route planning" color="#A78BFA">
        <button onClick={() => { setShowScanner(true); }} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: 'none', cursor: 'pointer' }}>
          <Camera size={13} /> Scan
        </button>
        <button onClick={() => setShowCreateModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, background: 'linear-gradient(135deg, #A78BFA, #6C9EFF)', color: 'white', border: 'none', cursor: 'pointer' }}>
          <Plus size={13} /> New Manifest
        </button>
      </PageHeader>

      {loading ? (
        <PageSkeleton type="cards" rows={4} />
      ) : manifests.length === 0 ? (
        <EmptyState icon={Layers} title="No manifests" description="Create manifests to group waybills by route or destination for efficient dispatch." actionLabel="Create First Manifest" onAction={() => setShowCreateModal(true)} color="#A78BFA" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {manifests.map(m => {
            const sc = statusConfig[m.status] || statusConfig.OPEN;
            return (
              <div key={m.id} style={{ borderRadius: '12px', padding: '18px', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', transition: 'all 0.15s' }} className="hover:bg-white/[0.03]">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'white' }}>{m.manifestNumber || `MF-${m.id}`}</span>
                  <span style={{ fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px', background: sc.bg, color: sc.color }}>{m.status}</span>
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>
                  {m.destination || 'No destination'} • {m.waybillCount || 0} waybills
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{m.createdAt ? new Date(m.createdAt).toLocaleDateString() : ''}</span>
                  <button onClick={() => { setSelectedManifestId(m.id); setShowScanner(true); }}
                    style={{ fontSize: '11px', color: '#6C9EFF', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Camera size={11} /> Add Items
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
          <div style={{ borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '420px', background: '#0f1629', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'white' }}>New Manifest</h3>
              <button onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color="rgba(255,255,255,0.4)" /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '6px', color: 'rgba(255,255,255,0.5)' }}>Destination *</label>
                <input value={formData.destination} onChange={e => setFormData({ ...formData, destination: e.target.value })} placeholder="e.g. Cape Town Hub"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', color: 'white', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '6px', color: 'rgba(255,255,255,0.5)' }}>Notes</label>
                <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Optional notes..."
                  rows={3} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', color: 'white', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none', resize: 'none' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button onClick={() => setShowCreateModal(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: 'none', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleCreate} disabled={creating} style={{ flex: 1, padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, background: 'linear-gradient(135deg, #A78BFA, #6C9EFF)', color: 'white', border: 'none', cursor: 'pointer' }}>
                {creating ? 'Creating...' : 'Create Manifest'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Scanner */}
      {showScanner && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(0,0,0,0.8)' }}>
          <div style={{ borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '500px', background: '#0f1629', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'white' }}>Scan Waybill Barcode</h3>
              <button onClick={() => setShowScanner(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color="rgba(255,255,255,0.4)" /></button>
            </div>
            <BarcodeQrScanner onScan={handleScanResult} />
          </div>
        </div>
      )}
    </div>
  );
}
