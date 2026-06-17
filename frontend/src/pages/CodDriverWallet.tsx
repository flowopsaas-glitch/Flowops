import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Banknote,
  CheckCircle,
  PackageCheck,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { api } from "../api/client";

// ── Types ──────────────────────────────────────────────────────────────────

type Transaction = {
  id: string;
  type: "COD_COLLECTED" | "SETTLEMENT" | "ADJUSTMENT";
  amount: number;
  currency: string;
  notes?: string | null;
  createdAt: string;
  waybill?: { trackingNumber: string; status: string } | null;
};

type WalletDetail = {
  id: string | null;
  balance: number;
  totalCollected: number;
  totalSettled: number;
  lastSettledAt: string | null;
  driver: {
    id: string;
    name: string;
    phone: string;
    vehicleReg?: string | null;
    status: string;
  };
  transactions: Transaction[];
};

// ── Helpers ────────────────────────────────────────────────────────────────

function money(v: number | null | undefined, cur = "ZAR") {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${cur} ${Number(v).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function unwrap(res: any) {
  return res?.data ?? res;
}

const TX_STYLE: Record<string, string> = {
  COD_COLLECTED: "border-emerald-400/20 bg-emerald-500/10 text-emerald-200",
  SETTLEMENT: "border-blue-400/20 bg-blue-500/10 text-blue-200",
  ADJUSTMENT: "border-amber-400/20 bg-amber-500/10 text-amber-200",
};

const TX_LABEL: Record<string, string> = {
  COD_COLLECTED: "Collected",
  SETTLEMENT: "Settlement",
  ADJUSTMENT: "Adjustment",
};

function StatCard(props: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.05] p-5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/50">{props.label}</div>
        <div className={props.tone ?? "text-white/40"}>{props.icon}</div>
      </div>
      <div className="mt-2.5 text-3xl font-black text-white">{props.value}</div>
      {props.sub ? <div className="mt-1 text-xs text-slate-400">{props.sub}</div> : null}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function CodDriverWallet() {
  const { driverId } = useParams<{ driverId: string }>();
  const navigate = useNavigate();

  const [wallet, setWallet] = useState<WalletDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState("");

  // Settlement form
  const [showSettle, setShowSettle] = useState(false);
  const [settleAmount, setSettleAmount] = useState("");
  const [settleNotes, setSettleNotes] = useState("");

  // Adjustment form
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNotes, setAdjustNotes] = useState("");

  const load = useCallback(async () => {
    if (!driverId) return;
    setLoading(true);
    setError("");
    try {
      const res: any = await api.get(`/cod/wallets/${driverId}`);
      setWallet(unwrap(res) as WalletDetail);
    } catch (err: any) {
      setError(err?.message || "Failed to load driver wallet.");
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  useEffect(() => { void load(); }, [load]);

  async function settle() {
    const amount = parseFloat(settleAmount);
    if (!amount || amount <= 0) { setError("Enter a valid settlement amount."); return; }
    setBusy("settle"); setError(""); setSuccess("");
    try {
      await api.post(`/cod/settle/${driverId}`, {
        amount,
        notes: settleNotes || "Cash remitted to company",
      });
      setSuccess(`Settlement of ${money(amount)} recorded.`);
      setShowSettle(false);
      setSettleAmount("");
      setSettleNotes("");
      await load();
    } catch (err: any) {
      setError(err?.message || "Settlement failed.");
    } finally {
      setBusy("");
    }
  }

  async function adjust() {
    const amount = parseFloat(adjustAmount);
    if (!amount) { setError("Enter an adjustment amount (negative to deduct)."); return; }
    if (!adjustNotes.trim()) { setError("A reason is required for adjustments."); return; }
    setBusy("adjust"); setError(""); setSuccess("");
    try {
      await api.post(`/cod/adjust/${driverId}`, { amount, notes: adjustNotes });
      setSuccess(`Adjustment of ${money(amount)} applied.`);
      setShowAdjust(false);
      setAdjustAmount("");
      setAdjustNotes("");
      await load();
    } catch (err: any) {
      setError(err?.message || "Adjustment failed.");
    } finally {
      setBusy("");
    }
  }

  const cur = "ZAR";
  const balance = wallet?.balance ?? 0;

  return (
    <div className="space-y-6">
      {/* Back */}
      <button
        onClick={() => navigate("/cod")}
        className="inline-flex items-center gap-2 text-sm font-bold text-slate-300 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Back to COD Reconciliation
      </button>

      {/* Feedback */}
      {error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      ) : null}
      {success ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{success}</div>
      ) : null}

      {loading && !wallet ? (
        <div className="grid place-items-center rounded-[28px] border border-white/10 bg-white/[0.04] py-16 text-white/60">
          Loading wallet…
        </div>
      ) : null}

      {wallet ? (
        <>
          {/* Driver header + actions */}
          <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-7 shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
                  <Wallet className="h-3.5 w-3.5" /> Driver Wallet
                </div>
                <h1 className="mt-4 text-3xl font-black tracking-tight text-white">{wallet.driver.name}</h1>
                <div className="mt-1 text-sm text-slate-400">
                  {wallet.driver.phone}
                  {wallet.driver.vehicleReg ? ` · ${wallet.driver.vehicleReg}` : ""}
                  <span className={`ml-2 rounded-full border px-2 py-0.5 text-[10px] font-bold capitalize ${
                    wallet.driver.status === "AVAILABLE" ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200" :
                    wallet.driver.status === "ON_ROUTE" ? "border-cyan-400/20 bg-cyan-500/10 text-cyan-200" :
                    "border-slate-400/20 bg-slate-500/10 text-slate-300"
                  }`}>
                    {wallet.driver.status.replace(/_/g, " ").toLowerCase()}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3">
                <button
                  disabled={balance <= 0}
                  onClick={() => { setShowSettle((v) => !v); setShowAdjust(false); }}
                  className="inline-flex items-center gap-2 rounded-2xl border border-blue-400/20 bg-blue-500/10 px-5 py-2.5 text-sm font-bold text-blue-200 hover:bg-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <CheckCircle className="h-4 w-4" />
                  {balance > 0 ? `Settle ${money(balance, cur)}` : "Nothing to settle"}
                </button>
                <button
                  onClick={() => { setShowAdjust((v) => !v); setShowSettle(false); }}
                  className="inline-flex items-center gap-2 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-5 py-2.5 text-sm font-bold text-amber-200 hover:bg-amber-500/20"
                >
                  <Banknote className="h-4 w-4" /> Adjust
                </button>
              </div>
            </div>

            {/* Settlement form */}
            {showSettle ? (
              <div className="mt-6 rounded-2xl border border-blue-400/20 bg-blue-500/5 p-5 space-y-4">
                <div className="text-base font-black text-blue-200">Record Cash Remittance</div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">
                      Amount (max {money(balance, cur)})
                    </label>
                    <input
                      type="number"
                      value={settleAmount}
                      onChange={(e) => setSettleAmount(e.target.value)}
                      placeholder={String(balance.toFixed(2))}
                      max={balance}
                      step="0.01"
                      className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#071224] px-4 py-2.5 text-sm text-white outline-none focus:border-blue-400"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">Notes (optional)</label>
                    <input
                      value={settleNotes}
                      onChange={(e) => setSettleNotes(e.target.value)}
                      placeholder="Cash remitted to company"
                      className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#071224] px-4 py-2.5 text-sm text-white outline-none focus:border-blue-400"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    disabled={busy === "settle"}
                    onClick={settle}
                    className="rounded-2xl bg-gradient-to-r from-blue-400 to-indigo-400 px-6 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-60"
                  >
                    {busy === "settle" ? "Recording…" : "Confirm Settlement"}
                  </button>
                  <button
                    onClick={() => { setShowSettle(false); setSettleAmount(""); setSettleNotes(""); }}
                    className="rounded-2xl border border-white/10 bg-white/5 px-6 py-2.5 text-sm font-bold text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {/* Adjustment form */}
            {showAdjust ? (
              <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-500/5 p-5 space-y-4">
                <div className="text-base font-black text-amber-200">Manual Adjustment</div>
                <p className="text-sm text-slate-400">Use a positive amount to add cash to the wallet, negative to deduct (e.g. -50 for an expense).</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">Amount (ZAR)</label>
                    <input
                      type="number"
                      value={adjustAmount}
                      onChange={(e) => setAdjustAmount(e.target.value)}
                      placeholder="-50"
                      step="0.01"
                      className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#071224] px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">Reason (required)</label>
                    <input
                      value={adjustNotes}
                      onChange={(e) => setAdjustNotes(e.target.value)}
                      placeholder="Fuel expense deduction"
                      className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#071224] px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    disabled={busy === "adjust"}
                    onClick={adjust}
                    className="rounded-2xl bg-gradient-to-r from-amber-400 to-orange-400 px-6 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-60"
                  >
                    {busy === "adjust" ? "Applying…" : "Apply Adjustment"}
                  </button>
                  <button
                    onClick={() => { setShowAdjust(false); setAdjustAmount(""); setAdjustNotes(""); }}
                    className="rounded-2xl border border-white/10 bg-white/5 px-6 py-2.5 text-sm font-bold text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard
              icon={<Banknote className="h-5 w-5" />} label="Outstanding Balance"
              value={money(balance, cur)} tone={balance > 0 ? "text-amber-400" : "text-white/40"}
              sub={balance > 0 ? "Cash held by driver" : "Fully settled"} />
            <StatCard icon={<PackageCheck className="h-5 w-5" />} label="Total Collected"
              value={money(wallet.totalCollected, cur)} />
            <StatCard icon={<TrendingDown className="h-5 w-5" />} label="Total Settled"
              value={money(wallet.totalSettled, cur)} />
            <StatCard icon={<CheckCircle className="h-5 w-5" />} label="Last Settlement"
              value={wallet.lastSettledAt
                ? new Date(wallet.lastSettledAt).toLocaleDateString("en-ZA")
                : "Never"} />
          </div>

          {/* Transaction ledger */}
          <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
            <div className="text-xl font-black text-white mb-5">Transaction Ledger</div>

            {wallet.transactions.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-8 text-center text-sm text-slate-400">
                No transactions yet. Transactions appear when the driver collects COD or a settlement is recorded.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-[11px] uppercase tracking-[0.16em] text-white/50">
                      <th className="px-3 py-3">Date</th>
                      <th className="px-3 py-3">Type</th>
                      <th className="px-3 py-3">Waybill</th>
                      <th className="px-3 py-3">Notes</th>
                      <th className="px-3 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wallet.transactions.map((tx) => {
                      const positive = tx.type === "COD_COLLECTED" || (tx.type === "ADJUSTMENT" && tx.amount > 0);
                      return (
                        <tr key={tx.id} className="border-b border-white/5">
                          <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-400">
                            {new Date(tx.createdAt).toLocaleString("en-ZA")}
                          </td>
                          <td className="px-3 py-3">
                            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${TX_STYLE[tx.type] ?? TX_STYLE.ADJUSTMENT}`}>
                              {TX_LABEL[tx.type] ?? tx.type}
                            </span>
                          </td>
                          <td className="px-3 py-3 font-mono text-sm text-slate-300">
                            {tx.waybill?.trackingNumber ?? "—"}
                          </td>
                          <td className="px-3 py-3 text-slate-400 text-xs max-w-xs truncate">
                            {tx.notes ?? "—"}
                          </td>
                          <td className={`px-3 py-3 text-right font-bold tabular-nums ${positive ? "text-emerald-300" : "text-rose-300"}`}>
                            {positive ? "+" : "−"}{money(Math.abs(tx.amount), tx.currency)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
