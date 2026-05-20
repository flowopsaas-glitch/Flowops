import React, { useMemo, useState } from "react";
import { 
  CreditCard, Check, Zap, Shield, Crown, 
  ArrowRight, Clock, Receipt, AlertCircle, Info
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { Link } from "react-router-dom";

/**
 * Plan Feature Item Component
 */
const PlanFeature = ({ text, included = true }: { text: string; included?: boolean }) => (
  <div className={`flex items-center gap-3 text-[11px] font-bold uppercase tracking-tight ${included ? 'text-slate-200' : 'text-slate-500'}`}>
    <div className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${included ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-600'}`}>
      {included ? <Check size={10} strokeWidth={4} /> : <div className="w-1 h-1 bg-current rounded-full" />}
    </div>
    {text}
  </div>
);

export default function BillingPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  // Constants from your Prisma Schema
  const CURRENCY = user?.company?.currency || "ZAR";
  const BASE_PRICE = user?.company?.baseTierPrice || 8500;
  const USER_PRICE = user?.company?.perUserPrice || 500;

  // Calculate Trial Status
  const trialInfo = useMemo(() => {
    if (!user?.company?.trialEndsAt) return { active: false, days: 0 };
    const diff = new Date(user.company.trialEndsAt).getTime() - new Date().getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return { active: days > 0, days: Math.max(0, days) };
  }, [user?.company]);

  const handleUpgrade = async (planName: string) => {
    setLoading(true);
    // Future implementation: Stripe/Paystack redirect or API call
    setTimeout(() => setLoading(false), 1500);
  };

  return (
    <div className="min-h-screen bg-[#020817] p-8 text-white animate-in fade-in duration-500">
      
      {/* Header Section */}
      <div className="max-w-6xl mx-auto mb-12">
        <div className="flex items-center gap-2 mb-2 text-blue-400">
          <Shield size={14} />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] italic">Billing & Subscription</span>
        </div>
        <h1 className="text-5xl font-black tracking-tighter italic">Manage Plan</h1>
        <p className="text-slate-400 text-sm mt-2 max-w-xl">
          Scale your logistics operations. Control your billing, monitor your trial, and upgrade to unlock advanced AI intelligence.
        </p>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: Current Status & Plans */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Current Plan Card */}
          <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-slate-900 to-black p-8 shadow-2xl">
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-black uppercase italic">
                  Current Status: {user?.company?.status || 'Trialing'}
                </div>
                <h2 className="text-3xl font-black text-white italic tracking-tight uppercase">
                  {user?.company?.plan || 'Starter'} Plan
                </h2>
                <div className="flex items-center gap-4 text-slate-400">
                   <div className="flex items-center gap-1.5">
                     <Clock size={14} className="text-emerald-500" />
                     <span className="text-xs font-bold uppercase">{trialInfo.days} Days Remaining in Trial</span>
                   </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">Estimated Monthly</div>
                <div className="text-4xl font-black italic text-white tracking-tighter">
                  {CURRENCY} {BASE_PRICE.toLocaleString()}
                </div>
                <div className="text-[10px] font-bold text-slate-500 uppercase mt-1">
                  Excluding VAT @ {(user?.company?.defaultVatRate * 100) || 15}%
                </div>
              </div>
            </div>

            {/* Decorative Grid Pattern */}
            <div className="absolute inset-0 opacity-10 pointer-events-none" 
              style={{ backgroundImage: 'radial-gradient(#3b82f6 0.5px, transparent 0.5px)', backgroundSize: '12px 12px' }} 
            />
          </section>

          {/* Plan Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Professional Tier */}
            <div className="rounded-[32px] border-2 border-indigo-500/50 bg-indigo-600/5 p-8 flex flex-col shadow-[0_0_40px_rgba(79,70,229,0.1)]">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <div className="text-indigo-400 mb-1"><Zap size={24} fill="currentColor" /></div>
                  <h3 className="text-xl font-black italic uppercase tracking-tight">Professional</h3>
                </div>
                <div className="text-right">
                   <div className="text-2xl font-black tracking-tighter">{CURRENCY} 12,500</div>
                   <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Per Month</div>
                </div>
              </div>

              <div className="space-y-4 mb-10 flex-1">
                <PlanFeature text="AI-Guided Route Optimization" />
                <PlanFeature text="Advanced Exception Radar" />
                <PlanFeature text="Unlimited Waybills & Drivers" />
                <PlanFeature text="Custom Brand Theming" />
                <PlanFeature text="CIPC Verification Hub" />
              </div>

              <button 
                onClick={() => handleUpgrade('Professional')}
                disabled={loading}
                className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-[11px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
              >
                {loading ? 'Processing...' : 'Upgrade To Pro'}
              </button>
            </div>

            {/* Enterprise Tier */}
            <div className="rounded-[32px] border border-white/5 bg-white/[0.02] p-8 flex flex-col group hover:border-emerald-500/30 transition-all">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <div className="text-emerald-500 mb-1"><Crown size={24} /></div>
                  <h3 className="text-xl font-black italic uppercase tracking-tight">Enterprise</h3>
                </div>
                <div className="text-right">
                   <div className="text-2xl font-black tracking-tighter">Custom</div>
                   <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Quote Based</div>
                </div>
              </div>

              <div className="space-y-4 mb-10 flex-1">
                <PlanFeature text="Multi-Branch Cluster Support" />
                <PlanFeature text="Priority 24/7 Tactical Support" />
                <PlanFeature text="White-Label Driver Apps" />
                <PlanFeature text="Dedicated Account Manager" />
                <PlanFeature text="API Integration Access" />
              </div>

              <button className="w-full py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-black uppercase tracking-widest transition-all">
                Contact Sales
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Billing Details & Invoices */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Quick Stats Panel */}
          <div className="rounded-[32px] bg-slate-900/50 border border-white/5 p-6 space-y-6">
             <div className="flex items-center gap-3 text-slate-300">
               <div className="bg-emerald-500/10 p-2 rounded-lg text-emerald-500"><Receipt size={16} /></div>
               <h4 className="text-xs font-black uppercase tracking-widest">Next Billing Date</h4>
             </div>
             <div>
               <div className="text-2xl font-black tracking-tighter italic">
                 {new Date(user?.company?.trialEndsAt).toLocaleDateString('en-ZA', { month: 'long', day: 'numeric', year: 'numeric' })}
               </div>
               <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-tight">
                 Auto-Invoice Enabled: {user?.company?.autoInvoiceEnabled ? 'YES' : 'NO'}
               </p>
             </div>
          </div>

          {/* Payment Method */}
          <div className="rounded-[32px] bg-slate-900/50 border border-white/5 p-6">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 italic">Security & Encryption</h4>
            <div className="p-4 rounded-2xl bg-black/40 border border-white/5 flex items-center gap-4 mb-4">
              <div className="bg-white/10 p-2 rounded-lg"><CreditCard size={18} className="text-slate-400" /></div>
              <div>
                <div className="text-xs font-black uppercase text-white">No Method Saved</div>
                <div className="text-[9px] font-bold text-slate-500 uppercase">Payment is required after trial</div>
              </div>
            </div>
            <button className="w-full flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-400 hover:text-white transition-colors">
              Add Payment Method <ArrowRight size={12} />
            </button>
          </div>

          {/* Trial Warning */}
          {trialInfo.days <= 7 && (
            <div className="rounded-[32px] bg-rose-500/10 border border-rose-500/20 p-6 flex gap-4">
              <AlertCircle className="text-rose-500 shrink-0" size={20} />
              <p className="text-xs font-bold text-rose-200 leading-relaxed">
                Critical: Your trial expires in {trialInfo.days} days. Upgrade now to prevent a service lockout and data freeze.
              </p>
            </div>
          )}

          {/* Need Help */}
          <div className="rounded-[32px] border border-blue-500/20 bg-blue-500/5 p-6 text-center">
            <h4 className="text-xs font-black uppercase tracking-widest italic mb-2">Billing Support</h4>
            <p className="text-[10px] text-slate-400 font-bold mb-4">Questions about ZAR pricing or VAT?</p>
            <a href="mailto:support@flowops.com" className="text-[11px] font-black uppercase tracking-widest text-blue-400 hover:underline">
              Email Support
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
