export default function PageLoader() {
  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-2 border-slate-700" />
          <div className="absolute inset-0 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        </div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-widest animate-pulse">Loading</p>
      </div>
    </div>
  );
}
