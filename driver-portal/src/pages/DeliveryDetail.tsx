import { useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import { ArrowLeft, MapPin, Phone, Package, PenLine, Eraser, CheckCircle2, User } from 'lucide-react';
import api from '../services/api';
import { queueMutation } from '../services/offlineDB';
import PhotoCapture from '../components/PhotoCapture';

/**
 * True when a failed request was a connectivity problem (not a server rejection).
 * The api interceptor turns errors into plain Error objects, so we also treat a
 * missing HTTP status as "network" — that's the offline / timeout case where we
 * want to queue the action rather than lose it.
 */
function isNetworkError(err: any): boolean {
  if (!navigator.onLine) return true;
  const status = err?.response?.status ?? err?.status;
  return status == null; // no HTTP response came back
}

type Job = Record<string, any> & { id: string };

export default function DeliveryDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const job = (location.state as Job) || { id };

  const sigRef = useRef<SignatureCanvas>(null);
  const [recipientName, setRecipientName] = useState(job.recipientName ?? job.receiverName ?? '');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [parcelCount, setParcelCount] = useState(1);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState('');

  const isDelivery = !!job.waybillId && job.type !== 'collection';
  const isLinehaul = job.type === 'linehaul';
  const phone: string | undefined = job.recipientPhone ?? job.receiverPhone;
  const address: string | undefined = job.recipientAddress ?? job.destination;

  const submitPod = async () => {
    setError('');
    if (!recipientName.trim()) { setError('Enter who received the parcel.'); return; }
    setSaving(true);
    const signatureUrl = sigRef.current && !sigRef.current.isEmpty()
      ? sigRef.current.toDataURL('image/png')
      : undefined;
    const payload = {
      waybillId: job.waybillId,
      recipientName: recipientName.trim(),
      notes: notes.trim() || undefined,
      signatureUrl,
      imageUrl: photo || undefined, // proof photo → stored as waybill.podImageUrl
    };
    try {
      await api.post('/driver-portal/pod', payload);
      setDone(true);
      setTimeout(() => navigate('/dashboard', { replace: true }), 1200);
    } catch (err: any) {
      // In a dead zone? Queue it locally and confirm to the driver — the sync
      // engine replays it (idempotently) the moment signal returns.
      if (isNetworkError(err)) {
        await queueMutation('pod', '/driver-portal/pod', payload);
        setQueued(true);
        setDone(true);
        setTimeout(() => navigate('/dashboard', { replace: true }), 1400);
      } else {
        setError(err?.message || 'Could not save proof of delivery');
      }
    } finally {
      setSaving(false);
    }
  };

  const submitCollection = async () => {
    setError('');
    setSaving(true);
    const url = `/driver-portal/collect/${job.id}`;
    const payload = { parcelCount, notes: notes.trim() || undefined };
    try {
      await api.post(url, payload);
      setDone(true);
      setTimeout(() => navigate('/dashboard', { replace: true }), 1200);
    } catch (err: any) {
      if (isNetworkError(err)) {
        await queueMutation('collect', url, payload);
        setQueued(true);
        setDone(true);
        setTimeout(() => navigate('/dashboard', { replace: true }), 1400);
      } else {
        setError(err?.message || 'Could not confirm collection');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white safe-area-top safe-area-bottom">
      <div className="sticky top-0 z-10 backdrop-blur-xl bg-white/5 border-b border-white/10 p-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl border border-white/10 hover:bg-white/10">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <div className="font-bold truncate">{job.trackingNumber ?? job.waybillNumber ?? job.id}</div>
          <div className="text-xs text-gray-400">{job.type === 'collection' ? 'Collection' : 'Delivery'} · {job.status}</div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Recipient / destination */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2"><User className="w-4 h-4 text-blue-300" /><span className="font-semibold">{job.recipientName ?? job.receiverName ?? '—'}</span></div>
          {address && <div className="flex items-start gap-2 text-sm text-gray-300"><MapPin className="w-4 h-4 mt-0.5 text-gray-400" /><span>{address}</span></div>}
          {phone && (
            <a href={`tel:${phone}`} className="flex items-center gap-2 text-sm text-blue-300"><Phone className="w-4 h-4" />{phone}</a>
          )}
          {Number(job.codAmount) > 0 && (
            <div className="mt-1 inline-block text-sm font-bold text-red-300 bg-red-500/15 border border-red-500/30 rounded-lg px-3 py-1">
              Collect COD: R{Number(job.codAmount).toFixed(2)}
            </div>
          )}
          {address && (
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer"
              className="mt-2 inline-flex items-center gap-2 rounded-xl bg-blue-600/20 border border-blue-500/30 px-4 py-2 text-sm font-semibold text-blue-200"
            >
              <Navigation /> Navigate
            </a>
          )}
        </div>

        {done ? (
          <div className={`rounded-2xl p-6 text-center border ${queued ? 'bg-amber-500/15 border-amber-500/30' : 'bg-green-500/15 border-green-500/30'}`}>
            <CheckCircle2 className={`w-12 h-12 mx-auto mb-2 ${queued ? 'text-amber-400' : 'text-green-400'}`} />
            <p className={`font-bold ${queued ? 'text-amber-200' : 'text-green-200'}`}>
              {queued
                ? (job.type === 'collection' ? 'Collection saved — will sync' : 'Delivery saved — will sync')
                : (job.type === 'collection' ? 'Collection confirmed' : 'Proof of delivery saved')}
            </p>
            {queued && (
              <p className="text-xs text-amber-300/80 mt-1">No signal right now. It's stored on your phone and uploads automatically when you're back online.</p>
            )}
          </div>
        ) : isDelivery ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-4">
            <div className="flex items-center gap-2 font-semibold"><Package className="w-4 h-4 text-emerald-300" /> Proof of Delivery</div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Received by</label>
              <input
                value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Recipient name"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Notes (optional)</label>
              <input
                value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. left with reception"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-gray-400 flex items-center gap-1"><PenLine className="w-3.5 h-3.5" /> Signature</label>
                <button onClick={() => sigRef.current?.clear()} className="text-xs text-gray-400 flex items-center gap-1 hover:text-white"><Eraser className="w-3.5 h-3.5" /> Clear</button>
              </div>
              <SignatureCanvas ref={sigRef} canvasProps={{ className: 'sig-canvas' }} penColor="#0f172a" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Photo (optional — proof of delivery / safe place)</label>
              <PhotoCapture label="Take delivery photo" onCapture={setPhoto} />
            </div>
            {error && <div className="bg-red-500/20 border border-red-500/30 text-red-200 p-3 rounded-xl text-sm">{error}</div>}
            <button
              onClick={submitPod} disabled={saving}
              className="w-full bg-gradient-to-r from-green-600 to-emerald-600 py-4 rounded-xl font-bold text-lg disabled:opacity-50 transition shadow-lg flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5" /> {saving ? 'Saving…' : 'Mark Delivered'}
            </button>
          </div>
        ) : isLinehaul ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-4">
            <div className="flex items-center gap-2 font-semibold text-purple-200"><Package className="w-4 h-4 text-purple-300" /> Linehaul Delivery</div>
            <div className="text-sm text-gray-300 space-y-1">
              <p>Deliver this manifest to: <strong className="text-white">{job.destinationBranch ?? job.recipientName}</strong></p>
              {job.parcelCount && <p>Parcels in manifest: <strong className="text-white">{job.parcelCount}</strong></p>}
              <p className="text-xs text-gray-400 mt-2">Once you arrive at the destination branch, confirm delivery below. All waybills will be marked as received.</p>
            </div>
            {error && <div className="bg-red-500/20 border border-red-500/30 text-red-200 p-3 rounded-xl text-sm">{error}</div>}
            <button
              onClick={async () => {
                setError(''); setSaving(true);
                try {
                  await api.post(`/driver-portal/manifest/${job.manifestId ?? job.id}/deliver`);
                  setDone(true);
                  setTimeout(() => navigate('/dashboard', { replace: true }), 1200);
                } catch (err: any) { setError(err?.message || 'Could not confirm linehaul delivery'); }
                finally { setSaving(false); }
              }}
              disabled={saving}
              className="w-full bg-gradient-to-r from-purple-600 to-violet-600 py-4 rounded-xl font-bold text-lg disabled:opacity-50 transition shadow-lg flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5" /> {saving ? 'Confirming…' : 'Confirm Linehaul Delivered'}
            </button>
          </div>
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-4">
            <div className="flex items-center gap-2 font-semibold text-amber-200"><Package className="w-4 h-4 text-amber-300" /> Confirm Collection</div>
            <div className="text-sm text-gray-300 space-y-1">
              <p>Pick up the parcel from <strong className="text-white">{job.recipientName ?? job.receiverName ?? 'the client'}</strong> at the address above.</p>
              <p className="text-xs text-gray-400">Once you have it, confirm the pickup below. A waybill is created automatically and assigned for delivery.</p>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1"># of parcels</label>
              <input
                type="number" min={1} value={parcelCount}
                onChange={(e) => setParcelCount(Math.max(1, Number(e.target.value) || 1))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Notes (optional)</label>
              <input
                value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. 2 boxes, sealed"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            {error && <div className="bg-red-500/20 border border-red-500/30 text-red-200 p-3 rounded-xl text-sm">{error}</div>}
            <button
              onClick={submitCollection} disabled={saving}
              className="w-full bg-gradient-to-r from-amber-600 to-orange-600 py-4 rounded-xl font-bold text-lg disabled:opacity-50 transition shadow-lg flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5" /> {saving ? 'Confirming…' : 'Confirm Pickup'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Small inline icon to avoid an extra import line above.
function Navigation() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11" /></svg>
  );
}
