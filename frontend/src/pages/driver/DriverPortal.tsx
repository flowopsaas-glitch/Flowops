import { useEffect, useState, useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { api } from '../../api/client';
import { Package, Map, PenTool, RefreshCcw, MessageSquare, LogOut, Loader2, Truck, X, Camera, Check, Inbox } from 'lucide-react';
import { useDriverAuth } from '../../contexts/DriverAuthContext';
import { useNavigate } from 'react-router-dom';

type Tab = 'deliveries' | 'collections';

export default function DriverPortal() {
  const { driver, logout, isAuthenticated, isLoading: authLoading } = useDriverAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('deliveries');
  const [jobs, setJobs] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);

  // POC modal
  const [pocCollection, setPocCollection] = useState<any>(null);
  const [collectorName, setCollectorName] = useState('');
  const [pocNotes, setPocNotes] = useState('');
  const [pocPhoto, setPocPhoto] = useState<string | null>(null);
  const [savingPoc, setSavingPoc] = useState(false);
  const sigPad = useRef<any>(null);

  const fetchManifest = async () => {
    if (!isAuthenticated || !driver?.id) return;
    try {
      setSyncing(true);
      const [delRes, colRes]: any[] = await Promise.all([
        api.get(`/driver-portal/deliveries/${driver.id}`).catch(() => []),
        api.get(`/driver-portal/collections/${driver.id}`).catch(() => []),
      ]);
      const rawDel = Array.isArray(delRes) ? delRes : (Array.isArray(delRes?.data) ? delRes.data : []);
      setJobs(rawDel.map((w: any) => ({
        id: w.id,
        waybillNumber: w.waybillNumber || `WB-${w.id}`,
        recipient: w.receiverName || w.recipient || 'Unknown',
        recipientPhone: w.receiverPhone || w.recipientPhone || null,
        deliveryAddress: w.deliveryAddress || w.receiverAddress || '',
        status: w.status,
      })));
      const rawCol = Array.isArray(colRes) ? colRes : (Array.isArray(colRes?.data) ? colRes.data : []);
      setCollections(rawCol);
    } catch (err: any) {
      if (err.response?.status === 401) navigate('/driver/login');
    } finally { setSyncing(false); }
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate('/driver/login');
    if (isAuthenticated) fetchManifest();
  }, [isAuthenticated, authLoading]);

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setPocPhoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  const submitPoc = async () => {
    if (!pocCollection || !driver?.id) return;
    setSavingPoc(true);
    try {
      const signatureData = sigPad.current && !sigPad.current.isEmpty()
        ? sigPad.current.toDataURL('image/png') : undefined;
      await api.post('/driver-portal/poc', {
        driverId: driver.id, collectionId: pocCollection.id,
        signatureData, photoData: pocPhoto || undefined,
        collectorName: collectorName || undefined, notes: pocNotes || undefined,
      });
      setPocCollection(null); setCollectorName(''); setPocNotes(''); setPocPhoto(null);
      fetchManifest();
    } catch (err) { console.error('POC submit failed:', err); }
    setSavingPoc(false);
  };

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#020817', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
        <Loader2 style={{ color: '#38bdf8', width: 40, height: 40, animation: 'spin 1s linear infinite' }} />
        <p style={{ color: '#38bdf8', fontWeight: 900, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '4px' }}>Authenticating...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#020817', color: 'white', padding: '24px', fontFamily: 'sans-serif', position: 'relative' }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', paddingTop: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, fontStyle: 'italic', letterSpacing: '-1px', textTransform: 'uppercase', lineHeight: 1, margin: 0 }}>Route</h1>
          <p style={{ color: '#38bdf8', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '3px', marginTop: '4px' }}>
            {driver?.name || 'Unit Active'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={fetchManifest} style={{ padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '16px', border: 'none', cursor: 'pointer', color: '#38bdf8' }}>
            <RefreshCcw size={20} style={syncing ? { animation: 'spin 1s linear infinite' } : {}} />
          </button>
          <button onClick={logout} style={{ padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '16px', border: 'none', cursor: 'pointer', color: '#64748b' }}>
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ display: 'flex', background: 'rgba(15,23,42,0.7)', padding: '4px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '24px' }}>
        <button onClick={() => setTab('deliveries')} style={{
          flex: 1, padding: '12px', borderRadius: '16px', fontWeight: 900, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', border: 'none', cursor: 'pointer', transition: 'all 0.2s',
          background: tab === 'deliveries' ? '#0ea5e9' : 'transparent',
          color: tab === 'deliveries' ? 'white' : '#475569',
          boxShadow: tab === 'deliveries' ? '0 4px 20px rgba(14,165,233,0.3)' : 'none',
        }}>
          Deliveries ({jobs.length})
        </button>
        <button onClick={() => setTab('collections')} style={{
          flex: 1, padding: '12px', borderRadius: '16px', fontWeight: 900, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', border: 'none', cursor: 'pointer', transition: 'all 0.2s',
          background: tab === 'collections' ? '#10b981' : 'transparent',
          color: tab === 'collections' ? 'white' : '#475569',
          boxShadow: tab === 'collections' ? '0 4px 20px rgba(16,185,129,0.3)' : 'none',
        }}>
          Collections ({collections.length})
        </button>
      </div>

      {/* DELIVERIES */}
      {tab === 'deliveries' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '80px' }}>
          {jobs.length === 0 && !syncing ? (
            <EmptyCard label="Manifest Clear" icon={Inbox} />
          ) : (
            jobs.map(job => (
              <div key={job.id} style={{
                background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: '36px', padding: '24px', boxShadow: '0 18px 60px rgba(0,0,0,0.28)',
              }}>
                {/* Job header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '48px', height: '48px', background: 'rgba(14,165,233,0.1)', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Package size={20} style={{ color: '#38bdf8' }} />
                    </div>
                    <div>
                      <h4 style={{ fontWeight: 900, color: 'white', margin: 0, fontSize: '15px' }}>{job.waybillNumber}</h4>
                      <p style={{ fontSize: '10px', fontWeight: 900, color: '#475569', textTransform: 'uppercase', margin: '2px 0 0', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.recipient}</p>
                    </div>
                  </div>
                  {job.recipientPhone && (
                    <button onClick={() => window.open(`https://wa.me/${job.recipientPhone.replace(/\D/g, '')}`, '_blank')}
                      style={{ padding: '12px', background: 'rgba(16,185,129,0.1)', borderRadius: '14px', border: '1px solid rgba(16,185,129,0.1)', cursor: 'pointer' }}>
                      <MessageSquare size={18} style={{ color: '#10b981' }} />
                    </button>
                  )}
                </div>
                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.deliveryAddress || '')}`, '_blank')}
                    style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '20px', padding: '16px', color: '#94a3b8', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer' }}>
                    <Map size={14} /> Map
                  </button>
                  <button onClick={() => navigate(`/driver/manifest/${job.id}`)}
                    style={{ flex: 1, background: '#0284c7', border: 'none', borderRadius: '20px', padding: '16px', color: 'white', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer', boxShadow: '0 4px 20px rgba(2,132,199,0.4)' }}>
                    <PenTool size={14} /> POD
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* COLLECTIONS */}
      {tab === 'collections' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '80px' }}>
          {collections.length === 0 && !syncing ? (
            <EmptyCard label="No Collections" icon={Truck} />
          ) : (
            collections.map(col => {
              const collected = col.status === 'COLLECTED';
              return (
                <div key={col.id} style={{
                  background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: '36px', padding: '24px', boxShadow: '0 18px 60px rgba(0,0,0,0.28)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ width: '48px', height: '48px', background: 'rgba(16,185,129,0.1)', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Truck size={20} style={{ color: '#10b981' }} />
                      </div>
                      <div>
                        <h4 style={{ fontWeight: 900, color: 'white', margin: 0, fontSize: '15px' }}>{col.referenceNo || col.name}</h4>
                        <p style={{ fontSize: '10px', fontWeight: 900, color: '#475569', textTransform: 'uppercase', margin: '2px 0 0' }}>{col.clientName || 'Client'}</p>
                      </div>
                    </div>
                    {collected && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(16,185,129,0.15)', color: '#10b981', borderRadius: '999px', padding: '4px 12px', fontSize: '9px', fontWeight: 900, textTransform: 'uppercase' }}>
                        <Check size={11} /> Collected
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(col.collectionAddress || '')}`, '_blank')}
                      style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '20px', padding: '16px', color: '#94a3b8', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer' }}>
                      <Map size={14} /> Map
                    </button>
                    <button onClick={() => !collected && (setPocCollection(col), setCollectorName(''), setPocNotes(''), setPocPhoto(null))}
                      disabled={collected}
                      style={{ flex: 1, background: collected ? 'rgba(255,255,255,0.05)' : '#059669', border: 'none', borderRadius: '20px', padding: '16px', color: collected ? '#475569' : 'white', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: collected ? 'not-allowed' : 'pointer', boxShadow: collected ? 'none' : '0 4px 20px rgba(5,150,105,0.4)' }}>
                      <PenTool size={14} /> {collected ? 'Done' : 'Capture POC'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* POC Modal */}
      {pocCollection && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '16px', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
          <div style={{ background: '#0f1629', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '32px', padding: '24px', width: '100%', maxWidth: '460px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 900, color: 'white', margin: 0 }}>Proof of Collection</h3>
                <p style={{ fontSize: '10px', color: '#10b981', fontWeight: 900, textTransform: 'uppercase', margin: '2px 0 0' }}>{pocCollection.referenceNo || pocCollection.name}</p>
              </div>
              <button onClick={() => setPocCollection(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}><X size={20} /></button>
            </div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b', marginBottom: '6px' }}>Collected From</label>
            <input value={collectorName} onChange={e => setCollectorName(e.target.value)} placeholder="Person handing over"
              style={{ width: '100%', padding: '12px 16px', borderRadius: '16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '14px', outline: 'none', marginBottom: '16px', boxSizing: 'border-box' }} />
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b', marginBottom: '6px' }}>Signature</label>
            <div style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background: 'white', marginBottom: '8px' }}>
              <SignatureCanvas ref={sigPad} penColor="black" canvasProps={{ height: 150, style: { width: '100%', height: 150 } }} />
            </div>
            <button onClick={() => sigPad.current?.clear()} style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '16px' }}>Clear</button>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b', marginBottom: '6px' }}>Photo (Optional)</label>
            {pocPhoto ? (
              <div style={{ position: 'relative', marginBottom: '16px' }}>
                <img src={pocPhoto} alt="POC" style={{ width: '100%', height: '160px', objectFit: 'cover', borderRadius: '16px' }} />
                <button onClick={() => setPocPhoto(null)} style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', padding: '8px', cursor: 'pointer', color: 'white' }}><X size={14} /></button>
              </div>
            ) : (
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.1)', color: '#64748b', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', cursor: 'pointer', marginBottom: '16px', boxSizing: 'border-box' }}>
                <Camera size={16} /> Take Photo
                <input type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} style={{ display: 'none' }} />
              </label>
            )}
            <textarea value={pocNotes} onChange={e => setPocNotes(e.target.value)} placeholder="Notes (optional)" rows={2}
              style={{ width: '100%', padding: '12px 16px', borderRadius: '16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '14px', outline: 'none', resize: 'none', marginBottom: '20px', boxSizing: 'border-box' }} />
            <button onClick={submitPoc} disabled={savingPoc} style={{
              width: '100%', padding: '16px', borderRadius: '20px', background: '#059669', border: 'none', color: 'white', fontWeight: 900, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', boxShadow: '0 4px 20px rgba(5,150,105,0.4)',
            }}>
              {savingPoc ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</> : <><Check size={16} /> Confirm Collection</>}
            </button>
          </div>
        </div>
      )}

      {/* Inline keyframes */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function EmptyCard({ label, icon: Icon }: { label: string; icon: any }) {
  return (
    <div style={{ padding: '80px 24px', textAlign: 'center', opacity: 0.2, border: '2px dashed rgba(255,255,255,0.1)', borderRadius: '40px' }}>
      <Icon size={48} style={{ margin: '0 auto 16px', color: 'white', display: 'block' }} />
      <p style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px' }}>{label}</p>
    </div>
  );
}
