import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { ChevronLeft, Package, CheckCircle, Square, PenTool, X, MapPin } from 'lucide-react';
import { useToast } from "../../components/ToastProvider"; 
import SignatureCanvas from 'react-signature-canvas';
import { queuePod, syncPodQueue, getPodQueue, registerPodAutoSync } from '../../lib/offlinePod';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import '../../i18n';

export default function DriverManifest() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation('driver');
  const [job, setJob] = useState<any>(null);
  const [confirmed, setConfirmed] = useState<number[]>([]);
  const [showSig, setShowSig] = useState(false);
  const sigPad = useRef<any>(null);
  const { showToast } = useToast();

  // Flush any deliveries captured offline as soon as we're back online.
  useEffect(() => {
    return registerPodAutoSync((n) => showToast(`${n} offline delivery${n > 1 ? "ies" : "y"} synced.`, "success"));
  }, [showToast]);

  // 🔄 Sync with FlowOps Backend Engine
  useEffect(() => {
    if (id) {
      api.get(`/waybills/${id}`)
        .then((res: any) => setJob(res?.data ?? res))
        .catch(() => {
          showToast(t('waybill_not_found'), "error");
          navigate('/driver/portal');
        });
    }
  }, [id, navigate, showToast]);

  // ── Hooks must all be declared before the early return ─────────────────
  /**
   * Fire-and-forget geofence check.  Sends the device GPS position to the
   * backend so IN_TRANSIT waybills within 500 m auto-advance to
   * OUT_FOR_DELIVERY before the driver captures the POD signature.
   * Silently no-ops if GPS is unavailable, permissions are denied, or
   * the waybill has no driver assigned yet.
   */
  const triggerGeofence = useCallback(async () => {
    try {
      const shipments = (job as any)?.shipments as any[] | undefined;
      const driverId  = shipments?.[0]?.driverId ?? shipments?.[0]?.driver?.id;
      if (!driverId) return;

      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) { reject(new Error('no-geo')); return; }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 30_000,
        });
      });

      await api.post('/cod/geofence', {
        driverId,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      });
    } catch {
      // GPS unavailable, permission denied, or API error — silently ignore
    }
  }, [job]);

  /** Opens the POD signature overlay and fires the geofence check in the
   *  background so the waybill status can advance before the driver signs. */
  const handleOpenSignature = useCallback(() => {
    void triggerGeofence();   // non-blocking
    setShowSig(true);
  }, [triggerGeofence]);

  // This state persists until the API returns data
  if (!job) {
    return (
      <div className="min-h-screen bg-[#020817] flex items-center justify-center text-sky-500 font-black italic tracking-widest uppercase animate-pulse">
        {t('syncing')}
      </div>
    );
  }

  const isComplete = confirmed.length === (job.quantity || 1);

  const submitPOD = async () => {
    if (sigPad.current?.isEmpty()) {
      showToast(t('signature_required'), "error");
      return;
    }

    const canvas = sigPad.current.getTrimmedCanvas();
    const signatureDataUrl: string = canvas.toDataURL("image/png");

    // Offline-first: if there's no connectivity, queue the POD locally and let
    // it sync automatically when the driver is back online — never lose a POD.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      queuePod({ waybillId: String(id), waybillNumber: job.trackingNumber ?? job.waybillNumber ?? String(id), signatureDataUrl });
      showToast(t('saved_offline'), "success");
      navigate("/driver/portal");
      return;
    }

    canvas.toBlob(async (blob: Blob | null) => {
      if (!blob) return;

      const formData = new FormData();
      // Field name MUST be 'photo' — matches FileInterceptor('photo') in the controller
      formData.append('photo', new File([blob], `POD_${job.trackingNumber ?? id}.png`, { type: 'image/png' }));

      try {
        await api.post(`/waybills/${id}/deliver`, formData);
        showToast(t('delivery_confirmed'), "success");
        navigate('/driver/portal');
      } catch (err) {
        // Network/other failure → queue offline instead of losing the POD.
        queuePod({ waybillId: String(id), waybillNumber: job.waybillNumber, signatureDataUrl });
        showToast(t('saved_offline_sync'), "success");
        navigate('/driver/portal');
      }
    }, 'image/png');
  };

  return (
    <div className="min-h-screen bg-[#020817] text-white p-6 pb-32 text-left font-sans">
      <button onClick={() => navigate('/driver/portal')} 
        className="mb-8 text-sky-500 font-black text-[10px] uppercase flex items-center gap-2"
      >
        <ChevronLeft size={16}/> {t('return_to_portal')}
      </button>

      <div className="flex items-start justify-between mb-1">
        <h1 className="text-3xl font-black italic tracking-tighter leading-none">
          {job.trackingNumber ?? job.waybillNumber ?? id}
        </h1>
        <LanguageSwitcher />
      </div>
      <p className="text-slate-500 text-[10px] font-black uppercase mt-2">
        {t('audit_list')}: {job.quantity || 1} {t('units_for_delivery')}
      </p>

      {/* COD indicator — show how much cash to collect */}
      {job.codAmount && !job.codCollected && (
        <div className="rounded-[22px] border border-amber-500/30 bg-amber-500/10 px-5 py-4 flex items-center gap-3">
          <span className="text-2xl">💵</span>
          <div>
            <div className="text-xs font-black uppercase tracking-widest text-amber-300">Cash on Delivery</div>
            <div className="text-xl font-black text-white mt-0.5">
              R {Number(job.codAmount).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-amber-200/50">Collect from recipient before handover</div>
          </div>
        </div>
      )}

      {/* Google Maps navigation */}
      {(job.recipientLat || job.recipientAddress) && (
        <a
          href={
            job.recipientLat
              ? `https://www.google.com/maps/dir/?api=1&destination=${job.recipientLat},${job.recipientLng}`
              : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.recipientAddress ?? "")}`
          }
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-3 w-full py-4 rounded-[22px] border border-sky-500/25 bg-sky-500/10 text-sky-300 text-sm font-black uppercase tracking-widest"
        >
          🗺️ Navigate to Recipient
        </a>
      )}

      {/* Recipient info */}
      {(job.recipientName || job.recipientAddress) && (
        <div className="rounded-[20px] border border-white/8 bg-white/3 px-5 py-4 text-sm">
          <div className="font-black text-white/80">{job.recipientName}</div>
          {job.recipientAddress && <div className="text-white/40 text-xs mt-1">{job.recipientAddress}</div>}
          {job.recipientPhone && (
            <a
              href={`https://wa.me/${job.recipientPhone.replace(/\D/g,'').replace(/^0/,'27')}`}
              target="_blank" rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-green-400 text-xs font-bold"
            >
              💬 WhatsApp recipient
            </a>
          )}
        </div>
      )}

      {/* Parcel Audit List */}
      <section className="space-y-3 my-10">
        {Array.from({ length: job.quantity || 1 }).map((_, i) => (
          <button 
            key={i} 
            onClick={() => setConfirmed(prev => 
              prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
            )}
            className={`w-full p-7 rounded-[32px] border flex items-center justify-between transition-all ${
              confirmed.includes(i) 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                : 'bg-white/5 border-white/5 text-slate-500'
            }`}
          >
            <div className="flex items-center gap-4">
              <Package size={22}/>
            <span className="font-black text-sm uppercase">{t('item_id')}: {i + 1}</span>
            </div>
            {confirmed.includes(i) ? (
              <CheckCircle size={24} className="fill-emerald-500 text-slate-950"/>
            ) : (
              <Square size={24}/>
            )}
          </button>
        ))}
      </section>

      {/* Bottom Action Button */}
      <button 
        onClick={handleOpenSignature} 
        disabled={!isComplete} 
        className={`w-full py-6 rounded-[32px] font-black text-sm uppercase flex justify-center items-center gap-3 shadow-2xl transition-all ${
          isComplete 
            ? 'bg-sky-500 text-white active:scale-95 shadow-sky-500/20' 
            : 'bg-slate-800 text-slate-600 opacity-50 cursor-not-allowed'
        }`}
      >
        {isComplete ? <PenTool size={20}/> : <Package size={20}/>} 
        {isComplete ? t('sign_for_handover') : t('complete_audit_first')}
      </button>

      {/* Signature Proof of Delivery Overlay */}
      {showSig && (
        <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-2xl z-50 p-8 flex flex-col">
          <div className="flex justify-between items-center mt-8 mb-8">
             <h2 className="text-3xl font-black italic text-white tracking-tighter uppercase">
               {t('proof_of_delivery')}
             </h2>
             <button 
               onClick={() => setShowSig(false)} 
               className="p-3 bg-white/5 rounded-full text-white"
             >
               <X size={20}/>
             </button>
          </div>
          
          <div className="flex-1 bg-white rounded-[40px] overflow-hidden shadow-inner">
            <SignatureCanvas 
              ref={sigPad} 
              penColor="black" 
              canvasProps={{ className: 'w-full h-full' }} 
            />
          </div>

          <button 
            onClick={submitPOD} 
            className="w-full mt-10 bg-emerald-500 py-6 rounded-3xl font-black text-xs uppercase tracking-widest text-white shadow-xl shadow-emerald-500/20 transition-all active:scale-95"
          >
            {t('confirm_complete')}
          </button>
        </div>
      )}
    </div>
  );
}
