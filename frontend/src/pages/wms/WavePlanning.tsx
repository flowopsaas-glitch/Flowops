import { useState, useEffect } from "react";
import { Layers, Loader2, CheckCircle2, Clock, MapPin, Package } from "lucide-react";
import { createWave, listWarehouses } from "../../api/warehouseApi";

export default function WavePlanning() {
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [maxOrders, setMaxOrders] = useState(20);
  const [maxLines, setMaxLines] = useState(100);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listWarehouses().then((r: any) => {
      const data = r?.data ?? r;
      setWarehouses(Array.isArray(data) ? data : []);
      if (data?.[0]?.id) setWarehouseId(data[0].id);
    }).catch(() => {});
  }, []);

  const submit = async () => {
    if (!warehouseId) { setError("Select a warehouse"); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await createWave({ warehouseId, maxOrders, maxLines });
      setResult(res?.data ?? res);
    } catch (e: any) { setError(e?.response?.data?.message || e.message || "Failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#07111f] text-white p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
          <Layers className="h-6 w-6 text-violet-400" />
        </div>
        <div>
          <h1 className="text-2xl font-black">Wave Planning</h1>
          <p className="text-sm text-white/40">Batch picks into efficient waves — one walker fulfills 20 orders in a single pass.</p>
        </div>
      </div>

      {/* Procedure Banner */}
      <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
        <p className="text-xs font-bold text-violet-300 uppercase tracking-wider mb-1">World-Class Procedure</p>
        <p className="text-sm text-white/60">
          Pending pick orders → Grouped by zone → Serpentine path through aisles → One picker, multiple orders. Reduces walk distance by 30-40%.
        </p>
      </div>

      {/* Config */}
      <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 space-y-4">
        <h3 className="text-sm font-black text-white/70 uppercase tracking-wider">Wave Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-white/50 mb-1">Warehouse</label>
            <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400/40">
              <option value="">Select warehouse...</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-white/50 mb-1">Max Orders per Wave</label>
            <input type="number" value={maxOrders} onChange={e => setMaxOrders(+e.target.value)} min={1} max={50}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400/40" />
          </div>
          <div>
            <label className="block text-xs font-bold text-white/50 mb-1">Max Lines per Wave</label>
            <input type="number" value={maxLines} onChange={e => setMaxLines(+e.target.value)} min={10} max={500}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400/40" />
          </div>
        </div>

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <button onClick={submit} disabled={loading}
          className="flex items-center gap-2 rounded-2xl bg-violet-500 px-6 py-3 text-sm font-black text-white hover:bg-violet-400 transition disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
          Generate Wave
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="rounded-[28px] border border-emerald-500/20 bg-emerald-500/5 p-6 space-y-4">
          {result.waveId ? (
            <>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                <h2 className="text-lg font-black text-emerald-300">Wave Created: {result.waveId}</h2>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-xl bg-white/5 p-3 text-center">
                  <p className="text-xl font-black text-white">{result.orders}</p>
                  <p className="text-[10px] text-white/40">Orders</p>
                </div>
                <div className="rounded-xl bg-white/5 p-3 text-center">
                  <p className="text-xl font-black text-white">{result.lines}</p>
                  <p className="text-[10px] text-white/40">Pick Lines</p>
                </div>
                <div className="rounded-xl bg-white/5 p-3 text-center">
                  <p className="text-xl font-black text-white">{result.zones}</p>
                  <p className="text-[10px] text-white/40">Zones</p>
                </div>
                <div className="rounded-xl bg-white/5 p-3 text-center">
                  <p className="text-xl font-black text-white">{result.estimatedPickTime}m</p>
                  <p className="text-[10px] text-white/40">Est. Time</p>
                </div>
              </div>

              {/* Pick Sequence by Zone */}
              {result.pickSequence && Object.entries(result.pickSequence).map(([zone, items]: [string, any]) => (
                <div key={zone} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="h-4 w-4 text-violet-400" />
                    <span className="text-sm font-bold text-white">{zone}</span>
                    <span className="text-[10px] text-white/30 ml-auto">{items.length} lines</span>
                  </div>
                  <div className="space-y-1">
                    {items.slice(0, 5).map((item: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-white/50">
                        <span className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-bold">{idx + 1}</span>
                        <Package className="h-3 w-3" />
                        <span className="font-mono">{item.sku}</span>
                        {item.binCode && <span className="text-white/30">→ {item.binCode}</span>}
                      </div>
                    ))}
                    {items.length > 5 && <p className="text-[10px] text-white/30 pl-7">+ {items.length - 5} more</p>}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-amber-400" />
              <p className="text-sm text-white/60">{result.message || "No pending orders to wave"}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
