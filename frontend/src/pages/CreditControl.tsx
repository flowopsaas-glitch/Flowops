import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  CreditCard,
  Loader2,
  MailOpen,
  RefreshCw,
  Search,
  TrendingUp,
  Wallet,
  XCircle,
} from "lucide-react";
import { api } from "../api/client";

// ── Types ──────────────────────────────────────────────────────────────────

type Invoice = {
  id: string;
  invoiceNumber: string;
  status: string;
  clientName: string;
  clientEmail?: string | null;
  total: number;
  dueDate?: string | null;
  sentAt?: string | null;
  paidAt?: string | null;
  createdAt: string;
};

type Metrics = {
  outstanding: number;
  collected: number;
  total: number;
  collectionRate: number;
};

function money(v?: number | null) {
  return `ZAR ${(v ?? 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isOverdue(inv: Invoice) {
  return inv.status === "SENT" && inv.dueDate && new Date(inv.dueDate) < new Date();
}

function daysPastDue(inv: Invoice): number {
  if (!inv.dueDate) return 0;
  const diff = new Date().getTime() - new Date(inv.dueDate).getTime();
  return Math.floor(diff / 86400000);
}

// ── Record Payment modal ───────────────────────────────────────────────────

function PaymentModal({
  invoice,
  onClose,
  onPaid,
}: {
  invoice: Invoice;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    setSaving(true);
    try {
      await api.post(`/invoices/${invoice.id}/mark-paid`, {});
      onPaid();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-[28px] border border-white/10 bg-[#0b1628] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div className="text-base font-black text-white">Record Payment</div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50">
            <XCircle className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <div className="text-xs text-slate-400">Invoice</div>
            <div className="font-bold text-white">{invoice.invoiceNumber}</div>
            <div className="text-xs text-slate-400 mt-0.5">{invoice.clientName}</div>
          </div>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/5 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-slate-300">Amount</span>
            <span className="text-xl font-black text-emerald-300">{money(invoice.total)}</span>
          </div>
          <p className="text-xs text-slate-400">
            This will mark the invoice as <strong className="text-white">PAID</strong> and record the payment timestamp.
          </p>
        </div>
        <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-4">
          <button onClick={onClose} className="rounded-2xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/10">Cancel</button>
          <button disabled={saving} onClick={confirm}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-400 px-5 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {saving ? "Confirming…" : "Confirm Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function CreditControl() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [payTarget, setPayTarget] = useState<Invoice | null>(null);
  const [filter, setFilter] = useState<"overdue" | "sent" | "all">("overdue");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, metRes] = await Promise.allSettled([
        api.get("/invoices"),
        api.get("/invoices/metrics"),
      ]);
      if (invRes.status === "fulfilled") {
        const d: any = invRes.value;
        setInvoices(Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : []));
      }
      if (metRes.status === "fulfilled") {
        const m: any = metRes.value;
        setMetrics(m?.data ?? m);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const arrears = useMemo(() =>
    invoices.filter((inv) => inv.status !== "PAID" && inv.status !== "CANCELLED"),
    [invoices]
  );

  const visible = useMemo(() => {
    let list = arrears;
    if (filter === "overdue") list = list.filter((inv) => isOverdue(inv));
    if (filter === "sent")    list = list.filter((inv) => inv.status === "SENT" && !isOverdue(inv));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((inv) => inv.invoiceNumber.toLowerCase().includes(q) || inv.clientName.toLowerCase().includes(q));
    }
    return list.sort((a, b) => daysPastDue(b) - daysPastDue(a));
  }, [arrears, filter, search]);

  const overdueAmount = useMemo(() =>
    arrears.filter((i) => isOverdue(i)).reduce((s, i) => s + i.total, 0),
    [arrears]
  );

  return (
    <div className="space-y-6">
      {payTarget && (
        <PaymentModal invoice={payTarget} onClose={() => setPayTarget(null)} onPaid={load} />
      )}

      {/* Header */}
      <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-7 shadow-xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-300">
              <CreditCard className="h-3.5 w-3.5" /> Credit Control
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white">Accounts Receivable</h1>
            <p className="mt-1 text-sm text-slate-400">Chase overdue invoices, record settlements, and monitor collection performance.</p>
          </div>
          <button onClick={load} className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-white hover:bg-white/10">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { icon: BellRing,   label: "Outstanding",      val: money(metrics?.outstanding), tone: "text-amber-300",   sub: money(overdueAmount) + " overdue" },
          { icon: TrendingUp, label: "Cash Collected",    val: money(metrics?.collected),   tone: "text-emerald-300", sub: `${metrics?.total ?? 0} invoices total` },
          { icon: Wallet,     label: "Collection Rate",   val: `${(metrics?.collectionRate ?? 0).toFixed(1)}%`, tone: "text-white", sub: "vs total billed" },
        ].map(({ icon: Icon, label, val, tone, sub }) => (
          <div key={label} className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">{label}</div>
              <Icon className="h-5 w-5 text-white/30" />
            </div>
            <div className={`mt-2 text-3xl font-black ${tone}`}>{val}</div>
            <div className="mt-1 text-xs text-slate-400">{sub}</div>
          </div>
        ))}
      </div>

      {/* Collection rate bar */}
      {metrics && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 flex items-center gap-4">
          <span className="text-xs font-bold text-white/50 whitespace-nowrap">Collection rate</span>
          <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all"
              style={{ width: `${Math.min(metrics.collectionRate, 100)}%` }} />
          </div>
          <span className="text-sm font-black text-white">{metrics.collectionRate.toFixed(1)}%</span>
        </div>
      )}

      {/* Filter + search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {(["overdue", "sent", "all"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-2xl px-4 py-2 text-sm font-bold transition-colors ${filter === f ? "bg-white/15 text-white border border-white/20" : "border border-white/10 bg-white/5 text-white/50 hover:text-white"}`}>
              {f === "overdue" ? `Overdue (${arrears.filter(isOverdue).length})` : f === "sent" ? `Sent (${arrears.filter(i => i.status === "SENT" && !isOverdue(i)).length})` : `All Arrears (${arrears.length})`}
            </button>
          ))}
        </div>
        <div className="ml-auto relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice or client…"
            className="w-56 rounded-2xl border border-white/10 bg-[#071224] pl-9 pr-4 py-2 text-sm text-white outline-none focus:border-blue-400" />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-[28px] border border-white/10 bg-white/[0.05] shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[11px] uppercase tracking-[0.14em] text-white/40">
                <th className="px-5 py-3">Invoice</th>
                <th className="px-5 py-3">Client</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Due</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/5">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-5 py-4"><div className="h-3 animate-pulse rounded-full bg-white/5" /></td>
                    ))}
                  </tr>
                ))
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400/40 mb-3" />
                    <div className="text-white/40 font-bold">
                      {filter === "overdue" ? "No overdue invoices — all accounts are current." : "No matching invoices."}
                    </div>
                  </td>
                </tr>
              ) : visible.map((inv) => {
                const overdue = isOverdue(inv);
                const days = overdue ? daysPastDue(inv) : 0;
                return (
                  <tr key={inv.id} className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors ${overdue ? "bg-rose-500/[0.02]" : ""}`}>
                    <td className="px-5 py-4 font-bold text-white">{inv.invoiceNumber}</td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-white">{inv.clientName}</div>
                      {inv.clientEmail && <div className="text-[11px] text-slate-400">{inv.clientEmail}</div>}
                    </td>
                    <td className="px-5 py-4">
                      {overdue ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/20 bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-bold text-rose-200">
                          <AlertTriangle className="h-3 w-3" /> Overdue {days}d
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/20 bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-bold text-blue-200">
                          <MailOpen className="h-3 w-3" /> Sent
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 font-black text-white">{money(inv.total)}</td>
                    <td className={`px-5 py-4 text-sm ${overdue ? "text-rose-400 font-bold" : "text-slate-400"}`}>
                      {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-ZA") : "—"}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button onClick={() => setPayTarget(inv)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-bold text-emerald-200 hover:bg-emerald-500/20">
                        <CheckCircle2 className="h-3 w-3" /> Mark Paid
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
