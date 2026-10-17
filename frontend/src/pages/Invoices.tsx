import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { api, getToken } from "../api/client";
import { exportCsv, csvFilename } from "../lib/exportCsv";
import { buildInvoiceCreatePayload } from "../lib/invoiceCreatePayload";

// ── Types ──────────────────────────────────────────────────────────────────

type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED";

type InvoiceItem = {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  clientName: string;
  clientEmail?: string | null;
  subtotal: number;
  tax: number;
  total: number;
  dueDate?: string | null;
  paidAt?: string | null;
  sentAt?: string | null;
  notes?: string | null;
  items?: InvoiceItem[];
  createdAt: string;
};

type Metrics = {
  outstanding: number;
  collected: number;
  total: number;
  collectionRate: number;
};

// ── Status config ──────────────────────────────────────────────────────────

const STATUS_CFG: Record<InvoiceStatus, { label: string; cls: string }> = {
  DRAFT:     { label: "Draft",     cls: "border-slate-400/20 bg-slate-500/10 text-slate-300" },
  SENT:      { label: "Sent",      cls: "border-blue-400/20 bg-blue-500/10 text-blue-200" },
  PAID:      { label: "Paid",      cls: "border-emerald-400/20 bg-emerald-500/10 text-emerald-200" },
  OVERDUE:   { label: "Overdue",   cls: "border-rose-400/20 bg-rose-500/10 text-rose-200" },
  CANCELLED: { label: "Cancelled", cls: "border-white/10 bg-white/5 text-white/40" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status as InvoiceStatus] ?? STATUS_CFG.DRAFT;
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function money(v?: number | null) {
  return `ZAR ${(v ?? 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Create Invoice modal ───────────────────────────────────────────────────

function CreateInvoiceModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Omit<InvoiceItem, "id">[]>([
    { description: "", quantity: 1, unitPrice: 0, total: 0 },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const updateItem = (i: number, field: keyof Omit<InvoiceItem, "id">, val: string | number) => {
    setItems((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: val };
      next[i].total = next[i].quantity * next[i].unitPrice;
      return next;
    });
  };

  const subtotal = items.reduce((s, it) => s + it.total, 0);
  const tax = subtotal * 0.15; // 15% VAT (SA)
  const total = subtotal + tax;

  const save = async () => {
    if (!clientName.trim()) { setError("Client name is required."); return; }
    if (items.some((it) => !it.description.trim())) { setError("All line items need a description."); return; }
    setSaving(true);
    setError("");
    try {
      await api.post("/invoices", buildInvoiceCreatePayload({
        clientName,
        clientEmail,
        dueDate,
        notes,
        items,
      }));
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to create invoice.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-[28px] border border-white/10 bg-[#0b1628] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div className="text-lg font-black text-white">New Invoice</div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-white/50">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[70vh] px-6 py-5 space-y-5">
          {error ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
          ) : null}

          {/* Client */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">Client Name *</label>
              <input value={clientName} onChange={(e) => setClientName(e.target.value)}
                placeholder="Acme Logistics"
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#071224] px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">Client Email</label>
              <input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)}
                placeholder="billing@acme.com" type="email"
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#071224] px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">Due Date</label>
              <input value={dueDate} onChange={(e) => setDueDate(e.target.value)} type="date"
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#071224] px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">Notes</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Payment terms, ref…"
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#071224] px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400" />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">Line Items</label>
              <button
                onClick={() => setItems((p) => [...p, { description: "", quantity: 1, unitPrice: 0, total: 0 }])}
                className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-bold text-white hover:bg-white/10"
              >
                <Plus className="h-3 w-3" /> Add line
              </button>
            </div>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={it.description} onChange={(e) => updateItem(i, "description", e.target.value)}
                    placeholder="Description"
                    className="flex-1 rounded-xl border border-white/10 bg-[#071224] px-3 py-2 text-sm text-white outline-none focus:border-blue-400" />
                  <input value={it.quantity} onChange={(e) => updateItem(i, "quantity", Number(e.target.value))}
                    type="number" min="1" placeholder="Qty"
                    className="w-16 rounded-xl border border-white/10 bg-[#071224] px-2 py-2 text-sm text-white outline-none focus:border-blue-400 text-center" />
                  <input value={it.unitPrice || ""} onChange={(e) => updateItem(i, "unitPrice", Number(e.target.value))}
                    type="number" min="0" step="0.01" placeholder="Price"
                    className="w-24 rounded-xl border border-white/10 bg-[#071224] px-2 py-2 text-sm text-white outline-none focus:border-blue-400 text-right" />
                  <div className="w-24 text-right text-sm font-bold text-white/60">
                    {money(it.total)}
                  </div>
                  {items.length > 1 && (
                    <button onClick={() => setItems((p) => p.filter((_, j) => j !== i))}
                      className="p-1.5 rounded-lg text-white/30 hover:text-rose-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-400"><span>Subtotal</span><span>{money(subtotal)}</span></div>
            <div className="flex justify-between text-slate-400"><span>VAT (15%)</span><span>{money(tax)}</span></div>
            <div className="flex justify-between font-black text-white text-base"><span>Total</span><span>{money(total)}</span></div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-4">
          <button onClick={onClose} className="rounded-2xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/10">
            Cancel
          </button>
          <button disabled={saving} onClick={save}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-400 to-indigo-400 px-5 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {saving ? "Saving…" : "Create Invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = (searchParams.get("status") || "").toUpperCase() as InvoiceStatus | "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, metRes] = await Promise.allSettled([
        api.get("/invoices"),
        api.get("/invoices/metrics"),
      ]);
      if (invRes.status === "fulfilled") {
        const data: any = invRes.value;
        const arr = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
        setInvoices(arr);
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

  const visible = useMemo(() => {
    let list = invoices;
    if (statusFilter) list = list.filter((inv) => inv.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((inv) => inv.clientName.toLowerCase().includes(q) || inv.invoiceNumber.toLowerCase().includes(q));
    }
    return list;
  }, [invoices, statusFilter, search]);

  const markPaid = async (id: string) => {
    setBusy(id);
    try {
      await api.post(`/invoices/${id}/mark-paid`, {});
      await load();
    } finally {
      setBusy(null);
    }
  };

  const printInvoice = (id: string) => {
    // Open the print-HTML endpoint in a new tab — the page auto-triggers print
    const base = (import.meta.env.VITE_API_URL ?? "/api/v1") as string;
    const token = getToken();
    const url = `${base}/invoices/${id}/print-html${token ? `?t=${encodeURIComponent(token)}` : ""}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const sendInvoice = async (id: string) => {
    setBusy(`send-${id}`);
    try {
      await api.patch(`/invoices/${id}`, { status: "SENT", sentAt: new Date().toISOString() });
      await load();
    } finally {
      setBusy(null);
    }
  };

  // Bundle every unbilled DELIVERED waybill into one monthly statement —
  // the same pipeline the 1st-of-month cron runs, scoped to this tenant.
  const autoGenerate = async () => {
    setGenerating(true);
    setGenMsg(null);
    try {
      const res: any = await api.post("/invoices/auto-generate", {});
      const r = res?.data ?? res;
      setGenMsg(r?.message ?? (r?.generated ? "Statement generated." : "No unbilled deliveries to invoice."));
      await load();
    } catch (err: any) {
      setGenMsg(err?.message || "Could not generate statement.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {showCreate && (
        <CreateInvoiceModal onClose={() => setShowCreate(false)} onSaved={load} />
      )}

      {/* Header */}
      <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-7 shadow-xl fx-glass fx-reveal">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white">Invoices</h1>
            <p className="mt-1 text-sm text-slate-400">Create, send and track all tenant invoices.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={load} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10">
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={autoGenerate}
              disabled={generating}
              title="Bundle all unbilled delivered waybills into one monthly statement"
              className="inline-flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2.5 text-sm font-bold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate statement
            </button>
            <button
              onClick={() => exportCsv(
                visible.map((inv) => ({
                  invoiceNumber: inv.invoiceNumber,
                  client:        inv.clientName,
                  email:         inv.clientEmail ?? "",
                  status:        inv.status,
                  subtotal:      inv.subtotal,
                  tax:           inv.tax,
                  total:         inv.total,
                  due:           inv.dueDate ?? "",
                  paid:          inv.paidAt ?? "",
                  created:       inv.createdAt,
                })),
                csvFilename("invoices"),
                [
                  { key: "invoiceNumber", label: "Invoice #" },
                  { key: "client",        label: "Client"     },
                  { key: "email",         label: "Email"      },
                  { key: "status",        label: "Status"     },
                  { key: "subtotal",      label: "Subtotal"   },
                  { key: "tax",           label: "Tax"        },
                  { key: "total",         label: "Total ZAR"  },
                  { key: "due",           label: "Due Date"   },
                  { key: "paid",          label: "Paid At"    },
                  { key: "created",       label: "Created"    },
                ]
              )}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white/70 hover:bg-white/10 hover:text-white"
            >
              <Download className="h-4 w-4" /> CSV
            </button>
            <button onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-400 to-indigo-400 px-5 py-2.5 text-sm font-bold text-slate-950">
              <Plus className="h-4 w-4" /> New Invoice
            </button>
          </div>
        </div>
      </div>

      {/* Auto-generate result banner */}
      {genMsg && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200">
          <Sparkles className="h-4 w-4 shrink-0" />
          <span>{genMsg}</span>
          <button onClick={() => setGenMsg(null)} className="ml-auto text-emerald-200/60 hover:text-emerald-200">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Metrics */}
      {metrics && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[24px] border border-amber-400/20 bg-amber-500/5 p-5">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-300/60">Outstanding</div>
            <div className="mt-2 text-3xl font-black text-amber-300">{money(metrics.outstanding)}</div>
          </div>
          <div className="rounded-[24px] border border-emerald-400/20 bg-emerald-500/5 p-5">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300/60">Collected</div>
            <div className="mt-2 text-3xl font-black text-emerald-300">{money(metrics.collected)}</div>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5 fx-lift">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">Collection Rate</div>
            <div className="mt-2 text-3xl font-black text-white">
              {(metrics.collectionRate ?? 0).toFixed(1)}%
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-white/10">
              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(metrics.collectionRate, 100)}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        {(["", "DRAFT", "SENT", "PAID", "OVERDUE"] as const).map((s) => (
          <button key={s || "ALL"}
            onClick={() => {
              if (s) {
                setSearchParams({ status: s });
              } else {
                setSearchParams({});
              }
            }}
            className={`rounded-2xl px-4 py-2 text-sm font-bold transition-colors ${
              statusFilter === s
                ? "bg-white/15 text-white border border-white/20"
                : "border border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10"
            }`}
          >
            {s || "All"} ({s ? invoices.filter((i) => i.status === s).length : invoices.length})
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-[28px] border border-white/10 bg-white/[0.05] shadow-xl">
        <div className="border-b border-white/10 p-4 flex items-center gap-3">
          <Search className="h-4 w-4 text-white/30 shrink-0" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client name or invoice number…"
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[11px] uppercase tracking-[0.16em] text-white/40">
                <th className="px-5 py-3">Invoice</th>
                <th className="px-5 py-3">Client</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Total</th>
                <th className="px-5 py-3">Due</th>
                <th className="px-5 py-3">Created</th>
                <th className="px-5 py-3 text-right">Actions</th>
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
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center">
                    <FileText className="mx-auto h-10 w-10 text-white/10 mb-3" />
                    <div className="text-white/40 font-bold">
                      {invoices.length === 0 ? "No invoices yet — create your first." : "No invoices match your filter."}
                    </div>
                  </td>
                </tr>
              ) : visible.map((inv) => {
                const isOverdue = inv.status === "SENT" && inv.dueDate && new Date(inv.dueDate) < new Date();
                return (
                  <tr key={inv.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-bold text-white">{inv.invoiceNumber}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-white">{inv.clientName}</div>
                      {inv.clientEmail && <div className="text-[11px] text-slate-400">{inv.clientEmail}</div>}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={isOverdue ? "OVERDUE" : inv.status} />
                    </td>
                    <td className="px-5 py-4 font-bold text-white">{money(inv.total)}</td>
                    <td className="px-5 py-4">
                      {inv.dueDate ? (
                        <span className={isOverdue ? "text-rose-400 font-bold" : "text-slate-300"}>
                          {new Date(inv.dueDate).toLocaleDateString("en-ZA")}
                        </span>
                      ) : <span className="text-white/30">—</span>}
                    </td>
                    <td className="px-5 py-4 text-slate-400 text-xs">
                      {new Date(inv.createdAt).toLocaleDateString("en-ZA")}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {inv.status === "DRAFT" && (
                          <button disabled={busy === `send-${inv.id}`}
                            onClick={() => sendInvoice(inv.id)}
                            className="inline-flex items-center gap-1 rounded-xl border border-blue-400/20 bg-blue-500/10 px-2.5 py-1.5 text-[11px] font-bold text-blue-200 hover:bg-blue-500/20 disabled:opacity-60">
                            {busy === `send-${inv.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                            Send
                          </button>
                        )}
                        {(inv.status === "SENT" || inv.status === "OVERDUE") && (
                          <button disabled={busy === inv.id}
                            onClick={() => markPaid(inv.id)}
                            className="inline-flex items-center gap-1 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-bold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-60">
                            {busy === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                            Mark Paid
                          </button>
                        )}
                        {inv.status === "PAID" && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString("en-ZA") : "Paid"}
                          </span>
                        )}
                        {/* PDF print — always available */}
                        <button
                          onClick={() => printInvoice(inv.id)}
                          title="Download / Print PDF"
                          className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-white/50 hover:bg-white/10 hover:text-white transition"
                        >
                          <Printer className="h-3 w-3" />
                        </button>
                      </div>
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
