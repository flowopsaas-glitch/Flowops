export default function HighRiskQueuePage() {
  return (
    <div className="p-8 bg-[#090514] min-h-screen text-white font-mono border border-rose-500/10 rounded-2xl m-2">
      <div className="flex items-center gap-3 border-b border-white/10 pb-4 mb-6">
        <div className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-ping" />
        <h1 className="text-xl font-black uppercase tracking-widest text-rose-400">Security Control // High Risk Anomaly Queue</h1>
      </div>
      <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
        Watchdog protocol monitoring active exceptions. Real-time sector asset verification loops nominal.
      </p>
    </div>
  );
}
