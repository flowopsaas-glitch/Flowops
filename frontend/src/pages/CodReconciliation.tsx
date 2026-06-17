import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Banknote,
  CheckCircle,
  PackageCheck,
  RefreshCw,
  Search,
  TrendingDown,
  Users,
  Wallet,
} from "lucide-react";
import { api } from "../api/client";

// ── Types ─────────────────────────────────────────────────────────────────

type Summary = {
  currency: string;
  outstanding: { amount: number; count: number };
  collected: { amount: number; count: number };
  settled: { amount: number; count: number };
  driversHoldingCash: number;
  last30Days: { collected: number; count: number };
};

type OutstandingWaybill = {
  id: string;
  trackingNumber: string;
  status: string;
  codAmount: number | null;
  recipientName: string | null;
  recipientCity: string | null;
  createdAt: string;
  shipments: Array<{
    driver?: { id: string; name: string; phone: string } | null;
  }>;
};

type DriverWalletRow = {
  id: string;
  balance: number;
  totalCollected: number;
  totalSettled: number;
  lastSettledAt: string | null;
  driver: { id: string; name: string; phone: string; vehicleReg?: string | null; status: string };
  _count: { transactions: number };
};

// ── Helpers ────────────────────────────────────────────────────────────────

function money(v: number | null | undefined, cur = "ZAR") {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${cur} ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function unwrap(res: any) {
  return res?.data ?? res;
}

// ── KPI Card ────────────────────────────────────────────────────────────────

function Kpi(props: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5 shadow-xl">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/50">{props.label}</div>
        <div className={props.tone ?? "text-white/40"}>{props.icon}</div>
      </div>
      <div className="mt-3 text-3xl font-black text-white">{props.value}</div>
      {props.sub ? <div className="mt-1 text-xs text-slate-400">{props.sub}</div> : null}
    </div>
  );
}

// ── Tab button ─────────────────────────────────────────────────────────────

function Tab(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      className={`rounded-2xl px-5 py-2.5 text-sm font-bold transition-colors ${
        props.active
          ? "bg-gradient-to-r from-blue-400 to-indigo-400 text-slate-950 shadow"
          : "border border-white/10 bg-white/5 text-white hover:bg-white/10"
      }`}
    >
      {props.children}
    </button>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: "border-slate-400/20 bg-slate-500/10 text-slate-300",
    COLLECTED: "border-blue-400/20 bg-blue-500/10 text-blue-200",
    IN_TRANSIT: "border-cyan-400/20 bg-cyan-500/10 text-cyan-200",
    OUT_FOR_DELIVERY: "border-emerald-400/20 bg-emerald-500/10 text-emerald-200",
    DELIVERED: "border-emerald-400/20 bg-emerald-500/10 text-emerald-200",
    FAILED_DELIVERY: "border-rose-400/20 bg-rose-500/10 text-rose-200",
  };
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${map[status] ?? map.PENDING}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function CodReconciliation() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"outstanding" | "wallets">("outstanding");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [outstanding, setOutstanding] = useState<OutstandingWaybill[]>([]);
  const [wallets, setWallets] = useState<DriverWalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");

  // Collect-now form (inline)
  const [collectTarget, setCollectTarget] = useState<OutstandingWaybill | null>(null);
  const [collectAmount, setCollectAmount] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [sumRes, outRes, walRes] = await Promise.allSettled([
        api.get("/cod/summary"),
        api.get("/cod/outstanding"),
        api.get("/cod/wallets"),
      ]);

      if (sumRes.status === "fulfilled") setSummary(unwrap(sumRes.value) as Summary);
      if (outRes.status === "fulfilled") {
        const d = unwrap(outRes.value);
        setOutstanding(d?.waybills ?? []);
      }
      if (walRes.status === "fulfilled") {
        const d = unwrap(walRes.value);
        setWallets(Array.isArray(d) ? d : []);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load COD data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function markCollected(wb: OutstandingWaybill) {
    const amount = parseFloat(collectAmount) || wb.codAmount || 0;
    if (!amount) { setError("Enter a collection amount."); return; }
    const driverId = wb.shipments?.[0]?.driver?.id;
    if (!driverId) { setError("No driver assigned to this waybill. Assign a driver first."); return; }
    setBusy(`collect-${wb.id}`);
    setError(""); setSuccess("");
    try {
      await api.post("/cod/collect", { waybillId: wb.id, driverId, amount });
      setSuccess(`COD of ${money(amount)} recorded for waybill ${wb.trackingNumber}.`);
      setCollectTarget(null);
      setCollectAmount("");
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to record collection.");
    } finally {
      setBusy("");
    }
  }

  const filteredOutstanding = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return outstanding;
    return outstanding.filter((w) =>
      [w.trackingNumber, w.recipientName, w.recipientCity, w.shipments?.[0]?.driver?.name]
        .filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [outstanding, search]);

  const filteredWallets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return wallets;
    return wallets.filter((w) =>
      [w.driver.name, w.driver.phone, w.driver.vehicleReg].filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [wallets, search]);

  const cur = summary?.currency || "ZAR";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-7 shadow-xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">
              <Wallet className="h-3.5 w-3.5" /> COD Reconciliation
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-white">Cash on Delivery</h1>
            <p className="mt-2 text-slate-300">
              Track outstanding COD waybills, record driver collections, and reconcile driver cash remittances.
            </p>
          </div>
          <button onClick={load} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
        {error ? <div className="mt-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
        {success ? <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{success}</div> : null}
      </div>

      {/* KPI strip */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={<AlertTriangle className="h-5 w-5" />} label="Outstanding COD" tone="text-amber-400"
          value={money(summary?.outstanding.amount, cur)}
          sub={`${summary?.outstanding.count ?? 0} waybills pending collection`} />
        <Kpi icon={<Users className="h-5 w-5" />} label="Drivers Holding Cash" tone="text-rose-400"
          value={String(summary?.driversHoldingCash ?? 0)}
          sub="Wallets with positive balance" />
        <Kpi icon={<PackageCheck className="h-5 w-5" />} label="Collected (30d)"
          value={money(summary?.last30Days.collected, cur)}
          sub={`${summary?.last30Days.count ?? 0} collections`} />
        <Kpi icon={<TrendingDown className="h-5 w-5" />} label="Settled (all-time)"
          value={money(summary?.settled.amount, cur)}
          sub={`${summary?.settled.count ?? 0} settlements`} />
      </div>

      {/* Tabs + search */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-3">
          <Tab active={tab === "outstanding"} onClick={() => { setTab("outstanding"); setSearch(""); }}>
            Outstanding ({outstanding.length})
          </Tab>
          <Tab active={tab === "wallets"} onClick={() => { setTab("wallets"); setSearch(""); }}>
            Driver Wallets ({wallets.length})
          </Tab>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === "outstanding" ? "Search waybill, recipient, driver…" : "Search driver, phone…"}
            className="w-64 rounded-2xl border border-white/10 bg-[#071224] pl-9 pr-4 py-2.5 text-sm text-white outline-none focus:border-blue-400"
          />
        </div>
      </div>

      {/* ── Tab: Outstanding waybills ── */}
      {tab === "outstanding" ? (
        <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-[0.16em] text-white/50">
                  <th className="px-3 py-3">Waybill</th>
                  <th className="px-3 py-3">Recipient</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">COD Amount</th>
                  <th className="px-3 py-3">Assigned Driver</th>
                  <th className="px-3 py-3">Created</th>
                  <th className="px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-400">Loading…</td></tr>
                ) : filteredOutstanding.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-400">
                    {outstanding.length === 0 ? "No outstanding COD waybills. 🎉" : "No results match your search."}
                  </td></tr>
                ) : filteredOutstanding.map((wb) => {
                  const driver = wb.shipments?.[0]?.driver;
                  const isCollecting = collectTarget?.id === wb.id;
                  return (
                    <tr key={wb.id} className="border-b border-white/5 align-top">
                      <td className="px-3 py-3">
                        <div className="font-mono font-bold text-white">{wb.trackingNumber}</div>
                      </td>
                      <td className="px-3 py-3 text-slate-300">
                        {wb.recipientName || "—"}
                        {wb.recipientCity ? <div className="text-xs text-slate-500">{wb.recipientCity}</div> : null}
                      </td>
                      <td className="px-3 py-3"><StatusBadge status={wb.status} /></td>
                      <td className="px-3 py-3 font-bold text-amber-200">{money(wb.codAmount, cur)}</td>
                      <td className="px-3 py-3 text-slate-300">
                        {driver ? (
                          <div>
                            <div className="font-semibold text-white">{driver.name}</div>
                            <div className="text-xs text-slate-400">{driver.phone}</div>
                          </div>
                        ) : (
                          <span className="text-white/30">Unassigned</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-400 whitespace-nowrap">
                        {new Date(wb.createdAt).toLocaleDateString("en-ZA")}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {isCollecting ? (
                          <div className="flex items-center gap-2 justify-end flex-wrap">
                            <input
                              type="number"
                              value={collectAmount}
                              onChange={(e) => setCollectAmount(e.target.value)}
                              placeholder={String(wb.codAmount ?? "")}
                              className="w-28 rounded-xl border border-white/10 bg-[#071224] px-3 py-1.5 text-sm text-white outline-none focus:border-emerald-400"
                            />
                            <button
                              disabled={busy === `collect-${wb.id}`}
                              onClick={() => markCollected(wb)}
                              className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-60"
                            >
                              {busy === `collect-${wb.id}` ? "Saving…" : "Confirm"}
                            </button>
                            <button
                              onClick={() => { setCollectTarget(null); setCollectAmount(""); }}
                              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            disabled={!driver}
                            onClick={() => { setCollectTarget(wb); setCollectAmount(String(wb.codAmount ?? "")); }}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <CheckCircle className="h-3.5 w-3.5" /> Collect
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* ── Tab: Driver Wallets ── */}
      {tab === "wallets" ? (
        <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-[0.16em] text-white/50">
                  <th className="px-3 py-3">Driver</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Outstanding</th>
                  <th className="px-3 py-3">Total Collected</th>
                  <th className="px-3 py-3">Total Settled</th>
                  <th className="px-3 py-3">Last Settled</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-400">Loading…</td></tr>
                ) : filteredWallets.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-400">
                    {wallets.length === 0
                      ? "No driver wallets yet. Wallets are created automatically when a driver collects COD."
                      : "No results match your search."}
                  </td></tr>
                ) : filteredWallets.map((w) => (
                  <tr key={w.id}
                    className="cursor-pointer border-b border-white/5 hover:bg-white/[0.03]"
                    onClick={() => navigate(`/cod/wallets/${w.driver.id}`)}>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-white">{w.driver.name}</div>
                      <div className="text-xs text-slate-400">{w.driver.phone}{w.driver.vehicleReg ? ` · ${w.driver.vehicleReg}` : ""}</div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold capitalize ${
                        w.driver.status === "AVAILABLE" ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200" :
                        w.driver.status === "ON_ROUTE" ? "border-cyan-400/20 bg-cyan-500/10 text-cyan-200" :
                        "border-slate-400/20 bg-slate-500/10 text-slate-300"
                      }`}>
                        {w.driver.status.replace(/_/g, " ").toLowerCase()}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`font-bold ${w.balance > 0 ? "text-amber-300" : "text-white/40"}`}>
                        {money(w.balance, cur)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-300">{money(w.totalCollected, cur)}</td>
                    <td className="px-3 py-3 text-slate-300">{money(w.totalSettled, cur)}</td>
                    <td className="px-3 py-3 text-xs text-slate-400">
                      {w.lastSettledAt ? new Date(w.lastSettledAt).toLocaleDateString("en-ZA") : "Never"}
                    </td>
                    <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        disabled={w.balance <= 0}
                        onClick={() => navigate(`/cod/wallets/${w.driver.id}`)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-blue-400/20 bg-blue-500/10 px-3 py-1.5 text-xs font-bold text-blue-200 hover:bg-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Banknote className="h-3.5 w-3.5" /> Settle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
