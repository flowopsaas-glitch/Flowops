import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calculator,
  CheckCircle2,
  FileText,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { api } from "../api/client";

// ── Types matching the real Invoice schema ──────────────────────────────────
type Invoice = {
  id: string;
  invoiceNumber: string;
  status: "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED";
  clientName: string;
  clientEmail?: string | null;
  subtotal: number;
  tax: number;
  total: number;
  dueDate?: string | null;
  paidAt?: string | null;
  sentAt?: string | null;
  createdAt: string;
  items?: any[];
};

type Metrics = {
  outstanding: number;
  collected: number;
  total: number;
  collectionRate: number;
};

// ── Status config ──────────────────────────────────────────────────────────
const STATUS: Record<string, { cls: string; label: string }> = {
  DRAFT:     { cls: "border-slate-400/20 bg-slate-500/10 text-slate-300", label: "Draft" },
  SENT:      { cls: "border-blue-400/20 bg-blue-500/10 text-blue-200",    label: "Sent" },
  PAID:      { cls: "border-emerald-400/20 bg-emerald-500/10 text-emerald-200", label: "Paid" },
  OVERDUE:   { cls: "border-rose-400/20 bg-rose-500/10 text-rose-200",    label: "Overdue" },
  CANCELLED: { cls: "border-white/10 bg-white/5 text-white/40",           label: "Cancelled" },
};

function money(v?: number | null) {
  return `ZAR ${(v ?? 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Generate Invoice Modal ─────────────────────────────────────────────────
function GenerateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [waybills, setWaybills] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clientName, setClientName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const res: any = await api.get("/waybills");
      const data = Array.isArray(res) ? res : (res?.data ?? []);
      setWaybills(data.filter((w: any) => w.status === "DELIVERED" && w.totalAmount));
    })();
  }, []);

  const toggle = (id: string) =>
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) { n.delete(id); } else { n.add(id); }
      return n;
    });

  const selectedWbs = waybills.filter((w) => selected.has(w.id));
  const subtotal = selectedWbs.reduce((s, w) => s + (w.totalAmount ?? 0), 0);
  const tax = subtotal * 0.15;
  const total = subtotal + tax;

  const save = async () => {
    if (!clientName.trim()) { setError("Enter a client name."); return; }
    if (selected.size === 0) { setError("Select at least one waybill."); return; }
    setSaving(true); setError("");
    try {
      await api.post("/invoices", {
        clientName, subtotal, tax, total,
        items: selectedWbs.map((w) => ({
          description: `Delivery ${w.trackingNumber} to ${w.recipientName}`,
          quantity: 1, unitPrice: w.totalAmount, total: w.totalAmount,
        })),
      });
      onSaved(); onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to generate invoice.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-[28px] border border-white/10 bg-[#0b1628] shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5 shrink-0">
          <div className="text-lg font-black text-white">Generate Batch Invoice</div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 text-xl">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">Client Name *</label>
            <input value={clientName} onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. Acme Logistics" className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#071224] px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50 block mb-2">
              Delivered Waybills ({selected.size} selected)
            </label>
            <div className="rounded-xl border border-white/10 bg-black/20 max-h-48 overflow-y-auto">
              {waybills.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-sm">No delivered waybills available for billing.</div>
              ) : waybills.map((w) => (
                <button key={w.id} onClick={() => toggle(w.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 border-b border-white/5 last:border-0 text-left transition-colors ${selected.has(w.id) ? "bg-blue-500/10" : "hover:bg-white/5"}`}>
                  <div>
                    <div className="font-bold text-sm text-white">{w.trackingNumber}</div>
                    <div className="text-[11px] text-slate-400">{w.recipientName}</div>
                  </div>
                  <div className="text-sm font-bold text-emerald-300">{money(w.totalAmount)}</div>
                </button>
              ))}
            </div>
          </div>
          {selected.size > 0 && (
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 space-y-1 text-sm">
              <div className="flex justify-between text-slate-400"><span>Subtotal</span><span>{money(subtotal)}</span></div>
              <div className="flex justify-between text-slate-400"><span>VAT 15%</span><span>{money(tax)}</span></div>
              <div className="flex justify-between font-black text-white"><span>Total</span><span>{money(total)}</span></div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-4 shrink-0">
          <button onClick={onClose} className="rounded-2xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/10">Cancel</button>
          <button disabled={saving} onClick={save}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-5 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {saving ? "Generating…" : `Generate Invoice (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function BillingBatches() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, metRes] = await Promise.allSettled([
        api.get("/invoices"),
        api.get("/invoices/metrics"),
      ]);
      if (invRes.status === "fulfilled") {
        const d: any = invRes.value;
        setInvoices(Array.isArray(d) ? d : (d?.data ?? []));
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

  const markSent = async (id: string) => {
    setBusy(`sent-${id}`);
    try { await api.patch(`/invoices/${id}`, { status: "SENT", sentAt: new Date().toISOString() }); await load(); }
    finally { setBusy(null); }
  };

  const markPaid = async (id: string) => {
    setBusy(`paid-${id}`);
    try { await api.post(`/invoices/${id}/mark-paid`, {}); await load(); }
    finally { setBusy(null); }
  };

  const grouped = useMemo(() => {
    const groups: Record<string, Invoice[]> = { DRAFT: [], SENT: [], OVERDUE: [], PAID: [] };
    invoices.forEach((inv) => {
      const s = inv.status === "SENT" && inv.dueDate && new Date(inv.dueDate) < new Date() ? "OVERDUE" : inv.status;
      if (groups[s]) groups[s].push(inv);
    });
    return groups;
  }, [invoices]);

  const totalDraft = grouped.DRAFT.reduce((s, i) => s + i.total, 0);

  return (
    <div className="space-y-6">
      {showGenerate && <GenerateModal onClose={() => setShowGenerate(false)} onSaved={load} />}

      {/* Header */}
      <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-7 shadow-xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-300">
              <Layers className="h-3.5 w-3.5" /> Billing Batches
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white">Invoice Management</h1>
            <p className="mt-1 text-sm text-slate-400">
              Batch delivered waybills into invoices, send to clients, and track payments.
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={load} className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-white hover:bg-white/10">
              <RefreshCw className="h-4 w-4" />
            </button>
            <button onClick={() => setShowGenerate(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-5 py-2.5 text-sm font-bold text-slate-950">
              <Plus className="h-4 w-4" /> Generate Batch
            </button>
          </div>
        </div>
      </div>

      {/* Summary metrics */}
      {metrics && (
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: "Draft",      val: totalDraft,              count: grouped.DRAFT.length,    tone: "text-slate-300", icon: FileText },
            { label: "Outstanding", val: metrics.outstanding,    count: grouped.SENT.length + grouped.OVERDUE.length, tone: "text-amber-300", icon: Wallet },
            { label: "Overdue",    val: grouped.OVERDUE.reduce((s,i)=>s+i.total,0), count: grouped.OVERDUE.length, tone: "text-rose-300", icon: Calculator },
            { label: "Collected",  val: metrics.collected,       count: grouped.PAID.length,     tone: "text-emerald-300", icon: TrendingUp },
          ].map(({ label, val, count, tone, icon: Icon }) => (
            <div key={label} className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">{label}</div>
                <Icon className="h-5 w-5 text-white/30" />
              </div>
              <div className={`mt-2 text-2xl font-black ${tone}`}>{money(val)}</div>
              <div className="mt-1 text-xs text-slate-400">{count} invoice{count !== 1 ? "s" : ""}</div>
            </div>
          ))}
        </div>
      )}

      {/* Invoice groups */}
      {loading ? (
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-[24px] border border-white/5 bg-white/[0.03]" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] py-20 text-center">
          <Layers className="mx-auto h-10 w-10 text-white/10 mb-3" />
          <div className="text-white/40 font-bold">No invoices yet.</div>
          <p className="text-slate-500 text-sm mt-1">Generate a batch from delivered waybills to get started.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {(["DRAFT","SENT","OVERDUE","PAID"] as const).map((status) => {
            const group = grouped[status];
            if (!group?.length) return null;
            const { cls, label } = STATUS[status];
            return (
              <div key={status}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${cls}`}>{label}</span>
                  <span className="text-sm font-bold text-white/60">{group.length} invoice{group.length > 1 ? "s" : ""} · {money(group.reduce((s,i)=>s+i.total,0))}</span>
                </div>
                <div className="rounded-[28px] border border-white/10 bg-white/[0.05] overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-[11px] uppercase tracking-[0.14em] text-white/40">
                        <th className="px-5 py-3">Invoice</th>
                        <th className="px-5 py-3">Client</th>
                        <th className="px-5 py-3">Items</th>
                        <th className="px-5 py-3">Total</th>
                        <th className="px-5 py-3">Due</th>
                        <th className="px-5 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.map((inv) => (
                        <tr key={inv.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                          <td className="px-5 py-3 font-bold text-white">{inv.invoiceNumber}</td>
                          <td className="px-5 py-3 text-slate-300">{inv.clientName}</td>
                          <td className="px-5 py-3 text-slate-400">{inv.items?.length ?? "—"}</td>
                          <td className="px-5 py-3 font-black text-white">{money(inv.total)}</td>
                          <td className={`px-5 py-3 text-xs ${status === "OVERDUE" ? "text-rose-400 font-bold" : "text-slate-400"}`}>
                            {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-ZA") : "—"}
                          </td>
                          <td className="px-5 py-3 text-right">
                            {status === "DRAFT" && (
                              <button disabled={busy === `sent-${inv.id}`} onClick={() => markSent(inv.id)}
                                className="inline-flex items-center gap-1 rounded-xl border border-blue-400/20 bg-blue-500/10 px-3 py-1.5 text-[11px] font-bold text-blue-200 hover:bg-blue-500/20 disabled:opacity-60">
                                {busy === `sent-${inv.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                Send
                              </button>
                            )}
                            {(status === "SENT" || status === "OVERDUE") && (
                              <button disabled={busy === `paid-${inv.id}`} onClick={() => markPaid(inv.id)}
                                className="inline-flex items-center gap-1 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-bold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-60">
                                {busy === `paid-${inv.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                                Mark Paid
                              </button>
                            )}
                            {status === "PAID" && (
                              <span className="text-[11px] font-bold text-emerald-400">
                                {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString("en-ZA") : "Paid"}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
