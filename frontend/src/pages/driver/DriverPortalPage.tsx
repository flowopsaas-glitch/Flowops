import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Truck, Wifi, WifiOff, RefreshCw, CloudUpload, CheckCircle2, Package, MapPin } from "lucide-react";
import { getPodQueue, syncPodQueue, registerPodAutoSync } from "../../lib/offlinePod";
import LanguageSwitcher from "../../components/LanguageSwitcher";
import { api } from "../../api/client";
import "../../i18n"; // ensure i18n is initialised

export default function DriverPortalPage() {
  const { t } = useTranslation("driver");
  const navigate = useNavigate();
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [pending, setPending] = useState(getPodQueue().length);
  const [syncing, setSyncing] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);

  const fetchJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      // Fetch in-transit / active waybills — driver sees all jobs in progress
      const res: any = await api.get("/waybills?status=IN_TRANSIT,COLLECTED,OUT_FOR_DELIVERY");
      const d = res?.data ?? res;
      const list: any[] = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
      setJobs(list.slice(0, 10));
    } catch {
      // offline — show empty list
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    const refresh = () => setPending(getPodQueue().length);
    const on = () => { setOnline(true); void fetchJobs(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const unregister = registerPodAutoSync(() => refresh());
    const timer = setInterval(refresh, 4000);
    void fetchJobs();
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      unregister();
      clearInterval(timer);
    };
  }, [fetchJobs]);

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

      {/* Today's active deliveries */}
      <div className="mt-8">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/50 mb-3">
          <Package size={14} /> Active Jobs
          <button onClick={() => void fetchJobs()} className="ml-auto text-sky-400 hover:text-sky-300">
            <RefreshCw size={12} className={loadingJobs ? "animate-spin" : ""} />
          </button>
        </div>
        {loadingJobs ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-16 rounded-[18px] bg-white/5 animate-pulse" />)}
          </div>
        ) : jobs.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-white/10 py-8 text-center">
            <CheckCircle2 size={24} className="text-emerald-400/50 mx-auto mb-2" />
            <p className="text-white/25 text-xs font-bold uppercase tracking-widest">No active deliveries</p>
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map(job => (
              <button
                key={job.id}
                onClick={() => navigate(`/driver/manifests/${job.id}`)}
                className="w-full rounded-[22px] border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3 hover:bg-white/8 transition text-left"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-500/15 border border-sky-500/25">
                  <Truck size={16} className="text-sky-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-black text-white text-sm truncate">{job.trackingNumber}</div>
                  <div className="text-xs text-white/40 truncate">{job.recipientName ?? "Recipient"}</div>
                </div>
                <div className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wider ${
                  job.status === "OUT_FOR_DELIVERY" ? "bg-amber-500/15 text-amber-300" :
                  job.status === "IN_TRANSIT" ? "bg-cyan-500/15 text-cyan-300" :
                  "bg-emerald-500/15 text-emerald-300"
                }`}>
                  {job.status.replace("_", " ")}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-auto pt-10 text-center text-[10px] text-white/20 font-black uppercase tracking-widest">
        {t("installable")}
      </div>
    </div>
  );
}
