import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Brain, BarChart3, Target, Shield, Loader2, Send, Lightbulb, Globe } from 'lucide-react';
import { getMarketTrends, askMarketInsight, type MarketTrendData, type MarketInsight } from '../api/marketTrendsApi';
import { useToast } from '../components/ToastProvider';

export default function MarketTrends() {
  const { showToast } = useToast();
  const [data, setData] = useState<MarketTrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState('');
  const [insight, setInsight] = useState<MarketInsight | null>(null);
  const [askingInsight, setAskingInsight] = useState(false);
  const [tab, setTab] = useState<'overview' | 'segments' | 'competitors' | 'opportunities' | 'predictions' | 'ask'>('overview');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setData(await getMarketTrends());
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const handleAsk = async () => {
    if (!question.trim()) return;
    setAskingInsight(true);
    try {
      setInsight(await askMarketInsight(question));
    } catch (e: any) { showToast(e.message, 'error'); }
    finally { setAskingInsight(false); }
  };

  const threatColor = (t: string) => t === 'HIGH' ? 'text-red-400 bg-red-500/10' : t === 'MEDIUM' ? 'text-amber-400 bg-amber-500/10' : 'text-emerald-400 bg-emerald-500/10';
  const impactColor = (i: string) => i === 'HIGH' ? 'text-violet-400 bg-violet-500/10' : i === 'MEDIUM' ? 'text-blue-400 bg-blue-500/10' : 'text-white/50 bg-white/5';

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-10 h-10 text-cyan-400 animate-spin" /></div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30">
            <TrendingUp className="w-6 h-6 text-cyan-400" />
          </div>
          Market Trends Intelligence
        </h1>
        <p className="text-sm text-white/50 mt-1">AI-powered South African logistics market analysis {data.model !== 'static-data' && `| Powered by ${data.model}`}</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 to-transparent p-5">
          <p className="text-xs text-cyan-400/70 uppercase tracking-wider">Market Size</p>
          <p className="text-2xl font-black text-white mt-1">{data.overview.marketSize}</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent p-5">
          <p className="text-xs text-emerald-400/70 uppercase tracking-wider">Growth Rate</p>
          <p className="text-2xl font-black text-white mt-1">{data.overview.growthRate}</p>
        </div>
        <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-transparent p-5">
          <p className="text-xs text-violet-400/70 uppercase tracking-wider">Projected</p>
          <p className="text-2xl font-black text-white mt-1">{data.overview.projectedGrowth}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10 overflow-x-auto">
        {[
          { id: 'overview', label: 'Overview', icon: Globe },
          { id: 'segments', label: 'Segments', icon: BarChart3 },
          { id: 'competitors', label: 'Competitors', icon: Shield },
          { id: 'opportunities', label: 'Opportunities', icon: Target },
          { id: 'predictions', label: 'Predictions', icon: Lightbulb },
          { id: 'ask', label: 'Ask AI', icon: Brain },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${tab === t.id ? 'bg-cyan-500/20 text-cyan-400' : 'text-white/50 hover:text-white/70'}`}>
            <t.icon className="w-3.5 h-3.5" />{t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'overview' && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h3 className="text-white font-bold mb-3">Key Market Drivers</h3>
          <div className="space-y-2">
            {data.overview.keyDrivers.map((d, i) => (
              <div key={i} className="flex items-center gap-3 text-sm text-white/70">
                <div className="w-2 h-2 rounded-full bg-cyan-400" />
                {d}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'segments' && (
        <div className="space-y-3">
          {data.segments.map((seg, i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-white font-bold">{seg.name}</h3>
                <span className="text-cyan-400 font-bold text-sm">{seg.share}% share</span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/10 mb-3"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500" style={{ width: `${seg.share}%` }} /></div>
              <div className="flex justify-between text-xs"><span className="text-emerald-400">Growth: {seg.growth}</span><span className="text-white/50">{seg.outlook}</span></div>
            </div>
          ))}
        </div>
      )}

      {tab === 'competitors' && (
        <div className="space-y-3">
          {data.competitors.map((c, i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold">{c.name}</h3>
                <p className="text-xs text-white/50 mt-1">{c.strength}</p>
                <p className="text-xs text-white/40 mt-1">Recent: {c.recentMove}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${threatColor(c.threat)}`}>{c.threat}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'opportunities' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.opportunities.map((o, i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-white font-bold text-sm">{o.title}</h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${impactColor(o.impact)}`}>{o.impact}</span>
              </div>
              <p className="text-xs text-white/60">{o.description}</p>
              <p className="text-[10px] text-white/30 mt-2">Timeframe: {o.timeframe}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'predictions' && (
        <div className="space-y-3">
          {data.predictions.map((p, i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-white font-bold">{p.title}</h3>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-2 rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500" style={{ width: `${p.confidence}%` }} /></div>
                  <span className="text-xs text-white/50">{p.confidence}%</span>
                </div>
              </div>
              <p className="text-xs text-white/60">{p.description}</p>
              <p className="text-[10px] text-white/30 mt-2">Horizon: {p.timeHorizon}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'ask' && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
          <h3 className="text-white font-bold flex items-center gap-2"><Brain className="w-5 h-5 text-violet-400" /> Ask AI Market Intelligence</h3>
          <div className="flex gap-3">
            <input className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 outline-none" placeholder="Ask about the South African logistics market..." value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAsk()} />
            <button onClick={handleAsk} disabled={askingInsight} className="px-4 py-3 rounded-xl bg-violet-600 text-white font-bold hover:bg-violet-500 disabled:opacity-50 flex items-center gap-2">
              {askingInsight ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          {insight && (
            <div className="space-y-3 pt-4 border-t border-white/10">
              <p className="text-white/80 text-sm">{insight.answer}</p>
              {insight.confidence > 0 && <p className="text-xs text-white/40">Confidence: {insight.confidence}%</p>}
              {insight.keyPoints?.length ? (
                <div><p className="text-xs text-white/50 font-bold mb-1">Key Points:</p>{insight.keyPoints.map((kp, i) => <p key={i} className="text-xs text-white/60 ml-3">- {kp}</p>)}</div>
              ) : null}
              {insight.recommendations?.length ? (
                <div><p className="text-xs text-white/50 font-bold mb-1">Recommendations:</p>{insight.recommendations.map((r, i) => <p key={i} className="text-xs text-cyan-400/80 ml-3">- {r}</p>)}</div>
              ) : null}
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-white/20 text-right">Generated: {new Date(data.generatedAt).toLocaleString()}</p>
    </div>
  );
}
