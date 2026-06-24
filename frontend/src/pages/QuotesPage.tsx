import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Scale,
  Search,
  XCircle,
} from "lucide-react";
import { api } from "../api/client";

// ── Types (match actual Quote schema) ──────────────────────────────────────
// Quote: id, fromAddress, toAddress, weight, price, breakdown(Json),
//        accepted(bool), expiresAt, companyId, createdAt

type Quote = {
  id: string;
  fromAddress: string;
  toAddress: string;
  weight: number;
  price: number;
  clientName?: string | null;
  breakdown?: { base?: number; perKg?: number; total?: number } | null;
  accepted: boolean;
  expiresAt?: string | null;
  createdAt: string;
};

function money(v?: number | null) {
  return `ZAR ${(v ?? 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isExpired(ts?: string | null) {
  return ts ? new Date(ts) < new Date() : false;
}

// ── Create Quote modal ─────────────────────────────────────────────────────

function CreateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ fromAddress: "", toAddress: "", weight: "", clientName: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Live price preview: base R80 + R15/kg
  const previewPrice = 80 + 15 * (parseFloat(form.weight) || 0);

  const save = async () => {
    if (!form.fromAddress.trim() || !form.toAddress.trim() || !form.weight) {
      setError("All fields are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post("/quotes", {
        fromAddress: form.fromAddress,
        toAddress:   form.toAddress,
        weight:      parseFloat(form.weight),
        ...(form.clientName.trim() && { clientName: form.clientName.trim() }),
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to create quote.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#0b1628] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div className="text-lg font-black text-white">New Quote</div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
          )}
          {(["fromAddress", "toAddress"] as const).map((field) => (
            <div key={field}>
              <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">
                {field === "fromAddress" ? "From Address *" : "To Address *"}
              </label>
              <input
                value={form[field]}
                onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                placeholder={field === "fromAddress" ? "123 Pickup St, Johannesburg" : "456 Delivery Rd, Cape Town"}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#071224] px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400"
              />
            </div>
          ))}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">Client Name</label>
            <input
              value={form.clientName}
              onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
              placeholder="Acme Logistics (optional)"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#071224] px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">Weight (kg) *</label>
            <input
              value={form.weight}
              onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
              type="number" min="0.1" step="0.1" placeholder="2.5"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#071224] px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400"
            />
          </div>

          {/* Price preview */}
          {parseFloat(form.weight) > 0 && (
            <div className="rounded-2xl border border-blue-400/20 bg-blue-500/5 px-4 py-3 flex items-center justify-between">
              <div className="text-sm text-slate-300">Estimated price</div>
              <div className="text-xl font-black text-blue-300">{money(previewPrice)}</div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-4">
          <button onClick={onClose} className="rounded-2xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/10">Cancel</button>
          <button disabled={saving} onClick={save}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-400 to-indigo-400 px-5 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {saving ? "Generating…" : "Generate Quote"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "accepted" | "expired">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await api.get("/quotes");
      const data = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
      setQuotes(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const accept = async (id: string) => {
    setBusy(id);
    try {
      await api.patch(`/quotes/${id}/accept`, {});
      await load();
    } finally {
      setBusy(null);
    }
  };

  const stats = useMemo(() => ({
    total:    quotes.length,
    pending:  quotes.filter((q) => !q.accepted && !isExpired(q.expiresAt)).length,
    accepted: quotes.filter((q) => q.accepted).length,
    expired:  quotes.filter((q) => !q.accepted && isExpired(q.expiresAt)).length,
    totalValue: quotes.filter((q) => q.accepted).reduce((s, q) => s + q.price, 0),
  }), [quotes]);

  const visible = useMemo(() => {
    let list = quotes;
    if (filter === "pending")  list = list.filter((q) => !q.accepted && !isExpired(q.expiresAt));
    if (filter === "accepted") list = list.filter((q) => q.accepted);
    if (filter === "expired")  list = list.filter((q) => !q.accepted && isExpired(q.expiresAt));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((x) =>
        x.fromAddress.toLowerCase().includes(q) ||
        x.toAddress.toLowerCase().includes(q) ||
        (x.clientName?.toLowerCase().includes(q))
      );
    }
    return list;
  }, [quotes, filter, search]);

  return (
    <div className="space-y-6">
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onSaved={load} />}

      {/* Header */}
      <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-7 shadow-xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white">Quotes</h1>
            <p className="mt-1 text-sm text-slate-400">Generate instant freight quotes based on weight and route. Valid 48 hours.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={load} className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-white hover:bg-white/10">
              <RefreshCw className="h-4 w-4" />
            </button>
            <button onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-400 to-indigo-400 px-5 py-2.5 text-sm font-bold text-slate-950">
              <Plus className="h-4 w-4" /> Generate Quote
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { k: "all",      label: "Total Quotes",   val: stats.total,    tone: "text-white" },
          { k: "pending",  label: "Pending",         val: stats.pending,  tone: "text-amber-300" },
          { k: "accepted", label: "Accepted",        val: stats.accepted, tone: "text-emerald-300" },
          { k: "expired",  label: "Expired",         val: stats.expired,  tone: "text-slate-400" },
        ].map(({ k, label, val, tone }) => (
          <button key={k} onClick={() => setFilter(k as any)}
            className={`rounded-[24px] border p-5 text-left transition-colors ${filter === k ? "border-blue-400/30 bg-blue-500/10" : "border-white/10 bg-white/[0.05] hover:bg-white/[0.08]"}`}>
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">{label}</div>
            <div className={`mt-2 text-3xl font-black ${tone}`}>{val}</div>
          </button>
        ))}
      </div>

      {/* Accepted value banner */}
      {stats.totalValue > 0 && (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/5 px-5 py-3 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <span className="text-sm text-slate-300">
            Accepted quote value: <span className="font-black text-emerald-300">{money(stats.totalValue)}</span>
          </span>
        </div>
      )}

      {/* Table */}
      <div className="rounded-[28px] border border-white/10 bg-white/[0.05] shadow-xl">
        <div className="border-b border-white/10 p-4 flex items-center gap-3">
          <Search className="h-4 w-4 text-white/30 shrink-0" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by client name or address…"
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[11px] uppercase tracking-[0.14em] text-white/40">
                <th className="px-5 py-3">Client</th>
                <th className="px-5 py-3">From → To</th>
                <th className="px-5 py-3">Weight</th>
                <th className="px-5 py-3">Price</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Expires</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/5">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-5 py-4"><div className="h-3 animate-pulse rounded-full bg-white/5" /></td>
                    ))}
                  </tr>
                ))
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center">
                    <Scale className="mx-auto h-10 w-10 text-white/10 mb-3" />
                    <div className="text-white/40 font-bold">
                      {quotes.length === 0 ? "No quotes yet — generate your first quote above." : "No quotes match your filter."}
                    </div>
                  </td>
                </tr>
              ) : visible.map((q) => {
                const expired = isExpired(q.expiresAt);
                return (
                  <tr key={q.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-4">
                      {q.clientName
                        ? <span className="font-semibold text-white text-sm">{q.clientName}</span>
                        : <span className="text-white/25 text-xs italic">—</span>}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-white text-xs leading-relaxed">
                        <span className="text-slate-400">FROM </span>{q.fromAddress}<br />
                        <span className="text-slate-400">TO&nbsp;&nbsp;&nbsp;&nbsp;</span>{q.toAddress}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5 text-white/30" />
                        <span className="font-bold text-white">{q.weight} kg</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-black text-white">{money(q.price)}</td>
                    <td className="px-5 py-4">
                      {q.accepted ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-200">
                          <CheckCircle2 className="h-3 w-3" /> Accepted
                        </span>
                      ) : expired ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-400/20 bg-slate-500/10 px-2.5 py-0.5 text-[11px] font-bold text-slate-400">
                          <XCircle className="h-3 w-3" /> Expired
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-bold text-amber-200">
                          <Clock className="h-3 w-3" /> Pending
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-400">
                      {q.expiresAt ? (
                        <span className={expired ? "text-rose-400" : ""}>
                          {new Date(q.expiresAt).toLocaleDateString("en-ZA")}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Send quote via WhatsApp — Freshdesk/modern CRM standard */}
                        <button
                          title="Send quote via WhatsApp"
                          onClick={() => {
                            const text = [
                              `Hi${q.clientName ? ` ${q.clientName}` : ""}! Here's your FlowOps freight quote:`,
                              `From: ${q.fromAddress}`,
                              `To: ${q.toAddress}`,
                              `Weight: ${q.weight}kg`,
                              `Price: ZAR ${q.price.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`,
                              q.expiresAt ? `Valid until: ${new Date(q.expiresAt).toLocaleDateString("en-ZA")}` : "",
                              "Reply to accept.",
                            ].filter(Boolean).join("\n");
                            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-green-400/20 bg-green-500/10 px-2.5 py-1.5 text-[11px] font-bold text-green-200 hover:bg-green-500/20 transition"
                        >
                          💬 WhatsApp
                        </button>
                        {!q.accepted && !expired && (
                          <button disabled={busy === q.id} onClick={() => accept(q.id)}
                            className="inline-flex items-center gap-1 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-bold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-60">
                            {busy === q.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                            Accept
                          </button>
                        )}
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
