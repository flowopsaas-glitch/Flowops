import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Ship, Plane, Truck, Plus, Loader2, Crown, Search, AlertTriangle,
  ArrowRight, Anchor, Package,
} from "lucide-react";
import { listFiles, createFile, type ShipmentFile } from "../../api/forwardingApi";
import { getEntitlements } from "../../api/billingApi";
import { useToast } from "../../components/ToastProvider";

const MODE_ICON: Record<string, any> = { OCEAN: Ship, AIR: Plane, ROAD: Truck };

const STATUS_CLS: Record<string, string> = {
  DRAFT: "border-white/15 bg-white/5 text-white/50",
  BOOKED: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  CARGO_RECEIVED: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  LOADED: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
  DEPARTED: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
  ARRIVED: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  CUSTOMS_CLEARED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  DELIVERED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  CANCELLED: "border-rose-500/30 bg-rose-500/10 text-rose-300",
};

function fmtDate(iso?: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" }) : "—";
}

export default function ForwardingConsole() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [entitled, setEntitled] = useState<boolean | null>(null);
  const [files, setFiles] = useState<ShipmentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{ direction?: string; status?: string; q?: string }>({});
  const [creating, setCreating] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ mode: "OCEAN", direction: "IMPORT", loadType: "FCL", shipperName: "", consigneeName: "" });

  useEffect(() => {
    void (async () => {
      try {
        const ent = await getEntitlements().catch(() => null);
        const ok = !!ent?.features?.freightForwarding;
        setEntitled(ok);
        if (ok) setFiles(await listFiles());
      } catch {
        setEntitled(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const reload = async () => setFiles(await listFiles(filter).catch(() => []));
  useEffect(() => { if (entitled) void reload(); /* eslint-disable-next-line */ }, [filter.direction, filter.status]);

  const kpis = useMemo(() => {
    const open = files.filter((f) => !["DELIVERED", "CANCELLED"].includes(f.status)).length;
    const arriving = files.filter((f) => f.eta && new Date(f.eta).getTime() < Date.now() + 7 * 86400000 && !["DELIVERED", "CANCELLED"].includes(f.status)).length;
    const atRisk = files.filter((f) => (f.aiRiskScore ?? 0) >= 50).length;
    return { open, arriving, atRisk, total: files.length };
  }, [files]);

  const submitNew = async () => {
    setCreating(true);
    try {
      const created = await createFile(form as any);
      showToast(`Created ${created.fileNumber}`, "success");
      setShowNew(false);
      navigate(`/forwarding/${created.id}`);
    } catch (e: any) {
      showToast(e?.message ?? "Could not create file", "error");
    } finally { setCreating(false); }
  };

  if (loading) {
    return <div className="min-h-full grid place-items-center bg-[#0b1530]"><Loader2 className="h-7 w-7 animate-spin text-white/40" /></div>;
  }

  if (!entitled) {
    return (
      <div className="min-h-full bg-[linear-gradient(180deg,#07111f,#0b1530)] p-8">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-cyan-500/30 bg-cyan-500/8 p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cyan-500/15 ring-1 ring-cyan-500/30">
            <Anchor className="h-7 w-7 text-cyan-300" />
          </div>
          <h1 className="mt-4 text-2xl font-black text-white">Freight Forwarding</h1>
          <p className="mt-2 text-sm text-white/60">
            Manage ocean &amp; air container import/export — shipment files, containers, customs, charges and the
            domestic last-mile, all in one place. Available on the <span className="font-bold text-cyan-300">Enterprise</span> plan.
          </p>
          <button onClick={() => navigate("/billing/plans")} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/20 px-5 py-2.5 text-sm font-black text-cyan-200 hover:bg-cyan-500/30 transition">
            <Crown className="h-4 w-4" /> See Enterprise plan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(20,120,160,0.12),transparent_30%),linear-gradient(180deg,#07111f,#0b1530)] p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5">

        {/* Header */}
        <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl shadow-[0_16px_50px_rgba(0,0,0,0.3)]">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-cyan-500/20 ring-2 ring-cyan-500/30">
                <Anchor className="h-7 w-7 text-cyan-300" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">Freight Forwarding</p>
                <h1 className="text-2xl font-black text-white">Shipment Files</h1>
                <p className="text-xs text-white/40">Import / export · ocean · air · road</p>
              </div>
            </div>
            <button onClick={() => setShowNew((v) => !v)} className="flex items-center gap-2 rounded-2xl border border-cyan-500/30 bg-cyan-500/15 px-5 py-2.5 text-sm font-bold text-cyan-200 hover:bg-cyan-500/25 transition">
              <Plus className="h-4 w-4" /> New file
            </button>
          </div>

          {/* KPIs */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Kpi label="Open files" value={kpis.open} tone="text-white" />
            <Kpi label="Arriving (7d)" value={kpis.arriving} tone="text-amber-300" />
            <Kpi label="At risk" value={kpis.atRisk} tone="text-rose-300" />
            <Kpi label="Total" value={kpis.total} tone="text-white/70" />
          </div>

          {/* New file form */}
          {showNew && (
            <div className="mt-4 rounded-2xl border border-cyan-500/20 bg-black/30 p-4 grid sm:grid-cols-5 gap-2">
              {(["mode", "direction", "loadType"] as const).map((k) => (
                <select key={k} value={(form as any)[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white">
                  {(k === "mode" ? ["OCEAN", "AIR", "ROAD"] : k === "direction" ? ["IMPORT", "EXPORT"] : ["FCL", "LCL", "BREAKBULK", "AIR"]).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ))}
              <input placeholder="Shipper" value={form.shipperName} onChange={(e) => setForm({ ...form, shipperName: e.target.value })} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/25" />
              <input placeholder="Consignee" value={form.consigneeName} onChange={(e) => setForm({ ...form, consigneeName: e.target.value })} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/25" />
              <button onClick={submitNew} disabled={creating} className="sm:col-span-5 flex items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/20 py-2.5 text-sm font-black text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-50">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create shipment file
              </button>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/25" />
            <input placeholder="Search file no / shipper / consignee…" value={filter.q ?? ""} onChange={(e) => setFilter({ ...filter, q: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && reload()}
              className="w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 py-2 text-sm text-white placeholder-white/25" />
          </div>
          {(["", "IMPORT", "EXPORT"] as const).map((d) => (
            <button key={d || "ALL"} onClick={() => setFilter({ ...filter, direction: d || undefined })}
              className={`rounded-full px-3 py-1.5 text-[11px] font-bold border transition ${(filter.direction || "") === d ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-300" : "border-white/10 bg-white/5 text-white/40 hover:bg-white/10"}`}>
              {d || "ALL"}
            </button>
          ))}
        </div>

        {/* List */}
        {files.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[24px] border border-dashed border-white/10 py-16 text-center">
            <Package className="h-12 w-12 text-white/15" />
            <p className="text-sm font-bold text-white/40">No shipment files yet</p>
            <p className="text-xs text-white/25">Create your first import/export file to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((f) => {
              const Icon = MODE_ICON[f.mode] || Ship;
              const risk = f.aiRiskScore ?? 0;
              return (
                <button key={f.id} onClick={() => navigate(`/forwarding/${f.id}`)}
                  className="w-full text-left rounded-2xl border border-white/8 bg-white/[0.04] p-4 hover:bg-white/[0.07] transition flex items-center gap-4">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-500/10 ring-1 ring-cyan-500/20 shrink-0">
                    <Icon className="h-5 w-5 text-cyan-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-white">{f.fileNumber}</span>
                      <span className="text-[10px] font-bold text-white/40">{f.direction} · {f.loadType}</span>
                      {risk >= 50 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                          <AlertTriangle className="h-3 w-3" /> risk {risk}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-white/45 truncate">
                      {f.shipperName || "—"} → {f.consigneeName || "—"} · {f.pol || "?"}→{f.pod || "?"}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${STATUS_CLS[f.status] ?? STATUS_CLS.DRAFT}`}>
                      {f.status.replace(/_/g, " ")}
                    </span>
                    <div className="text-[10px] text-white/30 mt-1">ETA {fmtDate(f.eta)}</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-white/20 shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
      <div className={`text-2xl font-black ${tone}`}>{value}</div>
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40 mt-1">{label}</div>
    </div>
  );
}
