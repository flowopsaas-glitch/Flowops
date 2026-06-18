import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, Clock,
  Loader2, RefreshCw, Truck, Wallet,
} from "lucide-react";
import { api } from "../../api/client";

type Transaction = {
  id: string; type: "COLLECTION" | "SETTLEMENT" | "ADJUSTMENT";
  amount: number; balance: number; note?: string | null; createdAt: string;
};

type WalletDetail = {
  id: string; balance: number; totalCollected: number; totalSettled: number;
  lastSettledAt: string | null;
  driver: { id: string; name: string; phone?: string | null; vehicleReg?: string | null; status: string };
  transactions: Transaction[];
};

function money(v?: number | null) {
  return `ZAR ${(v ?? 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;
}
function unwrap(raw: any): any { return raw?.data ?? raw; }

const TYPE_CFG = {
  COLLECTION: { label: "Collected",   cls: "border-sky-400/20 bg-sky-500/10 text-sky-200",       sign: "+" },
  SETTLEMENT: { label: "Settled",     cls: "border-emerald-400/20 bg-emerald-500/10 text-emerald-200", sign: "−" },
  ADJUSTMENT: { label: "Adjustment",  cls: "border-amber-400/20 bg-amber-500/10 text-amber-200",  sign: "±" },
};

export default function DriverWalletPage() {
  const { driverId } = useParams<{ driverId: string }>();
  const navigate = useNavigate();
  const [wallet, setWallet] = useState<WalletDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState(false);
  const [settleAmount, setSettleAmount] = useState("");
  const [settleNote, setSettleNote] = useState("");
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    if (!driverId) return;
    setLoading(true);
    try {
      const raw: any = await api.get(`/cod/wallets/${driverId}`);
      setWallet(unwrap(raw));
    } finally { setLoading(false); }
  }, [driverId]);

  useEffect(() => { void load(); }, [load]);

  const settle = async () => {
    setError("");
    const amount = parseFloat(settleAmount);
    if (!amount || amount <= 0) { setError("Enter a positive settlement amount."); return; }
    if (wallet && amount > wallet.balance) { setError(`Amount exceeds balance (${money(wallet.balance)}).`); return; }
    setSettling(true);
    try {
      await api.post(`/cod/settle/${driverId}`, { amount, note: settleNote || undefined });
      setSettleAmount(""); setSettleNote("");
      await load();
    } catch (err: any) {
      setError(err?.message || "Settlement failed.");
    } finally { setSettling(false); }
  };

  if (loading && !wallet) {
    return (
      <div className="flex items-center justify-center py-20 text-white/30">
        <RefreshCw className="h-6 w-6 animate-spin mr-3" /> Loading wallet…
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="space-y-6">
        <button onClick={() => navigate("/cod")} className="flex items-center gap-2 text-white/50 hover:text-white text-sm font-bold">
          <ArrowLeft className="h-4 w-4" /> Back to COD
        </button>
        <div className="text-white/40">Wallet not found for this driver.</div>
      </div>
    );
  }

  const visibleTxns = showAll ? wallet.transactions : wallet.transactions.slice(0, 15);

  return (
    <div className="space-y-6">
      {/* Back */}
      <button onClick={() => navigate("/cod")} className="flex items-center gap-2 text-white/50 hover:text-white text-sm font-bold transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to COD Reconciliation
      </button>

      {/* Header */}
      <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-7 shadow-xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
              <Truck className="h-6 w-6 text-white/70" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-white">{wallet.driver.name}</h1>
              <p className="mt-0.5 text-sm text-slate-400">
                {wallet.driver.vehicleReg ?? wallet.driver.status}
                {wallet.driver.phone && ` · ${wallet.driver.phone}`}
              </p>
            </div>
          </div>
          <button onClick={load} className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-white hover:bg-white/10">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className={`rounded-[24px] border p-5 ${wallet.balance > 0 ? "border-amber-400/20 bg-amber-500/5" : "border-emerald-400/20 bg-emerald-500/5"}`}>
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50 flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" /> Current Balance</div>
          <div className={`mt-2 text-3xl font-black ${wallet.balance > 0 ? "text-amber-300" : "text-emerald-300"}`}>{money(wallet.balance)}</div>
          {wallet.balance > 0 && <div className="mt-1 text-xs text-amber-400/80">Driver is holding cash</div>}
        </div>
        <div className="rounded-[24px] border border-sky-400/20 bg-sky-500/5 p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">Total Collected</div>
          <div className="mt-2 text-3xl font-black text-sky-300">{money(wallet.totalCollected)}</div>
          <div className="mt-1 text-xs text-slate-400">All time COD receipts</div>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">Total Settled</div>
          <div className="mt-2 text-3xl font-black text-white">{money(wallet.totalSettled)}</div>
          {wallet.lastSettledAt && (
            <div className="mt-1 text-xs text-slate-400 flex items-center gap-1">
              <Clock className="h-3 w-3" /> Last: {new Date(wallet.lastSettledAt).toLocaleDateString("en-ZA")}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        {/* Transaction ledger */}
        <div className="rounded-[28px] border border-white/10 bg-white/[0.05] shadow-xl overflow-hidden">
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="font-black text-white">Transaction Ledger</h2>
            <p className="text-xs text-slate-400 mt-0.5">{wallet.transactions.length} entries</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.14em] text-white/40">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3">Balance</th>
                  <th className="px-5 py-3">Note</th>
                </tr>
              </thead>
              <tbody>
                {wallet.transactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-white/30">No transactions yet.</td>
                  </tr>
                ) : visibleTxns.map((tx) => {
                  const cfg = TYPE_CFG[tx.type] ?? TYPE_CFG.ADJUSTMENT;
                  return (
                    <tr key={tx.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="px-5 py-3 text-xs text-slate-400">
                        {new Date(tx.createdAt).toLocaleDateString("en-ZA")}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${cfg.cls}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className={`px-5 py-3 font-black ${tx.type === "SETTLEMENT" ? "text-rose-300" : "text-emerald-300"}`}>
                        {cfg.sign}{money(tx.amount)}
                      </td>
                      <td className="px-5 py-3 font-mono text-white/70 text-xs">{money(tx.balance)}</td>
                      <td className="px-5 py-3 text-xs text-slate-400 max-w-[200px] truncate">{tx.note ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {wallet.transactions.length > 15 && (
            <button onClick={() => setShowAll((v) => !v)}
              className="w-full flex items-center justify-center gap-2 border-t border-white/10 py-3 text-xs font-bold text-white/50 hover:text-white transition-colors">
              {showAll ? <><ChevronUp className="h-3.5 w-3.5" /> Show less</> : <><ChevronDown className="h-3.5 w-3.5" /> Show all {wallet.transactions.length}</>}
            </button>
          )}
        </div>

        {/* Settlement form */}
        <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl h-fit">
          <h2 className="font-black text-white mb-1">Record Settlement</h2>
          <p className="text-xs text-slate-400 mb-5">Driver remits cash to the company.</p>

          {error && (
            <div className="mb-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
          )}

          <div className="space-y-4">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">Amount *</label>
              <div className="relative mt-1.5">
                <span className="absolute left-3.5 top-3 text-slate-400 text-sm font-bold">ZAR</span>
                <input
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  type="number" min="0.01" step="0.01"
                  placeholder={`max ${(wallet.balance).toFixed(2)}`}
                  className="w-full rounded-xl border border-white/10 bg-[#071224] pl-14 pr-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400"
                />
              </div>
              {wallet.balance > 0 && (
                <button
                  type="button"
                  onClick={() => setSettleAmount(wallet.balance.toFixed(2))}
                  className="mt-1 text-[11px] text-emerald-400 hover:underline"
                >
                  Use full balance ({money(wallet.balance)})
                </button>
              )}
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">Note</label>
              <input
                value={settleNote}
                onChange={(e) => setSettleNote(e.target.value)}
                placeholder="e.g. Cash handed over at depot"
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#071224] px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400"
              />
            </div>
            <button disabled={settling || !settleAmount || wallet.balance === 0} onClick={settle}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-400 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">
              {settling ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {settling ? "Processing…" : "Confirm Settlement"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
