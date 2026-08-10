/**
 * Clients — proper client directory with billing types.
 *
 * Supports COD, Prepaid, Contract, and Cash clients.
 * CRUD operations backed by /clients endpoint.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeDollarSign, Building2, Edit2, Mail, Package, Phone, Plus, RefreshCw,
  Search, ShieldCheck, Trash2, User, X, AlertCircle,
  CalendarClock, Wallet, TrendingUp, Users,
} from "lucide-react";
import api from "../api/client";
import { TiltCard } from "../components/premium/TiltCard";

// ── Types ─────────────────────────────────────────────────────────────────────

type BillingType = "COD" | "PREPAID" | "CONTRACT" | "CASH";

interface Client {
  id: string;
  name: string;
  tradingName?: string;
  phone?: string;
  email?: string;
  address?: string;
  billingType: BillingType;
  creditLimit?: number;
  paymentTerms?: number;
  vatNumber?: string;
  accountCode?: string;
  contractStart?: string;
  contractEnd?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
}

const EMPTY_FORM: Omit<Client, "id" | "isActive" | "createdAt"> = {
  name: "",
  tradingName: "",
  phone: "",
  email: "",
  address: "",
  billingType: "COD",
  creditLimit: undefined,
  paymentTerms: 30,
  vatNumber: "",
  accountCode: "",
  notes: "",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const BILLING_COLORS: Record<BillingType, string> = {
  COD:      "border-amber-500/25  bg-amber-500/10  text-amber-200",
  PREPAID:  "border-emerald-500/25 bg-emerald-500/10 text-emerald-200",
  CONTRACT: "border-sky-500/25    bg-sky-500/10    text-sky-200",
  CASH:     "border-slate-500/25  bg-slate-500/10  text-slate-300",
};

const BILLING_LABELS: Record<BillingType, string> = {
  COD:      "COD",
  PREPAID:  "Prepaid",
  CONTRACT: "Contract",
  CASH:     "Cash",
};

const BILLING_DESCRIPTIONS: Record<BillingType, string> = {
  COD:      "Driver collects cash on delivery",
  PREPAID:  "Client pays before dispatch",
  CONTRACT: "Monthly account — invoiced with credit terms",
  CASH:     "Walk-in / once-off cash payer",
};

function unwrap(res: any): any[] {
  const d = res?.data ?? res;
  return Array.isArray(d) ? d : [];
}

type ClientOverview = {
  total: number;
  byBillingType: { COD: number; PREPAID: number; CONTRACT: number; CASH: number };
  contractCount: number;
  totalCreditExtended: number;
  newThisMonth: number;
  avgContractTerms: number | null;
  expiringContracts: { id: string; name: string; contractEnd: string; daysToEnd: number; expired: boolean }[];
  expiringCount: number;
  note: string;
};

// ── Client Form Modal ─────────────────────────────────────────────────────────

function ClientModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: Client | null;
  onSave: (data: typeof EMPTY_FORM) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<typeof EMPTY_FORM>(
    initial ? {
      name: initial.name,
      tradingName: initial.tradingName ?? "",
      phone: initial.phone ?? "",
      email: initial.email ?? "",
      address: initial.address ?? "",
      billingType: initial.billingType,
      creditLimit: initial.creditLimit,
      paymentTerms: initial.paymentTerms ?? 30,
      vatNumber: initial.vatNumber ?? "",
      accountCode: initial.accountCode ?? "",
      notes: initial.notes ?? "",
    } : { ...EMPTY_FORM }
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setErr("Name is required."); return; }
    setSaving(true);
    setErr("");
    try {
      await onSave(form);
    } catch (ex: any) {
      setErr(ex?.message ?? "Failed to save client.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[28px] border border-white/10 bg-[#07111e] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/8 bg-[#07111e] px-6 py-4">
          <h2 className="text-lg font-black text-white">
            {initial ? "Edit Client" : "Register New Client"}
          </h2>
          <button onClick={onClose} className="rounded-xl p-1.5 hover:bg-white/10 text-white/50">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {err && (
            <div className="flex gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {err}
            </div>
          )}

          {/* Billing type — first, most important */}
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-white/50">Billing Type *</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(["COD","PREPAID","CONTRACT","CASH"] as BillingType[]).map(bt => (
                <button type="button" key={bt}
                  onClick={() => set("billingType", bt)}
                  className={`rounded-2xl border p-3 text-left transition ${
                    form.billingType === bt ? BILLING_COLORS[bt] : "border-white/8 bg-white/[0.03] text-white/40 hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="text-sm font-black">{BILLING_LABELS[bt]}</div>
                  <div className="text-[10px] mt-0.5 opacity-70 leading-tight">{BILLING_DESCRIPTIONS[bt]}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Basic info */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-white/50">Client Name *</label>
              <input value={form.name} onChange={e => set("name", e.target.value)} required
                placeholder="e.g. Acme Logistics" className={inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-white/50">Trading Name</label>
              <input value={form.tradingName} onChange={e => set("tradingName", e.target.value)}
                placeholder="Optional" className={inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-white/50">Phone</label>
              <input value={form.phone} onChange={e => set("phone", e.target.value)}
                placeholder="+27 82 000 0000" className={inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-white/50">Email</label>
              <input type="email" value={form.email} onChange={e => set("email", e.target.value)}
                placeholder="billing@client.co.za" className={inputCls} />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-white/50">Address</label>
            <input value={form.address} onChange={e => set("address", e.target.value)}
              placeholder="Street, City, Province" className={inputCls} />
          </div>

          {/* Contract/billing details */}
          {form.billingType === "CONTRACT" && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-white/50">Credit Limit (R)</label>
                <input type="number" value={form.creditLimit ?? ""} onChange={e => set("creditLimit", +e.target.value || undefined)}
                  placeholder="e.g. 50000" className={inputCls} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-white/50">Payment Terms (days)</label>
                <input type="number" value={form.paymentTerms ?? 30} onChange={e => set("paymentTerms", +e.target.value)}
                  className={inputCls} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-white/50">Account Code</label>
                <input value={form.accountCode} onChange={e => set("accountCode", e.target.value)}
                  placeholder="e.g. CLI-001" className={inputCls} />
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-white/50">VAT Number</label>
              <input value={form.vatNumber} onChange={e => set("vatNumber", e.target.value)}
                placeholder="Optional" className={inputCls} />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-white/50">Notes</label>
            <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={3}
              placeholder="Any special instructions or account notes…"
              className={inputCls + " resize-none"} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-2xl border border-white/10 px-5 py-2.5 text-sm font-bold text-white/60 hover:bg-white/5">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="rounded-2xl bg-sky-500 px-6 py-2.5 text-sm font-black text-slate-950 hover:bg-sky-400 disabled:opacity-50 transition">
              {saving ? "Saving…" : initial ? "Save Changes" : "Create Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-2xl border border-white/10 bg-[#071224] px-4 py-2.5 text-sm text-white outline-none focus:border-sky-400 placeholder-white/20 transition";

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [overview, setOverview] = useState<ClientOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [billingFilter, setBillingFilter] = useState<BillingType | "ALL">("ALL");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  };

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await api.get("/clients?limit=500");
      if (signal?.aborted) return;
      setClients(unwrap(res));
      api.get("/clients/overview").then((r: any) => {
        if (!signal?.aborted) setOverview(r?.data ?? r);
      }).catch(() => {
        if (!signal?.aborted) setOverview(null);
      });
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  /** Manual refresh (used as onClick handler). */
  const refresh = useCallback(() => { void load(); }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const visible = useMemo(() => {
    let list = clients;
    if (billingFilter !== "ALL") list = list.filter(c => c.billingType === billingFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.tradingName?.toLowerCase().includes(q)) ||
        (c.phone?.includes(q)) ||
        (c.email?.toLowerCase().includes(q))
      );
    }
    return list;
  }, [clients, billingFilter, search]);

  const counts = useMemo(() => ({
    ALL:      clients.length,
    COD:      clients.filter(c => c.billingType === "COD").length,
    PREPAID:  clients.filter(c => c.billingType === "PREPAID").length,
    CONTRACT: clients.filter(c => c.billingType === "CONTRACT").length,
    CASH:     clients.filter(c => c.billingType === "CASH").length,
  }), [clients]);

  async function handleSave(data: typeof EMPTY_FORM) {
    if (editing) {
      await api.patch(`/clients/${editing.id}`, data);
      showToast(`${data.name} updated.`);
    } else {
      await api.post("/clients", data);
      showToast(`${data.name} created.`);
    }
    setShowModal(false);
    setEditing(null);
    void load();
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Remove "${name}" from your client directory? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      await api.delete(`/clients/${id}`);
      showToast("Client removed.");
      void load();
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-2xl border border-emerald-500/30 bg-emerald-500/15 px-5 py-3 text-sm font-bold text-emerald-300 shadow-xl">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">Client Management</p>
            <h1 className="text-3xl font-black tracking-tight text-white">Clients</h1>
            <p className="mt-1 text-sm text-white/45">COD, prepaid, contract, and cash clients — all in one place.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={refresh} className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-white hover:bg-white/10">
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={() => { setEditing(null); setShowModal(true); }}
              className="flex items-center gap-2 rounded-2xl bg-sky-500 px-5 py-2.5 text-sm font-black text-slate-950 hover:bg-sky-400 transition"
            >
              <Plus className="h-4 w-4" /> Add Client
            </button>
          </div>
        </div>
      </div>

      {/* Portfolio intelligence */}
      {overview && overview.total > 0 && <ClientPortfolio o={overview} onFilterContracts={() => setBillingFilter("CONTRACT")} />}

      {/* Billing type filter strip */}
      <div className="flex flex-wrap gap-2">
        {(["ALL","COD","PREPAID","CONTRACT","CASH"] as const).map(bt => (
          <button key={bt}
            onClick={() => setBillingFilter(bt)}
            className={`flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-bold transition ${
              billingFilter === bt
                ? bt === "ALL"
                  ? "border-white/20 bg-white/15 text-white"
                  : BILLING_COLORS[bt as BillingType]
                : "border-white/8 bg-white/[0.03] text-white/45 hover:bg-white/[0.07]"
            }`}
          >
            {bt !== "ALL" && <BadgeDollarSign className="h-3.5 w-3.5" />}
            {bt === "ALL" ? "All Clients" : BILLING_LABELS[bt as BillingType]}
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">
              {counts[bt]}
            </span>
          </button>
        ))}
        <div className="ml-auto relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, phone, email…"
            className="w-56 rounded-2xl border border-white/10 bg-[#071224] pl-9 pr-4 py-2 text-sm text-white outline-none focus:border-sky-400" />
        </div>
      </div>

      {/* Client grid */}
      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-[24px] border border-white/5 bg-white/[0.03]" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] py-20 text-center">
          <Building2 className="h-12 w-12 text-white/10" />
          <div>
            <div className="text-sm font-bold text-white/40">
              {clients.length === 0 ? "No clients yet" : "No clients match your filter"}
            </div>
            {clients.length === 0 && (
              <p className="mt-1 text-xs text-white/25">Click "Add Client" to register your first COD, prepaid, or contract client.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map(c => (
            <div key={c.id}
              className="group rounded-[24px] border border-white/10 bg-white/[0.05] p-5 hover:bg-white/[0.08] transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-xl border border-white/10 bg-white/10 grid place-items-center shrink-0">
                    <User className="h-4 w-4 text-white/60" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-black text-white truncate">{c.name}</div>
                    {c.tradingName && (
                      <div className="text-xs text-white/40 truncate">{c.tradingName}</div>
                    )}
                  </div>
                </div>
                <span className={`shrink-0 rounded-xl border px-2.5 py-1 text-[11px] font-black ${BILLING_COLORS[c.billingType]}`}>
                  {BILLING_LABELS[c.billingType]}
                </span>
              </div>

              <div className="mt-3 space-y-1 text-xs text-white/45">
                {c.phone && (
                  <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0" />{c.phone}</div>
                )}
                {c.email && (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{c.email}</span>
                  </div>
                )}
                {c.address && (
                  <div className="text-[11px] text-white/25 truncate">{c.address}</div>
                )}
                {c.billingType === "CONTRACT" && c.creditLimit && (
                  <div className="flex items-center gap-1.5 text-sky-300/70">
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                    Credit limit: R{c.creditLimit.toLocaleString("en-ZA")}
                    {c.paymentTerms ? ` · Net ${c.paymentTerms}` : ""}
                  </div>
                )}
                {c.accountCode && (
                  <div className="flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5 shrink-0" /> {c.accountCode}
                  </div>
                )}
              </div>

              {c.notes && (
                <div className="mt-2 text-[11px] text-white/25 italic truncate">{c.notes}</div>
              )}

              <div className="mt-4 flex items-center justify-between">
                <div className="text-[10px] text-white/20">
                  Added {new Date(c.createdAt).toLocaleDateString("en-ZA")}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {/* WhatsApp quick-dial — Freshdesk/CRM standard */}
                  {c.phone && (
                    <button
                      onClick={() => {
                        const phone = c.phone!.replace(/\D/g, "").replace(/^0/, "27");
                        const text = `Hi ${c.name}, this is FlowOps Couriers. `;
                        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
                      }}
                      title="WhatsApp client"
                      className="rounded-xl border border-green-500/20 bg-green-500/10 p-1.5 text-green-400 hover:bg-green-500/20 transition"
                    >
                      💬
                    </button>
                  )}
                  <button
                    onClick={() => { setEditing(c); setShowModal(true); }}
                    className="rounded-xl border border-white/10 bg-white/5 p-1.5 text-white/50 hover:bg-sky-500/20 hover:text-sky-300 transition"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(c.id, c.name)}
                    disabled={deleting === c.id}
                    className="rounded-xl border border-white/10 bg-white/5 p-1.5 text-white/50 hover:bg-red-500/20 hover:text-red-300 transition disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <ClientModal
          initial={editing}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(null); }}
        />
      )}
    </div>
  );
}



// ── Portfolio intelligence panel ────────────────────────────────────────────

function clientMoney(v: number) {
  return `R ${Math.round(v).toLocaleString("en-ZA")}`;
}

const MIX_META: { key: "COD" | "PREPAID" | "CONTRACT" | "CASH"; label: string; cls: string }[] = [
  { key: "CONTRACT", label: "Contract", cls: "bg-sky-400" },
  { key: "PREPAID", label: "Prepaid", cls: "bg-emerald-400" },
  { key: "COD", label: "COD", cls: "bg-amber-400" },
  { key: "CASH", label: "Cash", cls: "bg-slate-400" },
];

function ClientPortfolio({ o, onFilterContracts }: { o: ClientOverview; onFilterContracts: () => void }) {
  const mixTotal = Math.max(1, o.byBillingType.COD + o.byBillingType.PREPAID + o.byBillingType.CONTRACT + o.byBillingType.CASH);

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 fx-glass fx-reveal">
      <div className="flex items-center gap-2 mb-4">
        <Users className="h-4 w-4 text-sky-300" />
        <h2 className="text-[11px] font-black uppercase tracking-[0.24em] text-white/60">Portfolio Intelligence</h2>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <TiltCard>
          <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4 h-full">
            <div className="flex items-center justify-between"><div className="text-2xl font-black text-white">{o.total}</div><Building2 className="h-4 w-4 text-white/25" /></div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40 mt-1">Active clients</div>
            {o.newThisMonth > 0 && <div className="text-[10px] text-emerald-300/80 mt-0.5">+{o.newThisMonth} this month</div>}
          </div>
        </TiltCard>
        <TiltCard>
          <button onClick={onFilterContracts} className="w-full text-left rounded-[18px] border border-sky-400/20 bg-sky-500/[0.06] p-4 h-full hover:bg-sky-500/[0.12] transition">
            <div className="flex items-center justify-between"><div className="text-2xl font-black text-sky-300">{o.contractCount}</div><ShieldCheck className="h-4 w-4 text-sky-300" /></div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40 mt-1">Contract accounts</div>
            {o.avgContractTerms != null && <div className="text-[10px] text-white/35 mt-0.5">avg {o.avgContractTerms}d terms</div>}
          </button>
        </TiltCard>
        <TiltCard>
          <div className="rounded-[18px] border border-emerald-400/20 bg-emerald-500/[0.06] p-4 h-full">
            <div className="flex items-center justify-between"><div className="text-xl font-black text-emerald-300">{clientMoney(o.totalCreditExtended)}</div><Wallet className="h-4 w-4 text-emerald-300" /></div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40 mt-1">Credit extended</div>
          </div>
        </TiltCard>
        <TiltCard>
          <div className={`rounded-[18px] border p-4 h-full ${o.expiringCount > 0 ? "border-amber-400/25 bg-amber-500/[0.07]" : "border-white/8 bg-white/[0.03]"}`}>
            <div className="flex items-center justify-between"><div className={`text-2xl font-black ${o.expiringCount > 0 ? "text-amber-300" : "text-white"}`}>{o.expiringCount}</div><CalendarClock className={`h-4 w-4 ${o.expiringCount > 0 ? "text-amber-300" : "text-white/25"}`} /></div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40 mt-1">Contracts expiring</div>
            <div className="text-[10px] text-white/35 mt-0.5">within 60 days</div>
          </div>
        </TiltCard>
      </div>

      <div className="mt-5 grid lg:grid-cols-2 gap-5">
        {/* Billing-type mix */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40 mb-2">Billing-type mix</p>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/5">
            {MIX_META.map((m) => o.byBillingType[m.key] > 0 && (
              <div key={m.key} className={m.cls} style={{ width: `${(o.byBillingType[m.key] / mixTotal) * 100}%` }} title={`${m.label}: ${o.byBillingType[m.key]}`} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-white/45">
            {MIX_META.map((m) => (
              <span key={m.key} className="inline-flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${m.cls}`} /> {m.label} {o.byBillingType[m.key]}</span>
            ))}
          </div>
        </div>

        {/* Renewal watch */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40 mb-2">Contract renewal watch</p>
          {o.expiringContracts.length === 0 ? (
            <p className="text-xs text-white/30">No contracts expiring in the next 60 days.</p>
          ) : (
            <div className="space-y-1.5">
              {o.expiringContracts.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-xl bg-black/20 px-3 py-2 text-sm">
                  <CalendarClock className={`h-3.5 w-3.5 shrink-0 ${c.expired ? "text-rose-300" : "text-amber-300"}`} />
                  <span className="min-w-0 flex-1 truncate font-bold text-white/80">{c.name}</span>
                  {c.expired ? (
                    <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[9px] font-bold text-rose-300 shrink-0">lapsed {Math.abs(c.daysToEnd)}d</span>
                  ) : (
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold text-amber-300 shrink-0">{c.daysToEnd}d left</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="mt-3 text-[10px] leading-snug text-white/30">{o.note}</p>
    </div>
  );
}
