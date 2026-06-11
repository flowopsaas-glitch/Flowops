export default function UserRolesPage() {
  return (
    <div className="p-8 bg-[#031217] min-h-screen text-white font-mono border border-emerald-500/10 rounded-2xl m-2">
      <div className="flex items-center gap-3 border-b border-white/10 pb-4 mb-6">
        <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
        <h1 className="text-xl font-black uppercase tracking-widest text-emerald-400">Access Control // Policy Matrix Manager</h1>
      </div>
      <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
        Multi-tenant user authentication role token permissions rules mapped. Select profiles to adjust configurations.
      </p>
    </div>
  );
}
