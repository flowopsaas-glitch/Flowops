import React, { useEffect, useMemo, useState } from "react";
import { apiGet } from "../api/client";
import { Search, FileText, Filter, MoreHorizontal, ArrowUpRight } from "lucide-react";

interface Quote {
  id: string | number;
  title: string;
  clientName: string;
  total: number;
  verdict: string;
  createdAt?: string;
}

// 🦴 INTERNAL COMPONENT: Skeleton Loader for "Instant" feel
const SkeletonRow = () => (
  <tr className="animate-pulse border-b border-slate-800/50">
    <td className="p-4"><div className="h-4 w-32 bg-slate-800 rounded"></div></td>
    <td className="p-4"><div className="h-4 w-24 bg-slate-800 rounded"></div></td>
    <td className="p-4"><div className="h-4 w-20 bg-slate-800 rounded"></div></td>
    <td className="p-4"><div className="h-6 w-16 bg-slate-800 rounded-full"></div></td>
  </tr>
);

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const fetchQuotes = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiGet<any>("/quotes");
      const list = Array.isArray(data) ? data : (data?.items || data?.data || []);
      setQuotes(list.map((item: any) => ({
        id: item?.id ?? crypto.randomUUID(),
        title: String(item?.title ?? "Untitled").trim(),
        clientName: String(item?.clientName ?? "Unknown Client").trim(),
        total: Number(item?.total ?? 0),
        verdict: String(item?.verdict ?? "DRAFT").toUpperCase(),
      })));
    } catch (err: any) {
      setError("Connectivity issue: Unable to reach Quotes service.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchQuotes(); }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return quotes.filter(i => 
      i.title.toLowerCase().includes(q) || 
      i.clientName.toLowerCase().includes(q)
    );
  }, [quotes, query]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'REJECTED': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'EXPIRED': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] p-8 text-slate-200">
      {/* Header Section */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-500 font-bold text-xs uppercase tracking-widest mb-1">
            <FileText size={14} /> Revenue Management
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">Quotes & Estimates</h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input 
              className="w-72 rounded-xl border border-slate-800 bg-slate-900/50 py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              placeholder="Filter by client or reference..."
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <button className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-slate-100 transition-colors flex items-center gap-2">
            Create Quote <ArrowUpRight size={16} />
          </button>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur-xl overflow-hidden shadow-2xl">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-800/30">
              <th className="p-4 font-semibold text-slate-400">REFERENCE</th>
              <th className="p-4 font-semibold text-slate-400">CLIENT</th>
              <th className="p-4 font-semibold text-slate-400">TOTAL VALUE</th>
              <th className="p-4 font-semibold text-slate-400">STATUS</th>
              <th className="p-4 text-right font-semibold text-slate-400 italic">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {loading ? (
              <>
                <SkeletonRow /><SkeletonRow /><SkeletonRow />
              </>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-20 text-center text-slate-500">
                  <div className="flex flex-col items-center gap-2">
                    <Filter size={32} className="opacity-20" />
                    <p>No quotes found in current ledger.</p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map(q => (
                <tr key={q.id} className="hover:bg-slate-800/30 transition-colors group">
                  <td className="p-4 font-bold text-white uppercase tracking-tight">{q.title}</td>
                  <td className="p-4 text-slate-400">{q.clientName}</td>
                  <td className="p-4 font-mono font-bold text-blue-400">
                    R {q.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-black ${getStatusColor(q.verdict)}`}>
                      {q.verdict}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button className="p-2 text-slate-600 hover:text-white transition-colors">
                      <MoreHorizontal size={18} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-400">
          <div className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
          {error}
        </div>
      )}
    </div>
  );
}
