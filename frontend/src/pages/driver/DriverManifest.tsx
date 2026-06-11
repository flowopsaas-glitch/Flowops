import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { ChevronLeft, Package, CheckCircle, Square, PenTool, X, Loader2 } from 'lucide-react';
import { useToast } from '../../components/ToastProvider';
import { useDriverAuth } from '../../contexts/DriverAuthContext';
import SignatureCanvas from 'react-signature-canvas';

export default function DriverManifest() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { driver } = useDriverAuth();
  const [job, setJob] = useState<any>(null);
  const [confirmed, setConfirmed] = useState<number[]>([]);
  const [showSig, setShowSig] = useState(false);
  const [recipientName, setRecipientName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const sigPad = useRef<any>(null);
  const { showToast } = useToast();

  // Load the waybill
  useEffect(() => {
    if (!id) return;
    api.get(`/waybills/${id}`)
      .then((res: any) => setJob(res?.data ?? res))
      .catch(() => {
        showToast('Waybill not found in system', 'error');
        navigate('/driver/portal');
      });
  }, [id, navigate, showToast]);

  // Auto-sync any queued offline PODs when back online
  useEffect(() => {
    const syncQueue = async () => {
      if (!navigator.onLine) return;
      const queue = JSON.parse(localStorage.getItem('pod_queue') || '[]');
      if (queue.length === 0) return;
      for (const item of queue) {
        try {
          await api.post('/driver-portal/pod', item);
        } catch (e) { console.error('Failed to sync queued POD', e); }
      }
      localStorage.removeItem('pod_queue');
    };
    window.addEventListener('online', syncQueue);
    syncQueue();
    return () => window.removeEventListener('online', syncQueue);
  }, []);

  if (!job) {
    return (
      <div className="min-h-screen bg-[#020817] flex items-center justify-center text-sky-500 font-black italic tracking-widest uppercase animate-pulse">
        Syncing...
      </div>
    );
  }

  const isComplete = confirmed.length === (job.quantity || 1);

  const submitPOD = async () => {
    if (sigPad.current?.isEmpty()) {
      showToast('Signature required for handover.', 'error');
      return;
    }

    const signatureData = sigPad.current.toDataURL('image/png');
    const payload = {
      driverId: driver?.id,
      waybillId: job.id,
      signatureData,
      recipientName: recipientName || undefined,
      source: 'PWA',
    };

    // Offline support: queue and sync later
    if (!navigator.onLine) {
      const queue = JSON.parse(localStorage.getItem('pod_queue') || '[]');
      queue.push(payload);
      localStorage.setItem('pod_queue', JSON.stringify(queue));
      showToast('Offline: POD saved locally, will sync when back online.', 'success');
      navigate('/driver/portal');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/driver-portal/pod', payload);
      showToast('Delivery confirmed successfully!', 'success');
      navigate('/driver/portal');
    } catch (err) {
      showToast('Handover sync error. Check connection.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020817] text-white p-6 pb-32 text-left font-sans">
      <button onClick={() => navigate('/driver/portal')} className="mb-8 text-sky-500 font-black text-[10px] uppercase flex items-center gap-2">
        <ChevronLeft size={16} /> Return to Portal
      </button>

      <h1 className="text-3xl font-black italic tracking-tighter leading-none">{job.waybillNumber || `WB-${job.id}`}</h1>
      <p className="text-slate-500 text-[10px] font-black uppercase mt-2">
        Audit List: {job.quantity || 1} Units for Delivery
      </p>

      {/* Parcel Audit List */}
      <section className="space-y-3 my-10">
        {Array.from({ length: job.quantity || 1 }).map((_, i) => (
          <button key={i} onClick={() => setConfirmed(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])}
            className={`w-full p-7 rounded-[32px] border flex items-center justify-between transition-all ${
              confirmed.includes(i) ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-white/5 border-white/5 text-slate-500'
            }`}>
            <div className="flex items-center gap-4">
              <Package size={22} />
              <span className="font-black text-sm uppercase">Item ID: {i + 1}</span>
            </div>
            {confirmed.includes(i) ? <CheckCircle size={24} className="fill-emerald-500 text-slate-950" /> : <Square size={24} />}
          </button>
        ))}
      </section>

      <button onClick={() => setShowSig(true)} disabled={!isComplete}
        className={`w-full py-6 rounded-[32px] font-black text-sm uppercase flex justify-center items-center gap-3 shadow-2xl transition-all ${
          isComplete ? 'bg-sky-500 text-white active:scale-95 shadow-sky-500/20' : 'bg-slate-800 text-slate-600 opacity-50 cursor-not-allowed'
        }`}>
        {isComplete ? <PenTool size={20} /> : <Package size={20} />}
        {isComplete ? 'Sign for Handover' : 'Complete Audit First'}
      </button>

      {/* POD Signature Overlay */}
      {showSig && (
        <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-2xl z-50 p-8 flex flex-col">
          <div className="flex justify-between items-center mt-8 mb-6">
            <h2 className="text-3xl font-black italic text-white tracking-tighter uppercase">Proof of Delivery</h2>
            <button onClick={() => setShowSig(false)} className="p-3 bg-white/5 rounded-full text-white"><X size={20} /></button>
          </div>

          <input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="Received by (name)"
            className="w-full px-5 py-4 rounded-2xl bg-white/5 border border-white/10 text-white text-sm outline-none mb-4" />

          <div className="flex-1 bg-white rounded-[40px] overflow-hidden shadow-inner">
            <SignatureCanvas ref={sigPad} penColor="black" canvasProps={{ className: 'w-full h-full' }} />
          </div>
          <button onClick={() => sigPad.current?.clear()} className="text-[10px] font-black uppercase text-slate-500 mt-2 self-start">Clear</button>

          <button onClick={submitPOD} disabled={submitting}
            className="w-full mt-6 bg-emerald-500 py-6 rounded-3xl font-black text-xs uppercase tracking-widest text-white shadow-xl shadow-emerald-500/20 transition-all active:scale-95 flex items-center justify-center gap-2">
            {submitting ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : 'Confirm & Complete'}
          </button>
        </div>
      )}
    </div>
  );
}
