import { useState } from "react";
import { ScanLine, CheckCircle2, XCircle, Package, Box, Truck, Loader2 , type LucideIcon } from "lucide-react";
import { verifyScan } from "../../api/warehouseApi";

const CONTEXTS = [
  { value: "RECEIVE", label: "Receiving", desc: "Verify inbound goods" },
  { value: "PICK", label: "Picking", desc: "Confirm correct bin" },
  { value: "PUT_AWAY", label: "Put-Away", desc: "Verify storage location" },
  { value: "TRANSFER", label: "Transfer", desc: "Bin-to-bin move" },
  { value: "CYCLE_COUNT", label: "Cycle Count", desc: "Stock verification" },
];

const TYPE_ICONS: Record<string, LucideIcon> = {
  SKU: Package,
  BIN: Box,
  GOODS_RECEIPT: Truck,
  PICK_ORDER: Package,
};


type ScanResult = {
  verification?: { valid?: boolean; errors?: string[] };
  matched?: boolean;
  type?: string;
  data?: Record<string, unknown>;
  barcode?: string;
};
type ScanHistoryItem = ScanResult & { scannedAt: string };

export default function BarcodeScan() {
  const [barcode, setBarcode] = useState("");
  const [context, setContext] = useState("RECEIVE");
  const [expectedSku, setExpectedSku] = useState("");
  const [expectedBin, setExpectedBin] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);

  const scan = async () => {
    if (!barcode.trim()) return;
    setLoading(true); setResult(null);
    try {
      const res = await verifyScan({
        barcode: barcode.trim(),
        context,
        ...(expectedSku && { expectedSku }),
        ...(expectedBin && { expectedBin }),
      });
      const data = res?.data ?? res;
      setResult(data);
      setHistory(prev => [{ ...data, scannedAt: new Date().toISOString() }, ...prev.slice(0, 19)]);
    } catch (e) {
      setResult({ matched: false, verification: { valid: false, errors: [e.message || "Scan failed"] } });
    }
    finally { setLoading(false); setBarcode(""); }
  };

  return (
    <div className="min-h-screen bg-[#07111f] text-white p-6 space-y-6">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
          <ScanLine className="h-6 w-6 text-sky-400" />
        </div>
        <div>
          <h1 className="text-2xl font-black">Barcode Verification</h1>
          <p className="text-sm text-white/40">Scan any barcode — SKU, bin, receipt, or pick order. Context-aware validation.</p>
        </div>
      </div>


      {/* Context Selection */}
      <div className="grid grid-cols-5 gap-2">
        {CONTEXTS.map(c => (
          <button key={c.value} onClick={() => setContext(c.value)}
            className={`rounded-xl border p-3 text-center transition ${
              context === c.value
                ? "border-sky-400/50 bg-sky-500/10"
                : "border-white/10 bg-white/[0.02] hover:border-white/20"
            }`}>
            <p className={`text-xs font-bold ${context === c.value ? "text-sky-300" : "text-white/60"}`}>{c.label}</p>
            <p className="text-[9px] text-white/30 mt-0.5">{c.desc}</p>
          </button>
        ))}
      </div>

      {/* Scan Input */}
      <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 space-y-4">
        <form onSubmit={e => { e.preventDefault(); scan(); }} className="flex gap-3">
          <div className="relative flex-1">
            <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-white/30" />
            <input value={barcode} onChange={e => setBarcode(e.target.value)}
              placeholder="Scan or type barcode..."
                className="w-full rounded-2xl border border-white/10 bg-white/5 pl-10 pr-4 py-3.5 text-lg font-mono text-white placeholder-white/30 outline-none focus:border-sky-400/40" />
          </div>
          <button type="submit" disabled={loading || !barcode.trim()}
            className="rounded-2xl bg-sky-500 px-6 py-3.5 text-sm font-black text-white hover:bg-sky-400 transition disabled:opacity-50">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Verify"}
          </button>
        </form>

        {/* Optional expected values */}
        <div className="grid grid-cols-2 gap-3">
          <input value={expectedSku} onChange={e => setExpectedSku(e.target.value)} placeholder="Expected SKU (optional)"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-white/30 outline-none" />
          <input value={expectedBin} onChange={e => setExpectedBin(e.target.value)} placeholder="Expected Bin (optional)"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-white/30 outline-none" />
        </div>
      </div>


      {/* Scan Result */}
      {result && (
        <div className={`rounded-[28px] border p-6 ${
          result.verification?.valid
            ? "border-emerald-500/20 bg-emerald-500/5"
            : "border-rose-500/20 bg-rose-500/5"
        }`}>
          <div className="flex items-center gap-3 mb-4">
            {result.verification?.valid ? (
              <CheckCircle2 className="h-7 w-7 text-emerald-400" />
            ) : (
              <XCircle className="h-7 w-7 text-rose-400" />
            )}
            <div>
              <p className={`text-lg font-black ${result.verification?.valid ? "text-emerald-300" : "text-rose-300"}`}>
                {result.verification?.valid ? "VERIFIED" : "MISMATCH"}
              </p>
              <p className="text-xs text-white/40">
                {result.matched ? `Matched as ${result.type}` : "No match found"}
              </p>
            </div>
          </div>

          {result.data && (
            <div className="rounded-xl bg-white/5 p-4 space-y-2">
              {Object.entries(result.data).map(([key, val]) => (
                val != null && (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-white/40 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                    <span className="text-white font-mono text-xs">{typeof val === 'object' ? JSON.stringify(val) : String(val)}</span>
                  </div>
                )
              ))}
            </div>
          )}

          {result.verification?.errors?.length > 0 && (
            <div className="mt-3 space-y-1">
              {result.verification.errors.map((err: string, i: number) => (
                <p key={i} className="text-xs text-rose-300">{err}</p>
              ))}
            </div>
          )}
        </div>
      )}


      {/* Scan History */}
      {history.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-white/50 uppercase tracking-wider">Recent Scans</h3>
          {history.map((h, i) => {
            const Icon = TYPE_ICONS[h.type] || Package;
            return (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                <Icon className="h-4 w-4 text-white/30" />
                <span className="text-xs font-mono text-white/60">{h.barcode}</span>
                <span className={`text-[10px] font-bold ${h.verification?.valid ? "text-emerald-400" : "text-rose-400"}`}>
                  {h.verification?.valid ? "OK" : "FAIL"}
                </span>
                <span className="text-[10px] text-white/20 ml-auto">
                  {new Date(h.scannedAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
