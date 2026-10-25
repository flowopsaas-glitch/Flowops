import { useState, useEffect } from "react";
import { Brain, Loader2, ArrowUpRight, ArrowDownRight, ArrowRight , type LucideIcon } from "lucide-react";
import { getSlotting, listWarehouses } from "../../api/warehouseApi";

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  MEDIUM: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  LOW: "border-sky-500/30 bg-sky-500/10 text-sky-300",
};

const REC_ICONS: Record<string, LucideIcon> = {
  MOVE_TO_PICK_ZONE: ArrowUpRight,
  MOVE_CLOSER_TO_DISPATCH: ArrowRight,
  MOVE_TO_BULK: ArrowDownRight,
};

type SlottingRecommendation = {
  sku: string; description?: string; reason?: string; velocity?: string;
  priority?: string; recommendation?: string; picksLast30d?: number;
  currentBin?: string; currentZone?: string;
};
type SlottingResult = {
  velocityAnalysis?: { A?: number; B?: number; C?: number; totalSKUs?: number };
  summary?: { message?: string; totalRecommendations?: number };
  recommendations?: SlottingRecommendation[];
};

export default function AISlotting() {
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [result, setResult] = useState<SlottingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");


  useEffect(() => {
    listWarehouses().then((r) => {
      const data = r?.data ?? r;
      setWarehouses(Array.isArray(data) ? data : []);
      if (data?.[0]?.id) setWarehouseId(data[0].id);
    }).catch((e) => console.error('warehouse list failed to load', e));
  }, []);

  const analyze = async () => {
    if (!warehouseId) { setError("Select a warehouse"); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await getSlotting(warehouseId);
      setResult(res?.data ?? res);
    } catch (e) { setError(e?.response?.data?.message || e.message || "Failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#07111f] text-white p-6 space-y-6">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-2xl bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center">
          <Brain className="h-6 w-6 text-fuchsia-400" />
        </div>
        <div>
          <h1 className="text-2xl font-black">Slotting Analysis</h1>
          <p className="text-sm text-white/40">Rule-based ABC velocity analysis — fast movers near dispatch, slow movers to bulk. Not a machine-learning model.</p>
        </div>
      </div>


      {/* Procedure */}
      <div className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-4">
        <p className="text-xs font-bold text-fuchsia-300 uppercase tracking-wider mb-1">How it works</p>
        <p className="text-sm text-white/60">
          30-day pick frequency analysis. A-class (top 20%) near dispatch. B-class mid-warehouse. C-class (50%) bulk storage.
          Recommendations are suggestions from your pick history — review them before moving stock; no saving is guaranteed.
        </p>
      </div>

      {/* Controls */}
      <div className="flex items-end gap-4">
        <div className="flex-1 max-w-xs">
          <label className="block text-xs font-bold text-white/50 mb-1" htmlFor="field-warehouse-1">Warehouse</label>
          <select id="field-warehouse-1" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-fuchsia-400/40">
            <option value="">Select warehouse...</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <button onClick={analyze} disabled={loading}
          className="flex items-center gap-2 rounded-2xl bg-fuchsia-500 px-6 py-2.5 text-sm font-black text-white hover:bg-fuchsia-400 transition disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
          Run analysis
        </button>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}


      {result && (
        <div className="space-y-5">
          {/* Velocity Summary */}
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-center">
              <p className="text-2xl font-black text-rose-300">{result.velocityAnalysis?.A || 0}</p>
              <p className="text-[10px] text-white/40 font-bold">A-Class (Top 20%)</p>
            </div>
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-center">
              <p className="text-2xl font-black text-amber-300">{result.velocityAnalysis?.B || 0}</p>
              <p className="text-[10px] text-white/40 font-bold">B-Class (Next 30%)</p>
            </div>
            <div className="rounded-xl bg-sky-500/10 border border-sky-500/20 p-3 text-center">
              <p className="text-2xl font-black text-sky-300">{result.velocityAnalysis?.C || 0}</p>
              <p className="text-[10px] text-white/40 font-bold">C-Class (Bottom 50%)</p>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
              <p className="text-2xl font-black text-white">{result.velocityAnalysis?.totalSKUs || 0}</p>
              <p className="text-[10px] text-white/40 font-bold">Total SKUs</p>
            </div>
          </div>

          {/* Rule-based summary */}
          {result.summary && (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <p className="text-sm text-white/80">{result.summary.message}</p>
              <p className="text-xs text-white/40 mt-1">
                Pick-time impact is not estimated — measure it after relocating stock.
              </p>
            </div>
          )}


          {/* Recommendations */}
          {result.recommendations?.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-black text-white/70 uppercase tracking-wider">
                Relocation Recommendations ({result.summary?.totalRecommendations || result.recommendations.length})
              </h3>
              {result.recommendations.slice(0, 20).map((rec, i) => {
                const Icon = REC_ICONS[rec.recommendation] || ArrowRight;
                return (
                  <div key={i} className={`rounded-xl border p-3 ${PRIORITY_COLORS[rec.priority] || PRIORITY_COLORS.LOW}`}>
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">{rec.sku} — {rec.description || "N/A"}</p>
                        <p className="text-xs opacity-70">{rec.reason}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-[10px] font-bold uppercase">{rec.velocity}-Class</span>
                        <p className="text-[10px] opacity-60">{rec.picksLast30d} picks/30d</p>
                      </div>
                    </div>
                    <p className="text-[10px] opacity-50 mt-1">Current: {rec.currentBin} ({rec.currentZone})</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
