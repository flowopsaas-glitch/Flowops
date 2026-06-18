import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, CheckCircle2, CreditCard, Loader2, RefreshCw,
  Truck, Wallet, ChevronRight, Clock, CircleDollarSign,
} from "lucide-react";
import { api } from "../../api/client";

type Waybill = {
  id: string; trackingNumber: string; status: string;
  codAmount: number; recipientName: string; recipientAddress: string;
  createdAt: string;
  shipments?: Array<{ driver?: { id: string; name: string } | null }>;
};

type WalletRow = {
  id: string; driverId: string; balance: number;
  totalCollected: number; totalSettled: number; lastSettledAt: string | null;
  driver: { id: string; name: string; phone?: string | null; vehicleReg?: string | null; status: string };
  _count: { transactions: number };
};

type Summary = {
  outstanding: number; outstandingCount: number;
  collected: number; settled: number; driversHolding: number;
};

function money(v?: number | null) {
  return `ZAR ${(v ?? 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function unwrap(raw: any): any {
  const d = raw?.data ?? raw;
  return d;
}
function unwrapList(raw: any): any[] {
  const d = raw?.data ?? raw;
  return Array.isArray(d) ? d : [];
}

// ── Collect modal ─────────────────────────────────────────────────────────

function CollectModal({ waybill, onClose, onDone }: {
  waybill: Waybill; onClose: () => void; onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const confirm = async () => {
    setSaving(true);
    try {
      await api.post(`/cod/collect/${waybill.id}`, {});
      onDone(); onClose();
    } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-[28px] border border-white/10 bg-[#0b1628] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div className="text-base font-black text-white">Record COD Collection</div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 text-xl">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <div className="text-xs text-slate-400">Waybill</div>
            <div className="font-bold text-white">{waybill.trackingNumber}</div>
            <div className="text-xs text-slate-400 mt-0.5">{waybill.recipientName}</div>
          </div>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/5 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-slate-300">COD Amount</span>
            <span className="text-xl font-black text-emerald-300">{money(waybill.codAmount)}</span>
          </div>
          <p className="text-xs text-slate-400">
            Marks the waybill as COD collected and credits the assigned driver's wallet.
          </p>
        </div>
        <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-4">
          <button onClick={onClose} className="rounded-2xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/10">Cancel</button>
          <button disabled={saving} onClick={confirm}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-400 px-5 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {saving ? "Recording…" : "Confirm Collection"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function CODReconciliation() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"outstanding" | "wallets">("outstanding");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [outstanding, setOutstanding] = useState<Waybill[]>([]);
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [collectTarget, setCollectTarget] = useState<Waybill | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, outRes, walRes] = await Promise.allSettled([
        api.get("/cod/summary"),
        api.get("/cod/outstanding"),
        api.get("/cod/wallets"),
      ]);
      if (sumRes.status === "fulfilled")  setSummary(unwrap(sumRes.value));
      if (outRes.status === "fulfilled")  setOutstanding(unwrapList(outRes.value));
      if (walRes.status === "fulfilled")  setWallets(unwrapList(walRes.value));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const overdueCount = useMemo(
    () => outstanding.filter((w) => {
      const d = new Date(w.createdAt);
      return (Date.now() - d.getTime()) > 86400000 * 2; // >2 days
    }).length,
    [outstanding],
  );

  return (
    <div className="space-y-6">
      {collectTarget && (
        <CollectModal
          waybill={collectTarget}
          onClose={() => setCollectTarget(null)}
          onDone={load}
        />
      )}

      {/* Header */}
      <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-7 shadow-xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">
              <CircleDollarSign className="h-3.5 w-3.5" /> COD Reconciliation
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white">Cash On Delivery</h1>
            <p className="mt-1 text-sm text-slate-400">Track COD collections, driver cash balances, and settlements.</p>
          </div>
          <button onClick={load} className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-white hover:bg-white/10">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* KPI cards */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { icon: AlertTriangle, label: "Outstanding COD",     val: money(summary.outstanding), tone: "text-amber-300",   sub: `${summary.outstandingCount} waybills` },
            { icon: Truck,         label: "Drivers Holding Cash",val: summary.driversHolding,     tone: "text-rose-300",   sub: "positive wallet balance" },
            { icon: CreditCard,    label: "Collected (All Time)",val: money(summary.collected),   tone: "text-sky-300",    sub: "cash received from recipients" },
            { icon: CheckCircle2,  label: "Settled (All Time)",  val: money(summary.settled),     tone: "text-emerald-300",sub: "remitted to company" },
          ].map(({ icon: Icon, label, val, tone, sub }) => (
            <div key={label} className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">{label}</div>
                <Icon className="h-4 w-4 text-white/20" />
              </div>
              <div className={`mt-2 text-2xl font-black ${tone}`}>{String(val)}</div>
              <div className="mt-1 text-xs text-slate-400">{sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 rounded-2xl border border-white/10 bg-white/5 p-1.5 w-fit">
        {(["outstanding", "wallets"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-xl px-5 py-2 text-sm font-bold transition-colors capitalize ${tab === t ? "bg-white/15 text-white border border-white/20" : "text-white/50 hover:text-white"}`}>
            {t === "outstanding" ? `Outstanding (${outstanding.length})` : `Driver Wallets (${wallets.length})`}
          </button>
        ))}
      </div>

      {/* Outstanding waybills */}
      {tab === "outstanding" && (
        <div className="rounded-[28px] border border-white/10 bg-white/[0.05] shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-[0.14em] text-white/40">
                  <th className="px-5 py-3">Waybill</th>
                  <th className="px-5 py-3">Recipient</th>
                  <th className="px-5 py-3">Driver</th>
                  <th className="px-5 py-3">COD Amount</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Age</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-white/5">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-5 py-4"><div className="h-3 animate-pulse rounded-full bg-white/5" /></td>
                      ))}
                    </tr>
                  ))
                ) : outstanding.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center">
                      <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400/30 mb-3" />
                      <div className="text-white/40 font-bold">All COD collected — nothing outstanding.</div>
                    </td>
                  </tr>
                ) : outstanding.map((w) => {
                  const ageMs = Date.now() - new Date(w.createdAt).getTime();
                  const ageDays = Math.floor(ageMs / 86400000);
                  const driver = w.shipments?.[0]?.driver;
                  return (
                    <tr key={w.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="px-5 py-4 font-bold text-white font-mono">{w.trackingNumber}</td>
                      <td className="px-5 py-4 text-slate-300 text-xs">{w.recipientName}</td>
                      <td className="px-5 py-4 text-slate-300">{driver?.name ?? <span className="text-white/30">Unassigned</span>}</td>
                      <td className="px-5 py-4 font-black text-emerald-300">{money(w.codAmount)}</td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-200">
                          {w.status}
                        </span>
                      </td>
                      <td className={`px-5 py-4 text-xs font-bold ${ageDays > 2 ? "text-rose-400" : "text-slate-400"}`}>
                        <Clock className="inline h-3 w-3 mr-1" />
                        {ageDays}d
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button onClick={() => setCollectTarget(w)}
                          className="inline-flex items-center gap-1 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-bold text-emerald-200 hover:bg-emerald-500/20">
                          <CheckCircle2 className="h-3 w-3" /> Collect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Driver wallets */}
      {tab === "wallets" && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-[24px] border border-white/5 bg-white/[0.03]" />
            ))
          ) : wallets.length === 0 ? (
            <div className="col-span-3 rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] py-16 text-center">
              <Wallet className="mx-auto h-10 w-10 text-white/10 mb-3" />
              <div className="text-white/40 font-bold">No driver wallets yet.</div>
              <p className="text-slate-500 text-sm mt-1">Wallets are created when a driver's first COD collection is recorded.</p>
            </div>
          ) : wallets.map((w) => (
            <button key={w.id} onClick={() => navigate(`/cod/wallets/${w.driverId}`)}
              className="group rounded-[24px] border border-white/10 bg-white/[0.05] p-5 text-left hover:bg-white/[0.08] hover:border-white/20 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-black text-white text-base">{w.driver.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{w.driver.vehicleReg ?? w.driver.status}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-white/50 transition-colors mt-1" />
              </div>
              <div className={`text-2xl font-black mb-1 ${w.balance > 0 ? "text-amber-300" : "text-emerald-300"}`}>
                {money(w.balance)}
              </div>
              <div className="text-xs text-slate-400">
                Current balance · {w._count.transactions} transactions
              </div>
              {w.balance > 0 && (
                <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-200">
                  <AlertTriangle className="h-3 w-3" /> Holding cash
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
