import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, CheckCircle, Package, PenTool, Square, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import SignatureCanvas from "react-signature-canvas";
import { api } from "../../api/client";
import { useToast } from "../../components/ToastProvider";
import { getPodQueue, queuePod, registerPodAutoSync, syncPodQueue } from "../../lib/offlinePod";
import LanguageSwitcher from "../../components/driver/LanguageSwitcher";

export default function DriverManifest() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation("driver");
  const { showToast } = useToast();

  const [job, setJob] = useState<any>(null);
  const [confirmed, setConfirmed] = useState<number[]>([]);
  const [showSig, setShowSig] = useState(false);
  const sigPad = useRef<any>(null);

  // Auto-sync any queued offline PODs when connectivity returns.
  useEffect(() => {
    return registerPodAutoSync((n) => {
      showToast(
        n === 1
          ? t("manifest.offlineSyncToast_one", { count: n })
          : t("manifest.offlineSyncToast_other", { count: n }),
        "success"
      );
    });
  }, [showToast, t]);

  // Load the waybill / job details.
  useEffect(() => {
    if (!id) return;
    api
      .get(`/waybills/${id}`)
      .then((res) => setJob((res as any).data ?? res))
      .catch(() => {
        showToast(t("manifest.waybillNotFound"), "error");
        navigate("/driver/portal");
      });
  }, [id, navigate, showToast, t]);

  // Loading spinner while we wait for the API.
  if (!job) {
    return (
      <div className="min-h-screen bg-[#020817] flex items-center justify-center text-sky-500 font-black italic tracking-widest uppercase animate-pulse">
        {t("manifest.syncing")}
      </div>
    );
  }

  const totalItems = job.quantity || 1;
  const isComplete = confirmed.length === totalItems;

  const submitPOD = async () => {
    if (sigPad.current?.isEmpty()) {
      showToast(t("manifest.signatureRequired"), "error");
      return;
    }

    const canvas = sigPad.current.getTrimmedCanvas();
    const signatureDataUrl: string = canvas.toDataURL("image/png");

    // Offline-first: if offline, queue and navigate away immediately.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      queuePod({
        waybillId: String(id),
        waybillNumber: job.waybillNumber,
        signatureDataUrl,
      });
      showToast(t("manifest.savedOffline"), "success");
      navigate("/driver/portal");
      return;
    }

    canvas.toBlob(async (blob: Blob | null) => {
      if (!blob) return;

      const formData = new FormData();
      formData.append(
        "signature",
        new File([blob], `POD_${job.waybillNumber}.png`, { type: "image/png" })
      );

      try {
        await api.post(`/waybills/${id}/complete`, formData);
        showToast(t("manifest.deliveryConfirmed"), "success");
        navigate("/driver/portal");
      } catch {
        // Network failure → queue offline; never lose a POD.
        queuePod({
          waybillId: String(id),
          waybillNumber: job.waybillNumber,
          signatureDataUrl,
        });
        showToast(t("manifest.savedOfflineFallback"), "success");
        navigate("/driver/portal");
      }
    }, "image/png");
  };

  const toggleItem = (i: number) => {
    setConfirmed((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
    );
  };

  return (
    <div className="min-h-screen bg-[#020817] text-white p-6 pb-32 text-left font-sans">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={() => navigate("/driver/portal")}
          className="text-sky-500 font-black text-[10px] uppercase flex items-center gap-2"
        >
          <ChevronLeft size={16} />
          {t("manifest.returnToPortal")}
        </button>
        <LanguageSwitcher />
      </div>

      {/* Waybill heading */}
      <h1 className="text-3xl font-black italic tracking-tighter leading-none">
        {job.waybillNumber}
      </h1>
      <p className="text-slate-500 text-[10px] font-black uppercase mt-2">
        {t("manifest.auditList", { count: totalItems })}
      </p>

      {/* Parcel audit list */}
      <section className="space-y-3 my-10">
        {Array.from({ length: totalItems }).map((_, i) => (
          <button
            key={i}
            onClick={() => toggleItem(i)}
            className={`w-full p-7 rounded-[32px] border flex items-center justify-between transition-all ${
              confirmed.includes(i)
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : "bg-white/5 border-white/5 text-slate-500"
            }`}
          >
            <div className="flex items-center gap-4">
              <Package size={22} />
              <span className="font-black text-sm uppercase">
                {t("manifest.itemId", { id: i + 1 })}
              </span>
            </div>
            {confirmed.includes(i) ? (
              <CheckCircle size={24} className="fill-emerald-500 text-slate-950" />
            ) : (
              <Square size={24} />
            )}
          </button>
        ))}
      </section>

      {/* CTA — sign for handover */}
      <button
        onClick={() => setShowSig(true)}
        disabled={!isComplete}
        className={`w-full py-6 rounded-[32px] font-black text-sm uppercase flex justify-center items-center gap-3 shadow-2xl transition-all ${
          isComplete
            ? "bg-sky-500 text-white active:scale-95 shadow-sky-500/20"
            : "bg-slate-800 text-slate-600 opacity-50 cursor-not-allowed"
        }`}
      >
        {isComplete ? <PenTool size={20} /> : <Package size={20} />}
        {isComplete
          ? t("manifest.signForHandover")
          : t("manifest.completeAuditFirst")}
      </button>

      {/* Signature / Proof of Delivery overlay */}
      {showSig && (
        <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-2xl z-50 p-8 flex flex-col">
          <div className="flex justify-between items-center mt-8 mb-8">
            <h2 className="text-3xl font-black italic text-white tracking-tighter uppercase">
              {t("manifest.proofOfDelivery")}
            </h2>
            <button
              onClick={() => setShowSig(false)}
              className="p-3 bg-white/5 rounded-full text-white"
            >
              <X size={20} />
            </button>
          </div>

          {/* Signature canvas */}
          <div className="flex-1 bg-white rounded-[40px] overflow-hidden shadow-inner">
            <SignatureCanvas
              ref={sigPad}
              penColor="black"
              canvasProps={{ className: "w-full h-full" }}
            />
          </div>

          <button
            onClick={submitPOD}
            className="w-full mt-10 bg-emerald-500 py-6 rounded-3xl font-black text-xs uppercase tracking-widest text-white shadow-xl shadow-emerald-500/20 transition-all active:scale-95"
          >
            {t("manifest.confirmAndComplete")}
          </button>
        </div>
      )}
    </div>
  );
}
