import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Layers,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Search,
  Truck,
  XCircle,
} from "lucide-react";
import { api } from "../api/client";

// ── Types ──────────────────────────────────────────────────────────────────

type Manifest = {
  id: string;
  code: string;
  dispatched: boolean;
  dispatchedAt?: string | null;
  createdAt: string;
  driver?: { name: string; phone?: string | null } | null;
  branch?: { name: string } | null;
  _count?: { waybills: number };
};

type Waybill = {
  id: string;
  trackingNumber: string;
  status: string;
  recipientName: string;
  recipientAddress: string;
};

type Driver = {
  id: string;
  name: string;
  phone?: string | null;
  status: string;
  vehicleReg?: string | null;
};

type Branch = { id: string; name: string };

// ── Create Manifest Modal ──────────────────────────────────────────────────


type ManifestWaybillRow = {
  id: string | number;
  waybill?: { trackingNumber?: string; recipientName?: string; status?: string } | null;
};
type ManifestDetail = { waybills?: ManifestWaybillRow[] };

declare global {
  interface Window {
    _manifestDetailCache?: Record<string, ManifestDetail>;
  }
}

function CreateModal({
  drivers,
  branches,
  onClose,
  onSaved,
}: {
  drivers: Driver[];
  branches: Branch[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [waybills, setWaybills] = useState<Waybill[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [driverId, setDriverId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [wbSearch, setWbSearch] = useState("");
  const [wbLoading, setWbLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/waybills");
        // Waybills endpoint returns paginated: {data:{data:[],total,page,limit}}
        const raw = res?.data ?? res;
        const data: Waybill[] = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
        // Only show pending / collected waybills not yet dispatched
        setWaybills(data.filter((w) => ["PENDING", "COLLECTED"].includes(w.status)));
      } finally {
        setWbLoading(false);
      }
    })();
  }, []);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const filteredWb = useMemo(() => {
    const q = wbSearch.trim().toLowerCase();
    if (!q) return waybills;
    return waybills.filter(
      (w) =>
        w.trackingNumber.toLowerCase().includes(q) ||
        w.recipientName.toLowerCase().includes(q)
    );
  }, [waybills, wbSearch]);

  const save = async () => {
    if (selected.size === 0) { setError("Select at least one waybill."); return; }
    setSaving(true); setError("");
    try {
      await api.post("/manifests/create", {
        waybillIds: Array.from(selected),
        driverId:   driverId  || undefined,
        branchId:   branchId  || undefined,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err?.message || "Failed to create manifest.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-[28px] border border-white/10 bg-[#0b1628] shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5 shrink-0">
          <div className="text-lg font-black text-white">New Manifest</div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {error && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
          )}

          {/* Driver + Branch */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50" htmlFor="field-assign-driver-optional-2">Assign Driver (optional)</label>
              <select id="field-assign-driver-optional-2" value={driverId} onChange={(e) => setDriverId(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#071224] px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400">
                <option value="">— Unassigned —</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}{d.vehicleReg ? ` · ${d.vehicleReg}` : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50" htmlFor="field-branch-optional-1">Branch (optional)</label>
              <select id="field-branch-optional-1" value={branchId} onChange={(e) => setBranchId(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#071224] px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400">
                <option value="">— No branch —</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Waybill selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">
                Select Waybills ({selected.size} selected)
              </label>
              {selected.size > 0 && (
                <button onClick={() => setSelected(new Set())}
                  className="text-[11px] text-rose-300 hover:underline">Clear all</button>
              )}
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
              <input value={wbSearch} onChange={(e) => setWbSearch(e.target.value)}
                placeholder="Search tracking number or recipient…"
                className="w-full rounded-xl border border-white/10 bg-[#071224] pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-blue-400" />
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 max-h-52 overflow-y-auto">
              {wbLoading ? (
                <div className="py-8 text-center text-slate-400 text-sm">Loading waybills…</div>
              ) : filteredWb.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-sm">No pending waybills found.</div>
              ) : filteredWb.map((w) => (
                <button key={w.id} onClick={() => toggle(w.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-white/5 last:border-0 transition-colors ${selected.has(w.id) ? "bg-blue-500/10" : "hover:bg-white/5"}`}>
                  <div className={`h-4 w-4 rounded-sm border-2 flex items-center justify-center shrink-0 ${selected.has(w.id) ? "border-blue-400 bg-blue-400" : "border-white/30"}`}>
                    {selected.has(w.id) && <CheckCircle2 className="h-3 w-3 text-white" />}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-white">{w.trackingNumber}</div>
                    <div className="text-[11px] text-slate-400 truncate">{w.recipientName} · {w.recipientAddress}</div>
                  </div>
                  <span className="ml-auto rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white/50 shrink-0">{w.status}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-4 shrink-0">
          <button onClick={onClose} className="rounded-2xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/10">Cancel</button>
          <button disabled={saving || selected.size === 0} onClick={save}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-400 to-indigo-400 px-5 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
            {saving ? "Creating…" : `Create Manifest (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Manifest row with expand ───────────────────────────────────────────────

function ManifestRow({ m, onDispatch, dispatching }: {
  m: Manifest;
  onDispatch: (id: string) => void;
  dispatching: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ManifestDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const expand = async () => {
    if (!open && !detail) {
      try {
        const res = await api.get(`/manifests/${m.id}`);
        const d = res?.data ?? res;
        setDetail(d);
        // Cache for the print button
        window._manifestDetailCache = window._manifestDetailCache ?? {};
        window._manifestDetailCache[m.id] = d;
      } finally {
        setLoading(false);
      }
    }
    setOpen((v) => !v);
  };

  return (
    <>
      <tr className="border-b border-white/5 hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={expand}>
        <td className="px-5 py-4">
          <div className="flex items-center gap-2">
            {open ? <ChevronDown className="h-4 w-4 text-white/40" /> : <ChevronRight className="h-4 w-4 text-white/40" />}
            <div className="font-bold text-white">{m.code}</div>
          </div>
        </td>
        <td className="px-5 py-4 text-slate-300">{m.driver?.name ?? <span className="text-white/30">Unassigned</span>}</td>
        <td className="px-5 py-4 text-slate-300">{m.branch?.name ?? "—"}</td>
        <td className="px-5 py-4">
          <div className="flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5 text-white/40" />
            <span className="font-bold text-white">{m._count?.waybills ?? 0}</span>
          </div>
        </td>
        <td className="px-5 py-4">
          {m.dispatched ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-200">
              <CheckCircle2 className="h-3 w-3" /> Dispatched
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-bold text-amber-200">
              <ClipboardList className="h-3 w-3" /> Pending
            </span>
          )}
        </td>
        <td className="px-5 py-4 text-xs text-slate-400">
          {new Date(m.createdAt).toLocaleDateString("en-ZA")}
        </td>
        <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-2">
            {/* Print load sheet */}
            <button
              onClick={() => {
                const d = window._manifestDetailCache?.[m.id];
                const wbList = d?.waybills?.map((mw) =>
                  `  - ${mw.waybill?.trackingNumber ?? "?"} | ${mw.waybill?.recipientName ?? "?"} | ${mw.waybill?.status ?? "?"}`
                ).join("\n") || "  (expand to load waybills first)";
                const win = window.open("", "_blank");
                if (win) {
                  win.document.write(`<pre style="font-family:monospace;padding:20px">
MANIFEST: ${m.code}
Driver:   ${m.driver?.name ?? "Unassigned"}
Branch:   ${m.branch?.name ?? "—"}
Date:     ${new Date(m.createdAt).toLocaleString("en-ZA")}
Status:   ${m.dispatched ? "DISPATCHED" : "PENDING"}
Waybills (${m._count?.waybills ?? 0}):
${wbList}
</pre>`);
                  win.document.close();
                  win.print();
                }
              }}
              className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-white/40 hover:bg-white/10 hover:text-white/80"
              title="Print manifest"
            >
              🖨
            </button>
            {!m.dispatched && (
              <button
                disabled={dispatching === m.id}
                onClick={() => onDispatch(m.id)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-400/20 bg-blue-500/10 px-3 py-1.5 text-[11px] font-bold text-blue-200 hover:bg-blue-500/20 disabled:opacity-60"
              >
                {dispatching === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}
                Dispatch
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Expanded waybill list */}
      {open && (
        <tr className="border-b border-white/5">
          <td colSpan={7} className="px-5 py-0">
            <div className="ml-6 my-3 rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
              {loading ? (
                <div className="py-6 text-center text-slate-400 text-sm">Loading waybills…</div>
              ) : detail?.waybills?.length ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.14em] text-white/40">
                      <th className="px-4 py-2">Tracking</th>
                      <th className="px-4 py-2">Recipient</th>
                      <th className="px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.waybills.map((mw) => (
                      <tr key={mw.id} className="border-b border-white/5">
                        <td className="px-4 py-2 font-mono font-bold text-white text-xs">{mw.waybill?.trackingNumber ?? "—"}</td>
                        <td className="px-4 py-2 text-slate-300 text-xs">{mw.waybill?.recipientName ?? "—"}</td>
                        <td className="px-4 py-2">
                          <span className="text-[10px] font-bold text-white/50">{mw.waybill?.status ?? "—"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-6 text-center text-slate-400 text-sm">No waybills attached.</div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function ManifestsPage() {
  const [manifests, setManifests] = useState<Manifest[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "dispatched">("all");

  const load = useCallback(() => (async () => {
    try {
      const [mRes, dRes, bRes] = await Promise.allSettled([
        api.get("/manifests"),
        api.get("/drivers"),
        api.get("/branches"),
      ]);
      if (mRes.status === "fulfilled") {
        const d = mRes.value as unknown as { data?: Manifest[] } | Manifest[];
        setManifests(Array.isArray(d) ? d : (d?.data ?? []));
      }
      if (dRes.status === "fulfilled") {
        const d = dRes.value as unknown as { data?: Driver[] } | Driver[];
        setDrivers(Array.isArray(d) ? d : (d?.data ?? []));
      }
      if (bRes.status === "fulfilled") {
        const d = bRes.value as unknown as { data?: Branch[] } | Branch[];
        setBranches(Array.isArray(d) ? d : (d?.data ?? []));
      }
    } finally {
      setLoading(false);
    }
  })(), []);

  useEffect(() => { void load(); }, [load]);

  const dispatch = async (id: string) => {
    setDispatching(id);
    try {
      await api.patch(`/manifests/${id}`, { dispatched: true, dispatchedAt: new Date().toISOString() });
      await load();
    } finally {
      setDispatching(null);
    }
  };

  const visible = useMemo(() => {
    let list = manifests;
    if (filter === "pending")    list = list.filter((m) => !m.dispatched);
    if (filter === "dispatched") list = list.filter((m) => m.dispatched);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((m) => m.code.toLowerCase().includes(q) || m.driver?.name?.toLowerCase().includes(q));
    }
    return list;
  }, [manifests, filter, search]);

  const stats = useMemo(() => ({
    total:      manifests.length,
    pending:    manifests.filter((m) => !m.dispatched).length,
    dispatched: manifests.filter((m) => m.dispatched).length,
    waybills:   manifests.reduce((s, m) => s + (m._count?.waybills ?? 0), 0),
  }), [manifests]);

  return (
    <div className="space-y-6">
      {showCreate && (
        <CreateModal drivers={drivers} branches={branches}
          onClose={() => setShowCreate(false)} onSaved={load} />
      )}

      {/* Header */}
      <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-7 shadow-xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white">Manifests</h1>
            <p className="mt-1 text-sm text-slate-400">Group waybills into load sheets, assign drivers, and dispatch routes.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={load} className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-white hover:bg-white/10">
              <RefreshCw className="h-4 w-4" />
            </button>
            <button onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-400 to-indigo-400 px-5 py-2.5 text-sm font-bold text-slate-950">
              <Plus className="h-4 w-4" /> New Manifest
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Total",      val: stats.total,      tone: "text-white" },
          { label: "Pending",    val: stats.pending,    tone: "text-amber-300" },
          { label: "Dispatched", val: stats.dispatched, tone: "text-emerald-300" },
          { label: "Waybills",   val: stats.waybills,   tone: "text-cyan-300" },
        ].map(({ label, val, tone }) => (
          <div key={label} className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">{label}</div>
            <div className={`mt-2 text-3xl font-black ${tone}`}>{val}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-[28px] border border-white/10 bg-white/[0.05] shadow-xl">
        <div className="border-b border-white/10 p-4 flex flex-wrap items-center gap-3">
          <div className="flex gap-2">
            {(["all", "pending", "dispatched"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors capitalize ${filter === f ? "bg-white/15 text-white border border-white/20" : "border border-transparent text-white/50 hover:text-white"}`}>
                {f}
              </button>
            ))}
          </div>
          <div className="ml-auto relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code or driver…"
              className="w-48 rounded-xl border border-white/10 bg-[#071224] pl-8 pr-3 py-2 text-sm text-white outline-none focus:border-blue-400" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[11px] uppercase tracking-[0.14em] text-white/40">
                <th className="px-5 py-3">Code</th>
                <th className="px-5 py-3">Driver</th>
                <th className="px-5 py-3">Branch</th>
                <th className="px-5 py-3">Waybills</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Created</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/5">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-5 py-4"><div className="h-3 animate-pulse rounded-full bg-white/5" /></td>
                    ))}
                  </tr>
                ))
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center">
                    <Layers className="mx-auto h-10 w-10 text-white/10 mb-3" />
                    <div className="text-white/40 font-bold">
                      {manifests.length === 0 ? "No manifests yet — create one to group waybills into a load sheet." : "No manifests match your filter."}
                    </div>
                  </td>
                </tr>
              ) : visible.map((m) => (
                <ManifestRow key={m.id} m={m} onDispatch={dispatch} dispatching={dispatching} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
