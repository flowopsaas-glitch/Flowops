export default function ManifestsPage() {
  return (
    <div className="p-8 bg-[#040d21] min-h-screen text-white font-mono border border-sky-500/10 rounded-2xl m-2">
      <div className="flex items-center gap-3 border-b border-white/10 pb-4 mb-6">
        <div className="w-2.5 h-2.5 bg-sky-500 rounded-full animate-pulse" />
        <h1 className="text-xl font-black uppercase tracking-widest text-sky-400">Fleet Operations // Waybill Manifests</h1>
      </div>
      <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
        Primary transport manifest directory workspace online. Fetching global sector load sheets...
      </p>
    </div>
  );
}
