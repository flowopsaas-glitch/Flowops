import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Mail,
  Package,
  Phone,
  Plus,
  RefreshCw,
  Search,
  User,
} from "lucide-react";
import { api } from "../api/client";

// ── Types ──────────────────────────────────────────────────────────────────
// Clients are derived from unique sender/recipient names across all waybills.
// This gives a live client directory from actual business activity.

type ClientRecord = {
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  type: "sender" | "recipient";
  waybillCount: number;
  lastSeen: string;
};

// ── Main page ──────────────────────────────────────────────────────────────

export default function Clients() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "sender" | "recipient">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await api.get("/waybills");
      // Waybills returns paginated {data:{data:[],total}}
      const raw: any = res?.data ?? res;
      const waybills = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);

      // Build a client directory from unique sender + recipient names
      const map = new Map<string, ClientRecord>();

      waybills.forEach((w: any) => {
        const addClient = (name: string, phone: string, email: string | null | undefined, address: string | null | undefined, type: "sender" | "recipient") => {
          if (!name) return;
          const key = `${type}:${name.trim().toLowerCase()}`;
          const existing = map.get(key);
          if (existing) {
            existing.waybillCount += 1;
            if (w.createdAt > existing.lastSeen) existing.lastSeen = w.createdAt;
          } else {
            map.set(key, { name: name.trim(), phone: phone || "—", email, address, type, waybillCount: 1, lastSeen: w.createdAt || new Date().toISOString() });
          }
        };

        addClient(w.senderName, w.senderPhone, null, w.senderAddress, "sender");
        addClient(w.recipientName, w.recipientPhone, w.recipientEmail, w.recipientAddress, "recipient");
      });

      setClients(Array.from(map.values()).sort((a, b) => b.waybillCount - a.waybillCount));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    let list = clients;
    if (filter !== "all") list = list.filter((c) => c.type === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q) || c.phone.includes(q));
    }
    return list;
  }, [clients, search, filter]);

  const senderCount    = clients.filter((c) => c.type === "sender").length;
  const recipientCount = clients.filter((c) => c.type === "recipient").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-7 shadow-xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white">Enterprise Clients</h1>
            <p className="mt-1 text-sm text-slate-400">
              All senders and recipients from your waybill activity — your live client directory.
            </p>
          </div>
          <button onClick={load} className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-white hover:bg-white/10">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">Total Clients</div>
          <div className="mt-2 text-3xl font-black text-white">{clients.length}</div>
        </div>
        <div className="rounded-[24px] border border-blue-400/20 bg-blue-500/5 p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-300/60">Senders</div>
          <div className="mt-2 text-3xl font-black text-blue-300">{senderCount}</div>
          <div className="mt-1 text-xs text-slate-400">Companies sending via FlowOps</div>
        </div>
        <div className="rounded-[24px] border border-emerald-400/20 bg-emerald-500/5 p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-300/60">Recipients</div>
          <div className="mt-2 text-3xl font-black text-emerald-300">{recipientCount}</div>
          <div className="mt-1 text-xs text-slate-400">Delivery destinations</div>
        </div>
      </div>

      {/* Filter + search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {(["all","sender","recipient"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-2xl px-4 py-2 text-sm font-bold capitalize transition-colors ${filter === f ? "bg-white/15 text-white border border-white/20" : "border border-white/10 bg-white/5 text-white/50 hover:text-white"}`}>
              {f}
            </button>
          ))}
        </div>
        <div className="ml-auto relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone…"
            className="w-64 rounded-2xl border border-white/10 bg-[#071224] pl-9 pr-4 py-2.5 text-sm text-white outline-none focus:border-blue-400" />
        </div>
      </div>

      {/* Client list */}
      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-[24px] border border-white/5 bg-white/[0.03]" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] py-20 text-center">
          <Building2 className="mx-auto h-10 w-10 text-white/10 mb-3" />
          <div className="text-white/40 font-bold">
            {clients.length === 0
              ? "No clients yet — they appear automatically once waybills are created."
              : "No clients match your filter."}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((c) => (
            <div key={`${c.type}:${c.name}`} className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5 hover:bg-white/[0.08] transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-xl border border-white/10 bg-white/10 grid place-items-center shrink-0">
                    <User className="h-4 w-4 text-white/60" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-white truncate">{c.name}</div>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${
                      c.type === "sender"
                        ? "border border-blue-400/20 bg-blue-500/10 text-blue-200"
                        : "border border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
                    }`}>
                      {c.type}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-bold text-white/60 shrink-0">
                  <Package className="h-3 w-3" />
                  {c.waybillCount}
                </div>
              </div>

              <div className="mt-3 space-y-1.5 text-xs text-slate-400">
                {c.phone !== "—" && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 shrink-0" /> {c.phone}
                  </div>
                )}
                {c.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{c.email}</span>
                  </div>
                )}
                {c.address && (
                  <div className="text-[11px] text-white/30 truncate pl-5">{c.address}</div>
                )}
              </div>

              <div className="mt-3 text-[10px] text-white/25">
                Last seen: {new Date(c.lastSeen).toLocaleDateString("en-ZA")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
