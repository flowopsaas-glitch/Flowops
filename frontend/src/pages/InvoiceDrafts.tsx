import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, ArrowRight, Wallet, CheckCircle2, Bot } from 'lucide-react';
import { api } from '../api/client';

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function money(v: number) {
  return `R${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function InvoiceDrafts() {
  const [drafts, setDrafts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchDrafts = async () => {
      try {
        const res = await api.get('/invoice-drafts');
        // Ensure we handle the backend response shape correctly
        const data = Array.isArray(res.data) ? res.data : (res.data?.data || []);
        setDrafts(data);
      } catch (err) {
        console.error("Failed to fetch drafts", err);
      } finally {
        setLoading(false);
      }
    };
    fetchDrafts();
  }, []);

  const stats = {
    totalValue: drafts.reduce((sum, d) => sum + (Number(d.total) || 0), 0),
    draftCount: drafts.filter(d => d.status === 'DRAFT').length,
    sentCount: drafts.filter(d => d.status === 'SENT' || d.status === 'FINALIZED').length,
    linesCount: drafts.reduce((sum, d) => sum + (Number(d.lineCount) || 0), 0)
  };

  if (loading) return <div className="p-12 text-center text-slate-500 animate-pulse font-black italic">SYNCING COMMERCIAL DRAFTS...</div>;

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(55,90,180,0.18),transparent_30%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8">
      <div className="mx-auto max-w-[1650px] space-y-5">
        
        {/* Header & Stats */}
        <div className="rounded-[30px] border border-white/10 bg-white/5 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div className="text-[10px] font-black text-sky-400 tracking-widest uppercase italic mb-2">Commercial Pipeline</div>
          <h1 className="text-4xl font-black text-white tracking-tight">Invoice Drafts</h1>
          <p className="text-slate-400 mt-2 text-sm">Select a commercial draft to run the Z-AI Compliance Audit before final dispatch.</p>
          
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <HeroStat title="Draft Value" value={money(stats.totalValue)} subtitle="Visible invoice draft pipeline" icon={Wallet} />
            <HeroStat title="Drafts" value={String(stats.draftCount)} subtitle="Awaiting finalization" icon={FileText} />
            <HeroStat title="Sent" value={String(stats.sentCount)} subtitle="Finalized to invoices" icon={CheckCircle2} />
            <HeroStat title="Draft Lines" value={String(stats.linesCount)} subtitle="Commercial line items" icon={Bot} />
          </div>
        </div>

        {/* Draft List */}
        <div className="rounded-[24px] border border-white/10 bg-white/5 p-8 shadow-[0_18px_60px_rgba(0,0,0,0.30)] backdrop-blur-2xl">
          <div className="grid gap-4">
            {drafts.length === 0 ? (
              <div className="text-center p-16 border border-white/5 bg-slate-900/30 rounded-[32px] backdrop-blur-xl">
                <FileText size={48} className="text-slate-700 mx-auto mb-4" />
                <p className="text-white font-black">No pending drafts</p>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-2">Generate a draft from Billing Batches</p>
              </div>
            ) : (
              drafts.map(draft => (
                <div key={draft.id} className="bg-slate-900/50 border border-white/5 p-6 rounded-[28px] flex items-center justify-between hover:bg-white/10 transition-all backdrop-blur-xl group">
                  <div className="flex items-center gap-6">
                    <div className="h-14 w-14 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                      <FileText size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-white">{draft.clientName || 'FlowOps Client'}</h3>
                      <div className="flex gap-3 text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">
                        <span>{draft.periodKey}</span>
                        <span>•</span>
                        <span className="text-sky-400">{draft.status}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-8">
                    <div className="text-right">
                      <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Draft Value</div>
                      <div className="text-2xl font-black text-emerald-400">{money(draft.total)}</div>
                    </div>
                    
                    <button 
                      onClick={() => navigate(`/admin/billing/draft/${draft.id}`)}
                      className="bg-white text-black px-6 py-4 rounded-2xl font-black text-xs flex items-center gap-2 hover:bg-slate-200 hover:gap-3 transition-all shadow-xl shadow-white/5"
                    >
                      RUN Z-AUDIT <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        
      </div>
    </div>
  );
}

function HeroStat(props: { title: string; value: string; subtitle: string; icon: any }) {
  const Icon = props.icon;
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">{props.title}</div>
          <div className="mt-3 text-3xl font-black tracking-tight text-white">{props.value}</div>
          <div className="mt-1 text-xs text-white/70">{props.subtitle}</div>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </div>
  );
}
