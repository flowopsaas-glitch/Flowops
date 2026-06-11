import { useEffect, useState, useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { api } from '../../api/client';
import { Package, Map, PenTool, RefreshCcw, MessageSquare, Boxes, LogOut, Loader2, Truck, X, Camera, Check } from 'lucide-react';
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
        ? sigPad.current.toDataURL('image/png')
        : undefined;
      await api.post('/driver-portal/poc', {
        driverId: driver.id,
        collectionId: pocCollection.id,
        signatureData,
        photoData: pocPhoto || undefined,
        collectorName: collectorName || undefined,
        notes: pocNotes || undefined,
      });
      // Reset + refresh
      setPocCollection(null);
      setCollectorName('');
      setPocNotes('');
      setPocPhoto(null);
      fetchManifest();
    } catch (err) {
      console.error('POC submit failed:', err);
    } finally {
      setSavingPoc(false);
    }
  };

  if (authLoading) return (
    <div className="min-h-screen bg-[#020817] flex flex-col items-center justify-center gap-4">
      <Loader2 className="animate-spin text-sky-500" size={40} />
      <p className="text-sky-500 font-black italic uppercase tracking-widest text-xs">Authenticating...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#020817] text-white p-6 font-sans text-left relative">
      <header className="flex justify-between items-center mb-8 pt-4">
        <div>
          <h1 className="text-2xl font-black italic tracking-tighter uppercase leading-none">Route</h1>
          <p className="text-sky-500 text-[10px] font-black uppercase mt-1">{driver?.name || 'Unit Active'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchManifest} className="p-3 bg-white/5 rounded-2xl text-sky-500">
            <RefreshCcw size={20} className={syncing ? 'animate-spin' : ''} />
          </button>
          <button onClick={logout} className="p-3 bg-white/5 rounded-2xl text-slate-500"><LogOut size={20} /></button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex bg-slate-900/50 p-1 rounded-2xl border border-white/5 mb-6">
        <button onClick={() => setTab('deliveries')}
          className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase transition-all ${tab === 'deliveries' ? 'bg-sky-500 text-white shadow-lg' : 'text-slate-600'}`}>
          Deliveries ({jobs.length})
        </button>
        <button onClick={() => setTab('collections')}
          className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase transition-all ${tab === 'collections' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-600'}`}>
          Collections ({collections.length})
        </button>
      </div>

      {/* DELIVERIES */}
      {tab === 'deliveries' && (
        <div className="space-y-4 pb-20">
          {jobs.length === 0 && !syncing ? (
            <EmptyManifest label="No Deliveries" />
          ) : (
            jobs.map(job => (
              <div key={job.id} className="bg-slate-900/40 border border-white/5 p-6 rounded-[36px] shadow-2xl space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 bg-sky-500/10 rounded-xl flex items-center justify-center text-sky-400"><Package size={20} /></div>
                    <div className="text-left flex-1 overflow-hidden">
                      <h4 className="font-black text-white leading-none mb-1">{job.waybillNumber}</h4>
                      <p className="text-[10px] font-black text-slate-500 uppercase truncate max-w-[150px]">{job.recipient}</p>
                    </div>
                  </div>
                  {job.recipientPhone && (
                    <button onClick={() => window.open(`https://wa.me/${job.recipientPhone.replace(/\D/g, '')}`, '_blank')} className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl border border-emerald-500/10">
                      <MessageSquare size={18} />
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.deliveryAddress || '')}`, '_blank')} className="flex-1 bg-white/5 py-4 rounded-2xl border border-white/5 text-[10px] font-black uppercase text-slate-400 flex items-center justify-center gap-2">
                    <Map size={14} /> Map
                  </button>
                  <button onClick={() => navigate(`/driver/manifest/${job.id}`)} className="flex-1 bg-sky-600 py-4 rounded-2xl text-[10px] font-black uppercase text-white shadow-lg flex items-center justify-center gap-2">
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
        <div className="space-y-4 pb-20">
          {collections.length === 0 && !syncing ? (
            <EmptyManifest label="No Collections" />
          ) : (
            collections.map(col => {
              const collected = col.status === 'COLLECTED';
              return (
                <div key={col.id} className="bg-slate-900/40 border border-white/5 p-6 rounded-[36px] shadow-2xl space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400"><Truck size={20} /></div>
                      <div className="text-left flex-1 overflow-hidden">
                        <h4 className="font-black text-white leading-none mb-1">{col.referenceNo || col.name}</h4>
                        <p className="text-[10px] font-black text-slate-500 uppercase truncate max-w-[150px]">{col.clientName || col.name}</p>
                      </div>
                    </div>
                    {collected && (
                      <span className="px-3 py-1 bg-emerald-500/15 text-emerald-400 rounded-full text-[9px] font-black uppercase flex items-center gap-1">
                        <Check size={11} /> Collected
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(col.collectionAddress || '')}`, '_blank')} className="flex-1 bg-white/5 py-4 rounded-2xl border border-white/5 text-[10px] font-black uppercase text-slate-400 flex items-center justify-center gap-2">
                      <Map size={14} /> Map
                    </button>
                    <button
                      onClick={() => { setPocCollection(col); setCollectorName(''); setPocNotes(''); setPocPhoto(null); }}
                      disabled={collected}
                      className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase shadow-lg flex items-center justify-center gap-2 ${collected ? 'bg-white/5 text-slate-600' : 'bg-emerald-600 text-white'}`}>
                      <PenTool size={14} /> {collected ? 'Done' : 'Capture POC'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* POC Capture Modal */}
      {pocCollection && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0f1629] border border-white/10 rounded-[32px] p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-black text-white">Proof of Collection</h3>
                <p className="text-[10px] text-emerald-400 font-black uppercase">{pocCollection.referenceNo || pocCollection.name}</p>
              </div>
              <button onClick={() => setPocCollection(null)} className="text-white/40"><X size={20} /></button>
            </div>

            {/* Collector name */}
            <label className="block text-[10px] font-black uppercase text-slate-500 mb-1.5">Collected From (name)</label>
            <input value={collectorName} onChange={e => setCollectorName(e.target.value)} placeholder="Person who handed over"
              className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-sm outline-none mb-4" />

            {/* Signature */}
            <label className="block text-[10px] font-black uppercase text-slate-500 mb-1.5">Signature</label>
            <div className="rounded-2xl overflow-hidden border border-white/10 bg-white mb-2">
              <SignatureCanvas ref={sigPad} penColor="black"
                canvasProps={{ className: 'w-full', height: 150, style: { width: '100%', height: 150 } }} />
            </div>
            <button onClick={() => sigPad.current?.clear()} className="text-[10px] font-black uppercase text-slate-500 mb-4">Clear Signature</button>

            {/* Photo */}
            <label className="block text-[10px] font-black uppercase text-slate-500 mb-1.5">Photo (optional)</label>
            {pocPhoto ? (
              <div className="relative mb-4">
                <img src={pocPhoto} alt="POC" className="w-full h-40 object-cover rounded-2xl" />
                <button onClick={() => setPocPhoto(null)} className="absolute top-2 right-2 bg-black/60 p-2 rounded-full text-white"><X size={14} /></button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl bg-white/5 border border-dashed border-white/10 text-slate-400 text-[10px] font-black uppercase mb-4 cursor-pointer">
                <Camera size={16} /> Take Photo
                <input type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="hidden" />
              </label>
            )}

            {/* Notes */}
            <textarea value={pocNotes} onChange={e => setPocNotes(e.target.value)} placeholder="Notes (optional)" rows={2}
              className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-sm outline-none mb-5 resize-none" />

            <button onClick={submitPoc} disabled={savingPoc}
              className="w-full py-4 rounded-2xl bg-emerald-600 text-white font-black text-xs uppercase shadow-lg flex items-center justify-center gap-2">
              {savingPoc ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : <><Check size={16} /> Confirm Collection</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyManifest({ label }: { label: string }) {
  return (
    <div className="p-20 text-center opacity-20 border-2 border-dashed border-white/10 rounded-[40px]">
      <Boxes size={48} className="mx-auto mb-4" />
      <p className="text-xs font-black uppercase">{label}</p>
    </div>
  );
}
