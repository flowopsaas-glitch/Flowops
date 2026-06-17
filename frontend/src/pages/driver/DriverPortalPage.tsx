import React, { useEffect, useState } from "react";
import { Truck, Wifi, WifiOff, RefreshCw, CloudUpload, CheckCircle2 } from "lucide-react";
import { getPodQueue, syncPodQueue, registerPodAutoSync } from "../../lib/offlinePod";

export default function DriverPortalPage() {
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
    const t = setInterval(refresh, 4000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      unregister();
      clearInterval(t);
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
      <div className="flex items-center justify-between mt-6">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-sky-500/15 border border-sky-500/30 p-3 text-sky-400">
            <Truck size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-black italic uppercase tracking-tighter leading-none">Driver Portal</h1>
            <p className="text-slate-500 text-[10px] font-black uppercase mt-1">FlowOps field app</p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase ${
            online ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
          }`}
        >
          {online ? <Wifi size={12} /> : <WifiOff size={12} />}
          {online ? "Online" : "Offline"}
        </span>
      </div>

      {/* Offline sync status */}
      <div className="mt-10 rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/50">
          <CloudUpload size={14} /> Offline Deliveries
        </div>
        {pending > 0 ? (
          <>
            <div className="mt-3 text-4xl font-black">{pending}</div>
            <p className="text-sm text-white/50 mt-1">
              {online ? "captured offline, ready to sync" : "saved — will sync when you're back online"}
            </p>
            <button
              onClick={syncNow}
              disabled={!online || syncing}
              className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-500 text-white py-4 font-black text-sm uppercase tracking-widest disabled:opacity-40"
            >
              {syncing ? <RefreshCw size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Sync now
            </button>
          </>
        ) : (
          <div className="mt-3 flex items-center gap-2 text-emerald-400">
            <CheckCircle2 size={18} />
            <span className="font-bold text-sm">All deliveries synced</span>
          </div>
        )}
      </div>

      <div className="mt-8 rounded-[24px] border border-white/10 bg-black/20 p-5 text-xs text-white/40 leading-relaxed">
        Open a delivery from your dispatch link to capture proof of delivery. PODs captured
        without signal are stored on this device and upload automatically once you reconnect —
        you never lose a delivery.
      </div>

      <div className="mt-auto pt-10 text-center text-[10px] text-white/20 font-black uppercase tracking-widest">
        Installable · Works offline
      </div>
    </div>
  );
}
