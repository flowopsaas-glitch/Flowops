import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ShieldCheck, AlertTriangle, Send, FileText, ArrowLeft } from 'lucide-react';

const DraftDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      axios.get(`/api/invoice-drafts/${id}`),
      axios.get(`/api/invoice-drafts/${id}/assist`)
    ]).then(([d, a]) => {
      setDraft(d.data);
      setAnalysis(a.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  const handleFinalize = async () => {
    if (!window.confirm("Finalize and email client?")) return;
    await axios.post(`/api/invoice-drafts/${id}/finalize`);
    navigate('/invoice-drafts');
  };

  if (loading || !draft) return <div className="p-12 text-center text-slate-500 animate-pulse font-black italic">AUDITING REVENUE DRAFT...</div>;

  return (
    <div className="p-8 text-slate-200 max-w-6xl mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-slate-500 hover:text-white mb-8 transition-colors">
        <ArrowLeft size={16} /> Back to Ledger
      </button>

      <div className="grid grid-cols-3 gap-8">
        <div className="col-span-2 bg-slate-900/50 border border-white/5 rounded-[32px] p-8 backdrop-blur-xl">
          <h2 className="text-xl font-black mb-6 flex items-center gap-3 italic">
            <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400"><FileText size={20} /></div>
            Line Verification
          </h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-white/5">
              {draft.lines?.map((l: any) => (
                <tr key={l.id}>
                  <td className="py-4 text-slate-400">{l.description}</td>
                  <td className="py-4 text-right font-black text-white">R {l.amount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-6">
          <div className={`p-6 rounded-[28px] border ${analysis?.completeness === 100 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
            <h3 className="font-black flex items-center gap-2 mb-4 text-sm uppercase tracking-tighter">
              {analysis?.completeness === 100 ? <ShieldCheck className="text-emerald-500" /> : <AlertTriangle className="text-amber-500" />} 
              AI Compliance
            </h3>
            <div className="text-xs text-slate-400 space-y-2">
              {analysis?.warnings?.map((w: string, i: number) => <p key={i}>• {w}</p>)}
              <p className="text-white italic mt-4">“{analysis?.suggestions[0]}”</p>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-[32px] p-8 space-y-6 backdrop-blur-2xl">
            <div className="flex justify-between text-2xl font-black text-white italic">
              <span>TOTAL</span>
              <span>R {draft.total.toLocaleString()}</span>
            </div>
            <button onClick={handleFinalize} className="w-full bg-white text-black font-black py-4 rounded-2xl shadow-xl hover:bg-slate-200 transition-all">
              FINALIZE & DISPATCH
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DraftDetail;
