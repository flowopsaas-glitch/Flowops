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
  AlertTriangle,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { api } from "../api/client";
import { buildInvoiceCreatePayload } from "../lib/invoiceCreatePayload";
import { TiltCard } from "../components/premium/TiltCard";
import { formatMoney } from "../lib/currency";

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
  items?: { waybillId?: string; description?: string; quantity?: number; unitPrice?: number }[];
};

type Metrics = {
  outstanding: number;
  collected: number;
  total: number;
  collectionRate: number;
};

type BillingCoverage = {
  billable: number;
  billedCount: number;
  unbilledCount: number;
  unbilledValue: number;
  coverageRatePct: number;
  aging: { lt7: number; d7_30: number; gt30: number };
  watch: Array<{ id: string; trackingNumber: string; recipient: string; amount: number; ageDays: number }>;
  note: string;
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
  // Uses tenant currency when available via the global formatMoney import.
  // Falls back to ZAR if no tenant context (e.g. in modals rendered before context loads).
  return formatMoney(v ?? 0, window.__FLOWOPS_CURRENCY__ ?? 'ZAR');
}

// ── Generate Invoice Modal ─────────────────────────────────────────────────
function GenerateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [waybills, setWaybills] = useState<{ id: string; trackingNumber?: string; recipientName?: string; totalAmount?: number }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clientName, setClientName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      // Use the dedicated unbilled-waybills endpoint so the modal only shows
      // deliveries that haven't been invoiced yet — prevents double-billing.
      const raw = await api.get("/invoices/unbilled-waybills");
      const data = raw?.data ?? raw;
      setWaybills(Array.isArray(data) ? data : []);
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
      await api.post("/invoices", buildInvoiceCreatePayload({
        clientName,
        items: selectedWbs.map((w) => ({
          waybillId: w.id,
          description: `Delivery ${w.trackingNumber} to ${w.recipientName}`,
          quantity: 1,
          unitPrice: w.totalAmount,
        })),
      }));
      onSaved(); onClose();
    } catch (err) {
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
            <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50" htmlFor="field-client-name-1">Client Name *</label>
            <input id="field-client-name-1" value={clientName} onChange={(e) => setClientName(e.target.value)}
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
  const [coverage, setCoverage] = useState<BillingCoverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [invRes, metRes] = await Promise.allSettled([
        api.get("/invoices"),
        api.get("/invoices/metrics"),
      ]);
      if (invRes.status === "fulfilled") {
        const d = invRes.value as unknown as { data?: Invoice[] } | Invoice[];
        setInvoices(Array.isArray(d) ? d : (d?.data ?? []));
      }
      if (metRes.status === "fulfilled") {
        const m = metRes.value as unknown as { data?: Metrics } | Metrics;
        setMetrics((m as { data?: Metrics })?.data ?? (m as Metrics));
      }
      api.get("/invoices/billing-coverage").then((r) => setCoverage(r?.data ?? r)).catch(() => setCoverage(null));
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

      {/* Billing coverage / revenue leakage */}
      {coverage && coverage.billable > 0 && (
        <BillingCoveragePanel data={coverage} onGenerate={() => setShowGenerate(true)} />
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



// ── Billing coverage / revenue-leakage panel ────────────────────────────────

function BillingCoveragePanel({ data, onGenerate }: { data: BillingCoverage; onGenerate: () => void }) {
  const cov = data.coverageRatePct;
  const covTone = cov >= 95 ? "text-emerald-300" : cov >= 80 ? "text-amber-300" : "text-rose-300";
  const covBar = cov >= 95 ? "bg-emerald-400" : cov >= 80 ? "bg-amber-400" : "bg-rose-400";
  const agingTotal = Math.max(1, data.aging.lt7 + data.aging.d7_30 + data.aging.gt30);
  const segs = [
    { v: data.aging.lt7, cls: "bg-emerald-400", label: "<7d" },
    { v: data.aging.d7_30, cls: "bg-amber-400", label: "7–30d" },
    { v: data.aging.gt30, cls: "bg-rose-500", label: ">30d" },
  ];

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl fx-glass fx-reveal">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-cyan-300" />
          <h2 className="text-[11px] font-black uppercase tracking-[0.24em] text-white/60">Billing Coverage</h2>
          <span className="text-[10px] text-white/30">are we billing everything we delivered?</span>
        </div>
        {data.unbilledCount > 0 && (
          <button onClick={onGenerate} className="flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/8 px-4 py-2 text-sm font-bold text-cyan-300 hover:bg-cyan-500/15 transition">
            <Plus className="h-4 w-4" /> Bill {data.unbilledCount} unbilled
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <TiltCard>
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 h-full">
            <div className="flex items-center justify-between"><div className={`text-3xl font-black ${covTone}`}>{cov}%</div><CheckCircle2 className={`h-4 w-4 ${covTone}`} /></div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40 mt-1">Coverage</div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/5"><div className={`h-full ${covBar}`} style={{ width: `${Math.min(100, cov)}%` }} /></div>
          </div>
        </TiltCard>
        <TiltCard>
          <div className={`rounded-2xl border p-4 h-full ${data.unbilledValue > 0 ? "border-rose-500/25 bg-rose-500/[0.07]" : "border-white/8 bg-white/[0.03]"}`}>
            <div className="flex items-center justify-between"><div className={`text-xl font-black ${data.unbilledValue > 0 ? "text-rose-300" : "text-white"}`}>{money(data.unbilledValue)}</div><AlertTriangle className="h-4 w-4 text-rose-300" /></div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40 mt-1">Unbilled value</div>
            <div className="text-[10px] text-white/35 mt-0.5">delivered, not invoiced</div>
          </div>
        </TiltCard>
        <TiltCard>
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.06] p-4 h-full">
            <div className="flex items-center justify-between"><div className="text-2xl font-black text-amber-300">{data.unbilledCount}</div><FileText className="h-4 w-4 text-amber-300" /></div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40 mt-1">Unbilled waybills</div>
          </div>
        </TiltCard>
        <TiltCard>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] p-4 h-full">
            <div className="flex items-center justify-between"><div className="text-2xl font-black text-emerald-300">{data.billedCount}</div><Wallet className="h-4 w-4 text-emerald-300" /></div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40 mt-1">Billed of {data.billable}</div>
          </div>
        </TiltCard>
      </div>

      {data.unbilledCount > 0 && (
        <div className="mt-5 grid lg:grid-cols-2 gap-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40 mb-2">Unbilled aging</p>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/5">
              {segs.map((s) => s.v > 0 && <div key={s.label} className={s.cls} style={{ width: `${(s.v / agingTotal) * 100}%` }} title={`${s.label}: ${s.v}`} />)}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-white/45">
              {segs.map((s) => <span key={s.label} className="inline-flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${s.cls}`} /> {s.label} {s.v}</span>)}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40 mb-2">Oldest unbilled — bill these first</p>
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
              {data.watch.map((w) => (
                <div key={w.id} className="flex items-center gap-3 rounded-xl bg-black/25 px-3 py-2 text-sm">
                  <span className="font-mono text-xs font-black text-cyan-300 shrink-0">{w.trackingNumber}</span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-white/55">{w.recipient}</span>
                  <span className="shrink-0 font-mono text-white/70">{money(w.amount)}</span>
                  <span className={`shrink-0 text-[10px] font-bold ${w.ageDays > 30 ? "text-rose-300" : "text-white/40"}`}><Clock className="inline h-3 w-3 mr-0.5" />{w.ageDays}d</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <p className="mt-3 text-[10px] leading-snug text-white/30">{data.note}</p>
    </div>
  );
}
