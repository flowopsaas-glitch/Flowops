import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Truck, Wifi, WifiOff, RefreshCw, CloudUpload, CheckCircle2 } from "lucide-react";
import { getPodQueue, syncPodQueue, registerPodAutoSync } from "../../lib/offlinePod";
import LanguageSwitcher from "../../components/LanguageSwitcher";
import "../../i18n"; // ensure i18n is initialised

export default function DriverPortalPage() {
  const { t } = useTranslation("driver");
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [pending, setPending] = useState(getPodQueue().length);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const refresh = () => setPending(getPodQueue().length);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const unregister = registerPodAutoSync(() => refresh());
    const timer = setInterval(refresh, 4000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      unregister();
      clearInterval(timer);
    };
  }, []);

  const syncNow = async () => {
    setSyncing(true);
    try {
      await syncPodQueue();
      setPending(getPodQueue().length);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020817] text-white p-6 flex flex-col">
      {/* Language switcher in top-right */}
      <div className="flex justify-end">
        <LanguageSwitcher />
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-sky-500/15 border border-sky-500/30 p-3 text-sky-400">
            <Truck size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-black italic uppercase tracking-tighter leading-none">
              {t("portal_title")}
            </h1>
            <p className="text-slate-500 text-[10px] font-black uppercase mt-1">
              {t("portal_subtitle")}
            </p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase ${
            online ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
          }`}
        >
          {online ? <Wifi size={12} /> : <WifiOff size={12} />}
          {online ? t("status_online") : t("status_offline")}
        </span>
      </div>

      {/* Offline sync status */}
      <div className="mt-10 rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/50">
          <CloudUpload size={14} /> {t("offline_deliveries")}
        </div>
        {pending > 0 ? (
          <>
            <div className="mt-3 text-4xl font-black">{pending}</div>
            <p className="text-sm text-white/50 mt-1">
              {online ? t("pending_count_online") : t("pending_count_offline")}
            </p>
            <button
              onClick={syncNow}
              disabled={!online || syncing}
              className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-500 text-white py-4 font-black text-sm uppercase tracking-widest disabled:opacity-40"
            >
              {syncing ? <RefreshCw size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              {t("sync_now")}
            </button>
          </>
        ) : (
          <div className="mt-3 flex items-center gap-2 text-emerald-400">
            <CheckCircle2 size={18} />
            <span className="font-bold text-sm">{t("deliveries_synced")}</span>
          </div>
        )}
      </div>

      <div className="mt-8 rounded-[24px] border border-white/10 bg-black/20 p-5 text-xs text-white/40 leading-relaxed">
        {t("pod_tip")}
      </div>

      <div className="mt-auto pt-10 text-center text-[10px] text-white/20 font-black uppercase tracking-widest">
        {t("installable")}
      </div>
    </div>
  );
}
