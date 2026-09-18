import { useEffect, useState } from "react";
import {
  TrendingUp, TrendingDown, DollarSign, Users, MapPin, Target,
  BarChart3, Sparkles, Loader2, ArrowUpRight, ArrowDownRight,
  AlertTriangle, CheckCircle2, PieChart, Activity, Zap, Crown,
  ShieldAlert, RefreshCw,
} from "lucide-react";
import {
  getProfitability, getClientMatrix, getLaneProfitability,
  getQuoteFunnel, getRevenueForecast, getClientIntelligence,
  getCommercialAiInsights,
} from "../api/commercialAnalytics";

type Tab = 'overview' | 'clients' | 'lanes' | 'forecast' | 'intelligence' | 'ai';

export default function CommercialAnalytics() {
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTab = async (t: Tab) => {
    setLoading(true);
    setError(null);
    try {
      let result: any;
      switch (t) {
        case 'overview': result = await getProfitability(); break;
        case 'clients': result = await getClientMatrix(); break;
        case 'lanes': result = await getLaneProfitability(); break;
        case 'forecast': result = await getRevenueForecast(); break;
        case 'intelligence': result = await getClientIntelligence(); break;
        case 'ai': result = await getCommercialAiInsights(); break;
      }
      setData(result);
    } catch (e: any) {
      setError(e?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTab(tab); }, [tab]);

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: 'overview', label: 'Profitability', icon: DollarSign },
    { key: 'clients', label: 'Client Matrix', icon: Users },
    { key: 'lanes', label: 'Lane Analysis', icon: MapPin },
    { key: 'forecast', label: 'Revenue Forecast', icon: TrendingUp },
    { key: 'intelligence', label: 'Client Intelligence', icon: Crown },
    { key: 'ai', label: 'AI Insights', icon: Sparkles },
  ];


  return (
    <div className="min-h-screen bg-[#070d19] text-white p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-blue-400 font-bold">Commercial Intelligence</div>
          <h1 className="text-2xl font-black mt-1">Commercial Analytics</h1>
          <p className="text-sm text-white/50 mt-1">Pricing analysis, profitability metrics & strategic insights</p>
        </div>
        <button onClick={() => loadTab(tab)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition text-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition ${
              tab === t.key
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
            }`}>
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8 text-center">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-red-300">{error}</p>
          <button onClick={() => loadTab(tab)} className="mt-4 px-4 py-2 bg-red-600 rounded-lg text-sm">Retry</button>
        </div>
      ) : (
        <>
          {tab === 'overview' && <ProfitabilityView data={data} />}
          {tab === 'clients' && <ClientMatrixView data={data} />}
          {tab === 'lanes' && <LaneView data={data} />}
          {tab === 'forecast' && <ForecastView data={data} />}
          {tab === 'intelligence' && <IntelligenceView data={data} />}
          {tab === 'ai' && <AiInsightsView data={data} />}
        </>
      )}
    </div>
  );
}


// ═══════════════════ SUB-COMPONENTS ═══════════════════

function KpiCard({ label, value, delta, icon: Icon, color = 'blue', suffix = '' }: any) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-white/50 uppercase tracking-wider">{label}</span>
        <Icon className={`w-5 h-5 text-${color}-400`} />
      </div>
      <div className="text-2xl font-black">{value}{suffix}</div>
      {delta !== null && delta !== undefined && (
        <div className={`flex items-center gap-1 mt-2 text-xs ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {delta >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {Math.abs(delta)}% vs last period
        </div>
      )}
    </div>
  );
}

function HealthBadge({ health }: { health: string }) {
  const cfg: Record<string, { bg: string; text: string }> = {
    HEALTHY: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
    PROFITABLE: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
    WARNING: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
    MARGINAL: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
    CRITICAL: { bg: 'bg-red-500/10', text: 'text-red-400' },
    UNPROFITABLE: { bg: 'bg-red-500/10', text: 'text-red-400' },
  };
  const c = cfg[health] || cfg.WARNING;
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${c.bg} ${c.text}`}>
      {health}
    </span>
  );
}


function ProfitabilityView({ data }: { data: any }) {
  const s = data?.summary;
  if (!s) return null;
  const fmt = (v: number) => `R${v.toLocaleString()}`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Revenue" value={fmt(s.totalRevenue)} delta={s.revenueDelta} icon={DollarSign} color="emerald" />
        <KpiCard label="Gross Profit" value={fmt(s.grossProfit)} delta={null} icon={TrendingUp} color="blue" />
        <KpiCard label="Margin" value={`${s.marginPct}%`} delta={null} icon={Target} color={s.marginPct >= s.targetMarginPct ? 'emerald' : 'amber'} />
        <KpiCard label="Deliveries" value={s.deliveryCount.toLocaleString()} delta={null} icon={BarChart3} color="purple" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-sm font-bold text-white/70 mb-3">Cost Breakdown</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-white/50">Total Cost</span><span>{fmt(s.totalCost)}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Avg Cost / Delivery</span><span>R{s.avgCostPerDel}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Avg Revenue / Delivery</span><span>R{s.avgRevenuePerDel}</span></div>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-sm font-bold text-white/70 mb-3">Margin Health</h3>
          <div className="flex items-center gap-3">
            <div className="text-4xl font-black">{s.marginPct}%</div>
            <div className="text-sm text-white/50">
              <div>Target: {s.targetMarginPct}%</div>
              <HealthBadge health={s.marginHealth} />
            </div>
          </div>
          <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
            <div className={`h-full rounded-full ${s.marginPct >= s.targetMarginPct ? 'bg-emerald-500' : s.marginHealth === 'WARNING' ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${Math.min(100, (s.marginPct / s.targetMarginPct) * 100)}%` }} />
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-sm font-bold text-white/70 mb-3">Period</h3>
          <div className="text-3xl font-black text-blue-400">{data.period}</div>
          <p className="text-xs text-white/40 mt-2">Currency: {data.currency}</p>
        </div>
      </div>
    </div>
  );
}


function ClientMatrixView({ data }: { data: any }) {
  if (!data?.clients) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total Clients" value={data.totalClients} icon={Users} color="blue" />
        <KpiCard label="Profitable" value={data.profitable} icon={CheckCircle2} color="emerald" />
        <KpiCard label="Marginal" value={data.marginal} icon={AlertTriangle} color="amber" />
        <KpiCard label="Unprofitable" value={data.unprofitable} icon={ShieldAlert} color="red" />
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
        <div className="p-4 border-b border-white/10">
          <h3 className="font-bold text-sm">Client Profitability Matrix</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-white/50 text-xs uppercase">
              <tr className="border-b border-white/5">
                <th className="text-left p-3">Client</th>
                <th className="text-right p-3">Revenue</th>
                <th className="text-right p-3">Deliveries</th>
                <th className="text-right p-3">Margin</th>
                <th className="text-right p-3">Avg Days to Pay</th>
                <th className="text-right p-3">Collection %</th>
                <th className="text-center p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.clients.map((c: any, i: number) => (
                <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="p-3 font-medium">{c.clientName}</td>
                  <td className="p-3 text-right text-emerald-400">R{(c.revenue ?? 0).toLocaleString()}</td>
                  <td className="p-3 text-right">{c.deliveryCount}</td>
                  <td className={`p-3 text-right font-bold ${c.marginPct >= 35 ? 'text-emerald-400' : c.marginPct >= 15 ? 'text-amber-400' : 'text-red-400'}`}>
                    {c.marginPct}%
                  </td>
                  <td className="p-3 text-right">{c.avgDaysToPay ?? '—'}</td>
                  <td className="p-3 text-right">{c.collectionRate}%</td>
                  <td className="p-3 text-center"><HealthBadge health={c.health} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


function LaneView({ data }: { data: any }) {
  if (!data?.lanes) return null;
  const signalColor: Record<string, string> = {
    UNDERPRICED: 'text-red-400', OPTIMAL: 'text-emerald-400',
    OVERPRICED: 'text-amber-400', LOW_VOLUME: 'text-white/40',
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total Lanes" value={data.totalLanes} icon={MapPin} color="blue" />
        <KpiCard label="Underpriced" value={data.underpriced} icon={AlertTriangle} color="red" />
        <KpiCard label="Optimal" value={data.optimal} icon={CheckCircle2} color="emerald" />
        <KpiCard label="Overpriced" value={data.overpriced} icon={TrendingDown} color="amber" />
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
        <div className="p-4 border-b border-white/10">
          <h3 className="font-bold text-sm">Lane / Route Profitability</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-white/50 text-xs uppercase">
              <tr className="border-b border-white/5">
                <th className="text-left p-3">Route</th>
                <th className="text-right p-3">Deliveries</th>
                <th className="text-right p-3">Revenue</th>
                <th className="text-right p-3">Cost</th>
                <th className="text-right p-3">Profit</th>
                <th className="text-right p-3">Margin</th>
                <th className="text-center p-3">Signal</th>
              </tr>
            </thead>
            <tbody>
              {data.lanes.map((l: any, i: number) => (
                <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="p-3 font-medium">{l.fromZone} → {l.toZone}</td>
                  <td className="p-3 text-right">{l.deliveries}</td>
                  <td className="p-3 text-right text-emerald-400">R{(l.revenue ?? 0).toLocaleString()}</td>
                  <td className="p-3 text-right text-red-300">R{(l.estimatedCost ?? 0).toLocaleString()}</td>
                  <td className="p-3 text-right font-bold">R{(l.grossProfit ?? 0).toLocaleString()}</td>
                  <td className={`p-3 text-right font-bold ${l.marginPct >= 35 ? 'text-emerald-400' : l.marginPct >= 15 ? 'text-amber-400' : 'text-red-400'}`}>
                    {l.marginPct}%
                  </td>
                  <td className={`p-3 text-center font-bold text-xs ${signalColor[l.signal] || 'text-white/50'}`}>
                    {l.signal}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


function ForecastView({ data }: { data: any }) {
  if (!data) return null;
  const fmt = (v: number) => `R${(v ?? 0).toLocaleString()}`;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard label="Monthly Growth Rate" value={`${data.monthlyGrowthRate}%`} icon={TrendingUp} color="blue" />
        <KpiCard label="Pipeline Value" value={fmt(data.pipeline?.value || 0)} icon={Activity} color="purple" />
        <KpiCard label="Confidence" value={`${data.confidence}%`} icon={Target} color="emerald" />
      </div>

      {data.forecast?.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="font-bold text-sm mb-4">Revenue Forecast (Next {data.forecast.length} Months)</h3>
          <div className="space-y-4">
            {data.forecast.map((f: any, i: number) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-20 text-sm text-white/50">{f.period}</div>
                <div className="flex-1">
                  <div className="h-8 rounded-lg bg-white/5 relative overflow-hidden">
                    <div className="absolute inset-y-0 left-0 bg-blue-600/30 rounded-lg"
                      style={{ width: `${Math.min(100, (f.upperBound / (data.forecast[0]?.upperBound || 1)) * 100)}%` }} />
                    <div className="absolute inset-y-0 left-0 bg-blue-600 rounded-lg"
                      style={{ width: `${Math.min(100, (f.predicted / (data.forecast[0]?.upperBound || 1)) * 100)}%` }} />
                    <div className="absolute inset-0 flex items-center px-3 text-sm font-bold">
                      {fmt(f.predicted)}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-white/40 w-32 text-right">
                  {fmt(f.lowerBound)} – {fmt(f.upperBound)}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-white/30 mt-4">Model: {data.model} | 80% confidence interval shown</p>
        </div>
      )}

      {data.historical?.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="font-bold text-sm mb-4">Historical Revenue (12 Months)</h3>
          <div className="flex items-end gap-1 h-32">
            {data.historical.map((m: any, i: number) => {
              const max = Math.max(...data.historical.map((h: any) => h.revenue), 1);
              const pct = (m.revenue / max) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-t bg-blue-600/60 hover:bg-blue-500 transition"
                    style={{ height: `${Math.max(2, pct)}%` }} title={fmt(m.revenue)} />
                  <span className="text-[9px] text-white/30">{m.period.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


function IntelligenceView({ data }: { data: any }) {
  if (!data?.clients) return null;
  const tierColor: Record<string, string> = {
    PLATINUM: 'text-purple-300 bg-purple-500/10', GOLD: 'text-yellow-300 bg-yellow-500/10',
    SILVER: 'text-gray-300 bg-gray-500/10', BRONZE: 'text-orange-300 bg-orange-500/10',
    AT_RISK: 'text-red-300 bg-red-500/10',
  };
  const trendIcon: Record<string, any> = {
    GROWING: <TrendingUp className="w-3 h-3 text-emerald-400" />,
    DECLINING: <TrendingDown className="w-3 h-3 text-red-400" />,
    STABLE: <Activity className="w-3 h-3 text-blue-400" />,
    DORMANT: <AlertTriangle className="w-3 h-3 text-amber-400" />,
    NEW: <Zap className="w-3 h-3 text-purple-400" />,
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total CLV" value={`R${(data.totalCLV ?? 0).toLocaleString()}`} icon={Crown} color="purple" />
        <KpiCard label="Avg CLV" value={`R${(data.avgCLV ?? 0).toLocaleString()}`} icon={DollarSign} color="blue" />
        <KpiCard label="At Risk" value={data.atRiskCount ?? 0} icon={ShieldAlert} color="red" />
        <KpiCard label="Growing" value={data.growingCount ?? 0} icon={TrendingUp} color="emerald" />
      </div>

      {/* Tier distribution */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h3 className="font-bold text-sm mb-3">CLV Tier Distribution</h3>
        <div className="flex gap-3 flex-wrap">
          {Object.entries(data.tiers ?? {}).map(([tier, count]) => (
            <div key={tier} className={`px-3 py-2 rounded-xl ${tierColor[tier.toUpperCase()] || 'bg-white/5 text-white/50'}`}>
              <div className="text-xs uppercase font-bold">{tier}</div>
              <div className="text-lg font-black">{count as number}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Client table */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
        <div className="p-4 border-b border-white/10">
          <h3 className="font-bold text-sm">Client Intelligence — CLV & Churn Prediction</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-white/50 text-xs uppercase">
              <tr className="border-b border-white/5">
                <th className="text-left p-3">Client</th>
                <th className="text-right p-3">CLV (12mo)</th>
                <th className="text-center p-3">Tier</th>
                <th className="text-right p-3">Monthly Avg</th>
                <th className="text-center p-3">Trend</th>
                <th className="text-right p-3">Churn Risk</th>
                <th className="text-right p-3">Months Active</th>
              </tr>
            </thead>
            <tbody>
              {data.clients.slice(0, 15).map((c: any, i: number) => (
                <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="p-3 font-medium">{c.clientName}</td>
                  <td className="p-3 text-right text-emerald-400 font-bold">R{(c.clv ?? 0).toLocaleString()}</td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${tierColor[c.clvTier] || ''}`}>
                      {c.clvTier}
                    </span>
                  </td>
                  <td className="p-3 text-right">R{(c.monthlyAvg ?? 0).toLocaleString()}</td>
                  <td className="p-3 text-center flex items-center justify-center gap-1">
                    {trendIcon[c.volumeTrend]} <span className="text-xs">{c.volumeTrend}</span>
                  </td>
                  <td className="p-3 text-right">
                    <span className={`font-bold ${c.churnRisk >= 50 ? 'text-red-400' : c.churnRisk >= 25 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {c.churnRisk}%
                    </span>
                  </td>
                  <td className="p-3 text-right text-white/50">{c.monthsActive}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


function AiInsightsView({ data }: { data: any }) {
  if (!data?.insights) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <Sparkles className="w-12 h-12 text-blue-400 mx-auto mb-4" />
        <h3 className="text-lg font-bold mb-2">AI Commercial Copilot</h3>
        <p className="text-sm text-white/50">{data?.message || 'Generating insights...'}</p>
      </div>
    );
  }

  const ins = data.insights;
  return (
    <div className="space-y-4">
      {/* Executive Summary */}
      <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-blue-400" />
          <h3 className="font-bold text-sm text-blue-300">Executive Summary</h3>
        </div>
        <p className="text-white/80 leading-relaxed">{ins.executiveSummary}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Opportunities */}
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <h3 className="font-bold text-sm text-emerald-300 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Top Opportunities
          </h3>
          <ul className="space-y-2">
            {ins.topOpportunities?.map((o: string, i: number) => (
              <li key={i} className="text-sm text-white/70 flex gap-2">
                <span className="text-emerald-400 font-bold">{i + 1}.</span> {o}
              </li>
            ))}
          </ul>
        </div>

        {/* Pricing Actions */}
        <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-5">
          <h3 className="font-bold text-sm text-purple-300 mb-3 flex items-center gap-2">
            <Target className="w-4 h-4" /> Pricing Actions
          </h3>
          <ul className="space-y-2">
            {ins.pricingActions?.map((a: string, i: number) => (
              <li key={i} className="text-sm text-white/70 flex gap-2">
                <span className="text-purple-400 font-bold">{i + 1}.</span> {a}
              </li>
            ))}
          </ul>
        </div>

        {/* Client Actions */}
        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5">
          <h3 className="font-bold text-sm text-blue-300 mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" /> Client Actions
          </h3>
          <ul className="space-y-2">
            {ins.clientActions?.map((a: string, i: number) => (
              <li key={i} className="text-sm text-white/70 flex gap-2">
                <span className="text-blue-400 font-bold">{i + 1}.</span> {a}
              </li>
            ))}
          </ul>
        </div>

        {/* Risks */}
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
          <h3 className="font-bold text-sm text-red-300 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Risks
          </h3>
          <ul className="space-y-2">
            {ins.risks?.map((r: string, i: number) => (
              <li key={i} className="text-sm text-white/70 flex gap-2">
                <span className="text-red-400 font-bold">{i + 1}.</span> {r}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Forecast */}
      {ins.forecast && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="font-bold text-sm text-white/70 mb-2">Revenue Outlook</h3>
          <p className="text-white/80">{ins.forecast}</p>
        </div>
      )}

      <p className="text-xs text-white/30 text-right">Generated: {data.generatedAt}</p>
    </div>
  );
}
