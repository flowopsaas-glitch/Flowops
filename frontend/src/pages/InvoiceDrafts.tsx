import React, { useEffect, useState } from 'react';
import { FileText, ArrowRight, Wallet, CheckCircle2, Bot, X, AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import { describeDraft } from '../lib/invoiceDraft';

function money(v: number) {
  return `R${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function unwrap(r: any): any { return r?.data ?? r; }

export default function InvoiceDrafts() {
  const [drafts, setDrafts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditDraft, setAuditDraft] = useState<any | null>(null);

  const fetchDrafts = async () => {
    try {
      const res = await api.get('/invoice-drafts');
      // api client already unwraps the TransformInterceptor envelope
      const data = Array.isArray(res) ? res : Array.isArray((res as any)?.data) ? (res as any).data : [];
      // The API returns raw rows (client, lines and amounts are inside draftData); derive what the list shows.
      setDrafts(data.map((d: any) => ({ ...d, ...describeDraft(d) })));
    } catch (err) {
      console.error("Failed to fetch drafts", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDrafts(); }, []);

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
            <HeroStat title="Draft Value" value={money(stats.totalValue)} subtitle="Before VAT · visible invoice draft pipeline" icon={Wallet} />
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
                      <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Draft Value (before VAT)</div>
                      <div className="text-2xl font-black text-emerald-400">{money(draft.total)}</div>
                    </div>
                    
                    <button 
                      onClick={() => setAuditDraft(draft)}
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

      {auditDraft && (
        <ZAuditModal
          draft={auditDraft}
          onClose={() => setAuditDraft(null)}
          onFinalized={() => { setAuditDraft(null); setLoading(true); void fetchDrafts(); }}
        />
      )}
    </div>
  );
}

/**
 * Z-AI Compliance Audit modal — runs GET /invoice-drafts/:id/assist to check the
 * draft, shows the issues/suggestions, then POST /invoice-drafts/:id/finalize to
 * turn it into a real invoice. Replaces the old dead navigation to a page that
 * never existed.
 */
function ZAuditModal({ draft, onClose, onFinalized }: { draft: any; onClose: () => void; onFinalized: () => void }) {
  const [assist, setAssist] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api.get(`/invoice-drafts/${draft.id}/assist`);
        if (alive) setAssist(unwrap(r));
      } catch (err: any) {
        if (alive) setError(err?.response?.data?.message || err?.message || 'Audit failed');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [draft.id]);

  const issues: string[] = assist?.issues ?? [];
  const clean = !loading && !error && issues.length === 0;
  const completeness = Math.round((assist?.completeness ?? 0) * 100);

  async function finalize() {
    setFinalizing(true); setError(null);
    try {
      await api.post(`/invoice-drafts/${draft.id}/finalize`);
      setDone(true);
      setTimeout(onFinalized, 1200);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Could not finalize draft');
    } finally {
      setFinalizing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-[28px] border border-white/10 bg-[#0b1628] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-sky-500/15 ring-1 ring-sky-500/25">
              <ShieldCheck className="h-5 w-5 text-sky-400" />
            </div>
            <div>
              <div className="text-sm font-black text-white">Z-AI Compliance Audit</div>
              <div className="text-[11px] text-white/45">{draft.clientName || 'FlowOps Client'} · {draft.periodKey} · {money(draft.total)}</div>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition"><X className="h-5 w-5" /></button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {done ? (
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto mb-2" />
              <p className="font-black text-emerald-200">Invoice created</p>
              <p className="text-xs text-emerald-300/70 mt-1">The draft was finalized into a real invoice.</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center gap-3 py-10 text-white/50">
              <Loader2 className="h-5 w-5 animate-spin" /> Running compliance checks…
            </div>
          ) : (
            <>
              {/* Completeness meter */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-white/45">Completeness</span>
                  <span className={`text-[11px] font-black ${clean ? 'text-emerald-300' : 'text-amber-300'}`}>{completeness}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-white/8 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${clean ? 'bg-emerald-400' : 'bg-amber-400'}`} style={{ width: `${completeness}%` }} />
                </div>
              </div>

              {/* Issues / ready */}
              {clean ? (
                <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-sm font-bold text-emerald-200">
                  <CheckCircle2 className="h-4 w-4" /> Draft is compliant and ready to finalize.
                </div>
              ) : (
                <div className="space-y-2">
                  {issues.map((iss, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-2.5 text-sm text-amber-200">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> <span>{iss}</span>
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-2.5 text-sm font-bold text-rose-300">{error}</div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!done && (
          <div className="flex items-center justify-end gap-3 border-t border-white/10 px-6 py-4">
            <button onClick={onClose} className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-white/60 hover:bg-white/10 hover:text-white transition">Cancel</button>
            <button
              onClick={finalize}
              disabled={loading || finalizing}
              title={!clean && !loading ? 'You can still finalize, but review the issues above first.' : undefined}
              className="flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-black text-slate-950 transition hover:bg-emerald-400 disabled:opacity-40"
            >
              {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {finalizing ? 'Finalizing…' : 'Finalize to Invoice'}
            </button>
          </div>
        )}
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
