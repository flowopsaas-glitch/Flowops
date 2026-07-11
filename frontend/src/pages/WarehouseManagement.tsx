import { useEffect, useState } from "react";
import {
  Package, Warehouse, MapPin, TrendingUp, AlertTriangle, Loader2,
  RefreshCw, Sparkles, BarChart3, ArrowUpRight, ArrowDownRight,
  CheckCircle2, Layers, ScanLine, Truck, Box, Activity, Target,
  ShieldAlert, Clock, Zap,
} from "lucide-react";
import {
  getWmsDashboard, getWmsKpis, getWmsAiInsights, getInventory,
  getInventorySummary, getReplenishment, getMovements,
} from "../api/warehouseApi";

type Tab = 'dashboard' | 'inventory' | 'movements' | 'kpis' | 'replenish' | 'ai';

export default function WarehouseManagement() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTab = async (t: Tab) => {
    setLoading(true); setError(null);
    try {
      let result: any;
      switch (t) {
        case 'dashboard': result = await getWmsDashboard(); break;
        case 'inventory': result = await getInventory(); break;
        case 'movements': result = await getMovements({ days: 7 }); break;
        case 'kpis': result = await getWmsKpis(30); break;
        case 'replenish': result = await getReplenishment(); break;
        case 'ai': result = await getWmsAiInsights(); break;
      }
      setData(result?.data ?? result);
    } catch (e: any) {
      setError(e?.message || 'Failed to load data');
    } finally { setLoading(false); }
  };

  useEffect(() => { loadTab(tab); }, [tab]);

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: 'dashboard', label: 'Overview', icon: Warehouse },
    { key: 'inventory', label: 'Inventory', icon: Package },
    { key: 'movements', label: 'Movements', icon: Activity },
    { key: 'kpis', label: 'KPIs', icon: BarChart3 },
    { key: 'replenish', label: 'Replenishment', icon: Zap },
    { key: 'ai', label: 'AI Insights', icon: Sparkles },
  ];


  return (
    <div className="min-h-screen bg-[#070d19] text-white p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-amber-400 font-bold">Warehouse Operations</div>
          <h1 className="text-2xl font-black mt-1">Warehouse Management System</h1>
          <p className="text-sm text-white/50 mt-1">Inventory, receiving, pick/pack, cycle counts & AI optimization</p>
        </div>
        <button onClick={() => loadTab(tab)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition text-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition ${
              tab === t.key ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20'
                : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
            }`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8 text-center">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-red-300">{error}</p>
          <button onClick={() => loadTab(tab)} className="mt-4 px-4 py-2 bg-red-600 rounded-lg text-sm">Retry</button>
        </div>
      ) : (
        <>
          {tab === 'dashboard' && <DashboardView data={data} />}
          {tab === 'inventory' && <InventoryView data={data} />}
          {tab === 'movements' && <MovementsView data={data} />}
          {tab === 'kpis' && <KpisView data={data} />}
          {tab === 'replenish' && <ReplenishView data={data} />}
          {tab === 'ai' && <AiView data={data} />}
        </>
      )}
    </div>
  );
}


function KpiCard({ label, value, icon: Icon, color = 'amber', sub }: any) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-white/50 uppercase tracking-wider">{label}</span>
        <Icon className={`w-5 h-5 text-${color}-400`} />
      </div>
      <div className="text-2xl font-black">{value}</div>
      {sub && <div className="text-xs text-white/40 mt-1">{sub}</div>}
    </div>
  );
}

function DashboardView({ data }: { data: any }) {
  if (!data) return null;
  const inv = data.inventory || {};
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total SKUs" value={inv.totalSKUs || 0} icon={Package} color="blue" />
        <KpiCard label="Units On Hand" value={(inv.totalUnits || 0).toLocaleString()} icon={Box} color="amber" />
        <KpiCard label="Inventory Value" value={`R${(inv.totalValue || 0).toLocaleString()}`} icon={TrendingUp} color="emerald" />
        <KpiCard label="Warehouses" value={data.warehouses || 0} icon={Warehouse} color="purple" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Pending Receipts" value={data.pendingReceipts || 0} icon={Truck} color="blue" sub="Awaiting goods in" />
        <KpiCard label="Active Picks" value={data.activePicks || 0} icon={ScanLine} color="amber" sub="In progress" />
        <KpiCard label="Replenishment" value={data.replenishmentNeeded || 0} icon={Zap} color="red" sub={`${data.criticalReplenishment || 0} critical`} />
        <KpiCard label="Today's Movements" value={data.todayMovements || 0} icon={Activity} color="emerald" />
      </div>
      {(inv.expiringSoon > 0 || inv.damaged > 0) && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="text-sm text-amber-200">
            {inv.expiringSoon > 0 && <span>{inv.expiringSoon} items expiring within 30 days. </span>}
            {inv.damaged > 0 && <span>{inv.damaged} damaged items need attention.</span>}
          </div>
        </div>
      )}
    </div>
  );
}


function InventoryView({ data }: { data: any }) {
  const items = Array.isArray(data) ? data : data?.data ?? [];
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <div className="p-4 border-b border-white/10">
        <h3 className="font-bold text-sm">Inventory ({items.length} items)</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-white/50 text-xs uppercase">
            <tr className="border-b border-white/5">
              <th className="text-left p-3">SKU</th>
              <th className="text-left p-3">Description</th>
              <th className="text-left p-3">Bin</th>
              <th className="text-right p-3">On Hand</th>
              <th className="text-right p-3">Available</th>
              <th className="text-center p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 50).map((item: any, i: number) => (
              <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="p-3 font-mono text-xs font-bold">{item.sku}</td>
                <td className="p-3">{item.description}</td>
                <td className="p-3 font-mono text-xs text-amber-300">{item.bin?.code || '—'}</td>
                <td className="p-3 text-right font-bold">{item.quantityOnHand}</td>
                <td className="p-3 text-right text-emerald-400">{item.quantityAvailable}</td>
                <td className="p-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    item.status === 'AVAILABLE' ? 'bg-emerald-500/10 text-emerald-400' :
                    item.status === 'DAMAGED' ? 'bg-red-500/10 text-red-400' :
                    'bg-amber-500/10 text-amber-400'
                  }`}>{item.status}</span>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-white/30">No inventory items yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MovementsView({ data }: { data: any }) {
  const items = Array.isArray(data) ? data : data?.data ?? [];
  const typeColor: Record<string, string> = {
    RECEIPT: 'text-emerald-400', PUT_AWAY: 'text-blue-400', PICK: 'text-amber-400',
    TRANSFER: 'text-purple-400', ADJUSTMENT: 'text-red-400', DISPATCH: 'text-cyan-400',
    CYCLE_COUNT: 'text-pink-400', REPLENISH: 'text-indigo-400',
  };
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <div className="p-4 border-b border-white/10">
        <h3 className="font-bold text-sm">Recent Stock Movements (7 days)</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-white/50 text-xs uppercase">
            <tr className="border-b border-white/5">
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">SKU</th>
              <th className="text-right p-3">Qty</th>
              <th className="text-left p-3">Reference</th>
              <th className="text-left p-3">Time</th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 50).map((m: any, i: number) => (
              <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className={`p-3 font-bold text-xs ${typeColor[m.type] || 'text-white/60'}`}>{m.type}</td>
                <td className="p-3 font-mono text-xs">{m.sku}</td>
                <td className={`p-3 text-right font-bold ${m.quantity > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {m.quantity > 0 ? '+' : ''}{m.quantity}
                </td>
                <td className="p-3 text-white/50 text-xs">{m.reference || m.reason || '—'}</td>
                <td className="p-3 text-white/40 text-xs">{new Date(m.performedAt).toLocaleString('en-ZA')}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-white/30">No movements yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function KpisView({ data }: { data: any }) {
  if (!data) return null;
  const t = data.throughput || {};
  const a = data.accuracy || {};
  const u = data.utilisation || {};
  const e = data.efficiency || {};
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Avg Movements/Day" value={t.avgMovementsPerDay || 0} icon={Activity} color="blue" />
        <KpiCard label="Units Received" value={(t.unitsReceived || 0).toLocaleString()} icon={Truck} color="emerald" />
        <KpiCard label="Units Picked" value={(t.unitsPicked || 0).toLocaleString()} icon={ScanLine} color="amber" />
        <KpiCard label="Today's Activity" value={t.movementsToday || 0} icon={Zap} color="purple" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Inventory Accuracy" value={`${a.inventoryAccuracy || 100}%`} icon={Target} color="emerald" sub="From cycle counts" />
        <KpiCard label="Pick Accuracy" value={`${a.pickAccuracy || 100}%`} icon={CheckCircle2} color="blue" />
        <KpiCard label="Bin Utilisation" value={`${u.binUtilisation || 0}%`} icon={Layers} color="amber" sub={`${u.occupiedBins || 0}/${u.totalBins || 0} bins`} />
        <KpiCard label="Avg Pick Time" value={`${e.avgPickTimeHours || 0}h`} icon={Clock} color="purple" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-sm font-bold text-white/70 mb-3">Backlogs</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-white/50">Pick orders pending</span><span className="font-bold">{e.pickOrdersBacklog || 0}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Receipts awaiting</span><span className="font-bold">{e.receiptsBacklog || 0}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Blocked bins</span><span className="font-bold text-red-400">{u.blockedBins || 0}</span></div>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-sm font-bold text-white/70 mb-3">Variance</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-white/50">Total variances</span><span className="font-bold">{a.totalVariances || 0}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Variance value</span><span className="font-bold text-red-400">R{(a.varianceValue || 0).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Receive accuracy</span><span className="font-bold text-emerald-400">{a.receiveAccuracy || 100}%</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReplenishView({ data }: { data: any }) {
  const items = Array.isArray(data) ? data : data?.data ?? [];
  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
          <p className="text-emerald-300 font-bold">All pick faces adequately stocked</p>
          <p className="text-sm text-white/40 mt-1">No replenishment needed right now</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-sm">AI Replenishment Suggestions ({items.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-white/50 text-xs uppercase">
                <tr className="border-b border-white/5">
                  <th className="text-center p-3">Urgency</th>
                  <th className="text-left p-3">SKU</th>
                  <th className="text-left p-3">Description</th>
                  <th className="text-left p-3">Bin</th>
                  <th className="text-right p-3">Current</th>
                  <th className="text-right p-3">Reorder At</th>
                  <th className="text-right p-3">Suggested Qty</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r: any, i: number) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        r.urgency === 'CRITICAL' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'
                      }`}>{r.urgency}</span>
                    </td>
                    <td className="p-3 font-mono text-xs font-bold">{r.sku}</td>
                    <td className="p-3">{r.description}</td>
                    <td className="p-3 font-mono text-xs text-amber-300">{r.bin}</td>
                    <td className="p-3 text-right font-bold text-red-400">{r.currentQty}</td>
                    <td className="p-3 text-right text-white/50">{r.reorderPoint}</td>
                    <td className="p-3 text-right font-bold text-emerald-400">{r.suggestedQty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


function AiView({ data }: { data: any }) {
  if (!data?.insights) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <Sparkles className="w-12 h-12 text-amber-400 mx-auto mb-4" />
        <h3 className="text-lg font-bold mb-2">AI Warehouse Advisor</h3>
        <p className="text-sm text-white/50">{data?.message || 'Generating insights...'}</p>
      </div>
    );
  }
  const ins = data.insights;
  return (
    <div className="space-y-4">
      {/* Health Score */}
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 flex items-center gap-6">
        <div className="text-5xl font-black text-amber-400">{ins.healthScore || '—'}</div>
        <div>
          <div className="text-xs uppercase tracking-wider text-amber-300 font-bold">Warehouse Health Score</div>
          <p className="text-white/70 mt-1 text-sm">{ins.summary}</p>
        </div>
      </div>

      {/* Alerts */}
      {ins.alerts?.length > 0 && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
          <h3 className="font-bold text-sm text-red-300 mb-3 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" /> Alerts
          </h3>
          <ul className="space-y-2">
            {ins.alerts.map((a: string, i: number) => (
              <li key={i} className="text-sm text-white/70 flex gap-2">
                <span className="text-red-400 font-bold">{i + 1}.</span> {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Recommendations */}
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <h3 className="font-bold text-sm text-emerald-300 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Recommendations
          </h3>
          <ul className="space-y-2">
            {(ins.recommendations || []).map((r: string, i: number) => (
              <li key={i} className="text-sm text-white/70 flex gap-2">
                <span className="text-emerald-400 font-bold">{i + 1}.</span> {r}
              </li>
            ))}
          </ul>
        </div>

        {/* Optimizations */}
        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5">
          <h3 className="font-bold text-sm text-blue-300 mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Optimizations
          </h3>
          <ul className="space-y-2">
            {(ins.optimizations || []).map((o: string, i: number) => (
              <li key={i} className="text-sm text-white/70 flex gap-2">
                <span className="text-blue-400 font-bold">{i + 1}.</span> {o}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="text-xs text-white/30 text-right">Generated: {data.generatedAt}</p>
    </div>
  );
}
