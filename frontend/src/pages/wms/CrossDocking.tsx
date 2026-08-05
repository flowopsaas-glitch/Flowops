import { useState } from "react";
import { ArrowRight, Plus, Trash2, Truck, Package, CheckCircle2, Loader2, Zap } from "lucide-react";
import { createCrossDock, listWarehouses } from "../../api/warehouseApi";
import { useEffect } from "react";

type Line = { sku: string; quantity: number; destinationClient: string; destinationAddress: string };

export default function CrossDocking() {
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [inboundRef, setInboundRef] = useState("");
  const [lines, setLines] = useState<Line[]>([{ sku: "", quantity: 1, destinationClient: "", destinationAddress: "" }]);
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

  const addLine = () => setLines([...lines, { sku: "", quantity: 1, destinationClient: "", destinationAddress: "" }]);
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: keyof Line, value: string | number) => {
    const updated = [...lines];
    (updated[i] as any)[field] = value;
    setLines(updated);
  };

  const submit = async () => {
    if (!warehouseId) { setError("Select a warehouse"); return; }
    if (lines.some(l => !l.sku || !l.destinationClient)) { setError("Fill SKU and destination for all lines"); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await createCrossDock({ warehouseId, supplierName, inboundRef, lines });
      setResult(res?.data ?? res);
    } catch (e: any) { setError(e?.response?.data?.message || e.message || "Failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#07111f] text-white p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <Zap className="h-6 w-6 text-amber-400" />
        </div>
        <div>
          <h1 className="text-2xl font-black">Cross-Docking</h1>
          <p className="text-sm text-white/40">Bypass storage — inbound goes direct to outbound trucks. Zero dwell time.</p>
        </div>
      </div>

      {/* Procedure Banner */}
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
        <p className="text-xs font-bold text-amber-300 uppercase tracking-wider mb-1">World-Class Procedure</p>
        <p className="text-sm text-white/60">
          Supplier truck arrives → Sorted by destination → Pick orders auto-created → Direct to dispatch bay. No put-away, no storage, no wasted time.
        </p>
      </div>

      {!result ? (
        <div className="space-y-5">
          {/* Warehouse + Supplier */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-white/50 mb-1">Warehouse</label>
              <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400/40">
                <option value="">Select warehouse...</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-white/50 mb-1">Supplier Name</label>
              <input value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="e.g. Unilever"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-sky-400/40" />
            </div>
            <div>
              <label className="block text-xs font-bold text-white/50 mb-1">Inbound Reference</label>
              <input value={inboundRef} onChange={e => setInboundRef(e.target.value)} placeholder="PO-12345"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-sky-400/40" />
            </div>
          </div>

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-bold text-white/50 uppercase tracking-wider">Inbound Lines (Sort by Destination)</label>
              <button onClick={addLine} className="flex items-center gap-1 text-xs font-bold text-sky-400 hover:text-sky-300">
                <Plus className="h-3.5 w-3.5" /> Add Line
              </button>
            </div>
            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_1fr_1fr_40px] gap-2 items-center">
                  <input value={line.sku} onChange={e => updateLine(i, "sku", e.target.value)} placeholder="SKU / Barcode"
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none" />
                  <input type="number" value={line.quantity} onChange={e => updateLine(i, "quantity", +e.target.value)} min={1}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white text-center outline-none" />
                  <input value={line.destinationClient} onChange={e => updateLine(i, "destinationClient", e.target.value)} placeholder="Destination client"
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none" />
                  <input value={line.destinationAddress} onChange={e => updateLine(i, "destinationAddress", e.target.value)} placeholder="Address (optional)"
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none" />
                  {lines.length > 1 && (
                    <button onClick={() => removeLine(i)} className="p-2 rounded-lg hover:bg-white/5 text-white/30 hover:text-rose-400">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <button onClick={submit} disabled={loading}
            className="flex items-center gap-2 rounded-2xl bg-amber-500 px-6 py-3 text-sm font-black text-black hover:bg-amber-400 transition disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
            Execute Cross-Dock
          </button>
        </div>
      ) : (
        /* Success Result */
        <div className="rounded-[28px] border border-emerald-500/20 bg-emerald-500/5 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-400" />
            <h2 className="text-lg font-black text-emerald-300">Cross-Dock Complete</h2>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl bg-white/5 p-3 text-center">
              <p className="text-2xl font-black text-white">{result.receiptNumber}</p>
              <p className="text-[10px] text-white/40">Receipt Number</p>
            </div>
            <div className="rounded-xl bg-white/5 p-3 text-center">
              <p className="text-2xl font-black text-white">{result.totalItems}</p>
              <p className="text-[10px] text-white/40">Total Items</p>
            </div>
            <div className="rounded-xl bg-white/5 p-3 text-center">
              <p className="text-2xl font-black text-white">{result.destinations}</p>
              <p className="text-[10px] text-white/40">Destinations</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-white/50 mb-2">Auto-Created Pick Orders:</p>
            {result.pickOrders?.map((po: any) => (
              <div key={po.id} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2 mb-1">
                <Package className="h-4 w-4 text-sky-400" />
                <span className="text-sm font-bold text-white">{po.orderNumber}</span>
                <ArrowRight className="h-3 w-3 text-white/30" />
                <span className="text-sm text-white/60">{po.client}</span>
              </div>
            ))}
          </div>
          <button onClick={() => { setResult(null); setLines([{ sku: "", quantity: 1, destinationClient: "", destinationAddress: "" }]); }}
            className="text-sm font-bold text-sky-400 hover:text-sky-300">
            + New Cross-Dock
          </button>
        </div>
      )}
    </div>
  );
}
