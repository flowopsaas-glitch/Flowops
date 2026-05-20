import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { FileText, Zap, ChevronRight, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

const InvoiceDrafts = () => {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/invoice-drafts')
      .then(res => setDrafts(res.data))
      .catch(err => console.error("Failed to load drafts", err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 text-slate-200">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold">Commercial Drafts</h1>
          <p className="text-slate-400 text-sm">Verify and finalize commercial invoices for client dispatch.</p>
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-slate-900 rounded-xl border border-slate-800" />
          ))}
        </div>
      ) : drafts.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 p-12 rounded-2xl text-center">
          <FileText className="mx-auto text-slate-700 mb-4" size={48} />
          <p className="text-slate-400 italic">No drafts pending. Run a Revenue Sweep to generate new ones.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {drafts.map((draft: any) => (
            <div 
              key={draft.id} 
              className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/50 transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="bg-slate-800 p-3 rounded-lg group-hover:bg-blue-500/10 transition-colors">
                  <FileText className="text-slate-400 group-hover:text-blue-400" size={20} />
                </div>
                <div>
                  <div className="font-semibold text-slate-100">{draft.clientName}</div>
                  <div className="text-xs text-slate-500 font-mono uppercase tracking-wider">
                    {draft.periodKey} • {draft.waybillCount} Waybills
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-8">
                <div className="text-right">
                  <div className="text-lg font-bold text-slate-100">R {draft.total.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Total Incl. VAT</div>
                </div>
                
                <Link 
                  to={`/admin/billing/draft/${draft.id}`}
                  className="bg-slate-800 hover:bg-slate-700 p-2 rounded-lg transition-colors"
                >
                  <ChevronRight size={20} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default InvoiceDrafts;
