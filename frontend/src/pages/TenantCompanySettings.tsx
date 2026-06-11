import React from "react";
import TenantSettings from "./admin/TenantSettings";
import { Building2, Sparkles, ShieldCheck } from "lucide-react";

export default function TenantCompanySettings() {
  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_25%),linear-gradient(180deg,#05101d_0%,#030817_100%)] p-6 sm:p-10 text-white">
      <div className="mx-auto max-w-7xl">
        
        {/* Header Section */}
        <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-blue-400 ring-1 ring-blue-500/20">
              <Sparkles size={12} />
              Enterprise Workspace
            </div>
            <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">Company Profile</h1>
            <p className="mt-2 text-white/50 text-sm max-w-xl">
              Configure your organization's global identity, brand presence, and high-performance communication infrastructure.
            </p>
          </div>

          <div className="flex gap-3">
            <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3">
              <ShieldCheck size={16} className="text-emerald-400" />
              <span className="text-xs font-bold">BYOK Active</span>
            </div>
          </div>
        </header>

        {/* Main Configuration Surface */}
        <section className="relative overflow-hidden rounded-[40px] border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-3xl">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Building2 size={240} />
          </div>
          
          <div className="relative z-10">
            <TenantSettings />
          </div>
        </section>

      </div>
    </div>
  );
}
