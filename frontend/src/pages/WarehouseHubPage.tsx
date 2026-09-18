import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight, Box, CheckCircle2, ClipboardList, FileText, Layers,
  Package, RefreshCw, ScanLine, ShieldAlert, Truck, Upload, Zap, PackageCheck,
} from "lucide-react";
import { api } from "../api/client";

type HubStats = {
  inboxTotal: number; inboxReady: number; inboxExtracting: number;
  manifestsPending: number; manifestsDispatched: number; manifestsWaybills: number;
  podPending: number; podCompleted: number; waybillsToday: number;
};

function unwrap(r: any): any { return r?.data ?? r; }
function unwrapList(r: any): any[] {
  const d = r?.data ?? r;
  if (Array.isArray(d)) return d;
  const d2 = d?.data ?? d?.items ?? d;
  return Array.isArray(d2) ? d2 : [];
}

function QuickAction({ icon: Icon, label, desc, to, color }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; desc: string; to: string; color: string;
}) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(to)}
      className={`group flex flex-col items-start gap-3 rounded-[24px] border p-5 text-left transition-all hover:scale-[1.02] ${color}`}>
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15">
        <Icon className="h-5 w-5 text-white/80" />
      </div>
      <div>
        <div className="text-sm font-black text-white">{label}</div>
        <div className="text-[11px] text-white/45 mt-0.5">{desc}</div>
      </div>
      <ArrowRight className="h-4 w-4 text-white/30 self-end group-hover:text-white/60 transition" />
    </button>
  );
}

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: number | string; sub?: string;
  icon: React.ComponentType<{ className?: string }>; color: string;
}) {
  return (
    <div className={`rounded-[22px] border p-5 flex flex-col gap-2 ${color}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">{label}</span>
        <Icon className="h-4 w-4 opacity-40" />
      </div>
      <div className="text-3xl font-black text-white leading-none">{value}</div>
      {sub && <div className="text-[11px] text-white/35">{sub}</div>}
    </div>
  );
}

/**
 * DepotReceivePanel — the warehouse clerk's inbound check-in station.
 * Shows COLLECTED parcels awaiting depot receive and lets the clerk scan/enter
 * tracking numbers to receive them (COLLECTED → AT_ORIGIN_HUB). A parcel MUST
 * be received here before it can be loaded onto a linehaul.
 */
function DepotReceivePanel() {
  const [pending, setPending] = useState<any[]>([]);
  const [scan, setScan] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    try {
      const r: any = await api.get("/hub/pending-receive");
      const d = r?.data ?? r;
      setPending(Array.isArray(d?.waybills) ? d.waybills : []);
    } catch { /* best-effort */ }
  }, []);

  useEffect(() => { void loadPending(); }, [loadPending]);

  async function receive(refs: string[]) {
    const clean = refs.map((s) => s.trim()).filter(Boolean);
    if (clean.length === 0) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const r: any = await api.post("/hub/receive", { refs: clean });
      const d = r?.data ?? r;
      const parts: string[] = [];
      if (d?.receivedCount) parts.push(`${d.receivedCount} received`);
      if (d?.already?.length) parts.push(`${d.already.length} already in`);
      if (d?.notFound?.length) parts.push(`${d.notFound.length} not found`);
      if (d?.rejected?.length) parts.push(`${d.rejected.length} rejected`);
      setResult(parts.join(" · ") || "Done");
      setScan("");
      await loadPending();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Receive failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.3)]">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-500/15 ring-1 ring-cyan-500/20">
            <PackageCheck className="h-4 w-4 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-sm font-black text-white">Receive at Depot</h3>
            <p className="text-[11px] text-white/40">{pending.length} collected parcel(s) awaiting check-in</p>
          </div>
        </div>
        <button onClick={() => void loadPending()}
          className="flex items-center gap-1.5 text-xs font-bold text-cyan-300 hover:text-cyan-200 transition">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {/* Scan / enter waybill to receive */}
      <form
        onSubmit={(e) => { e.preventDefault(); void receive([scan]); }}
        className="flex gap-2 mb-4"
      >
        <input
          value={scan} onChange={(e) => setScan(e.target.value)}
          placeholder="Scan or type tracking number…"
          className="flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-cyan-500/50"
        />
        <button type="submit" disabled={busy || !scan.trim()}
          className="rounded-xl bg-cyan-500 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-400 disabled:opacity-40">
          {busy ? "…" : "Receive"}
        </button>
      </form>

      {result && <div className="mb-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-300">{result}</div>}
      {error && <div className="mb-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-2 text-xs font-bold text-rose-300">{error}</div>}

      {/* Pending worklist */}
      <div className="space-y-2 max-h-[280px] overflow-y-auto">
        {pending.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 rounded-2xl border border-dashed border-white/10 text-center">
            <PackageCheck className="h-7 w-7 text-white/10 mb-2" />
            <p className="text-sm text-white/25">No parcels awaiting depot receive</p>
          </div>
        ) : (
          <>
            {pending.length > 1 && (
              <button
                onClick={() => void receive(pending.map((w) => w.trackingNumber))}
                disabled={busy}
                className="w-full mb-1 rounded-xl border border-cyan-500/30 bg-cyan-500/10 py-2.5 text-xs font-black text-cyan-200 hover:bg-cyan-500/20 transition disabled:opacity-40"
              >
                Receive all {pending.length}
              </button>
            )}
            {pending.map((w) => (
              <div key={w.id}
                className="flex items-center justify-between rounded-2xl border border-white/6 bg-black/25 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate">{w.trackingNumber}</div>
                  <div className="text-[10px] text-white/35 truncate">
                    {w.senderName ?? "—"}{w.senderAddress ? ` · ${w.senderAddress}` : ""}
                  </div>
                </div>
                <button onClick={() => void receive([w.trackingNumber])} disabled={busy}
                  className="shrink-0 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-black text-cyan-200 hover:bg-cyan-500/20 transition disabled:opacity-40">
                  Receive
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export default function WarehouseHubPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<HubStats>({
    inboxTotal: 0, inboxReady: 0, inboxExtracting: 0,
    manifestsPending: 0, manifestsDispatched: 0, manifestsWaybills: 0,
    podPending: 0, podCompleted: 0, waybillsToday: 0,
  });
  const [recentInbox, setRecentInbox] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inboxRes, manifestsRes, waybillsRes] = await Promise.allSettled([
        api.get("/waybills/inbox"),
        api.get("/manifests"),
        api.get("/waybills"),
      ]);

      const inbox: any[]     = inboxRes.status === "fulfilled"     ? unwrapList(inboxRes.value)     : [];
      const manifests: any[] = manifestsRes.status === "fulfilled" ? unwrapList(manifestsRes.value) : [];
      const allWb: any[]     = waybillsRes.status === "fulfilled"  ? unwrapList(waybillsRes.value)  : [];

      const today = new Date(); today.setHours(0,0,0,0);
      const todayWb = allWb.filter(w => new Date(w.createdAt) >= today);
      const deliveredToday = allWb.filter(w => w.status === "DELIVERED" && new Date(w.updatedAt) >= today);
      const pendingPod = allWb.filter(w => w.status === "DELIVERED" && !w.podSignatureUrl && !w.podImageUrl);

      setStats({
        inboxTotal:          inbox.length,
        inboxReady:          inbox.filter(i => i.status === "READY").length,
        inboxExtracting:     inbox.filter(i => i.status === "EXTRACTING").length,
        manifestsPending:    manifests.filter(m => !m.dispatched).length,
        manifestsDispatched: manifests.filter(m => m.dispatched).length,
        manifestsWaybills:   manifests.reduce((s: number, m: any) => s + (m._count?.waybills ?? 0), 0),
        podPending:          pendingPod.length,
        podCompleted:        deliveredToday.length,
        waybillsToday:       todayWb.length,
      });

      setRecentInbox(inbox.slice(0, 4));
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const podRate = stats.podCompleted + stats.podPending > 0
    ? Math.round((stats.podCompleted / (stats.podCompleted + stats.podPending)) * 100)
    : 0;

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(30,80,140,0.14),transparent_28%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8 overflow-y-auto">
      <div className="mx-auto max-w-[1300px] space-y-6">

        {/* Header */}
        <div className="rounded-[30px] border border-white/10 bg-white/6 p-6 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/85 ring-1 ring-white/15">
                <Box className="h-3.5 w-3.5 text-amber-400" />
                Warehouse Hub
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-white">Hub Operations</h1>
              <p className="mt-1 text-sm text-white/50">
                Intake · Manifests · POD verification · Today's activity
              </p>
            </div>
            <button onClick={() => void load()} disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/60 hover:bg-white/10 hover:text-white transition disabled:opacity-40">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickAction icon={Upload}        label="Waybill Inbox"    desc="Scan & verify new waybills"   to="/waybills/inbox"  color="border-blue-500/25 bg-blue-500/8 hover:bg-blue-500/14" />
          <QuickAction icon={ScanLine}      label="Batch Scan"       desc="Bulk barcode processing"      to="/waybills/scan"   color="border-violet-500/25 bg-violet-500/8 hover:bg-violet-500/14" />
          <QuickAction icon={Layers}        label="Manifests"        desc="Create & dispatch load sheets" to="/manifests"      color="border-amber-500/25 bg-amber-500/8 hover:bg-amber-500/14" />
          <QuickAction icon={CheckCircle2}  label="POD Queue"        desc="Verify delivery evidence"     to="/pod-deliveries"  color="border-emerald-500/25 bg-emerald-500/8 hover:bg-emerald-500/14" />
        </div>

        {/* KPI grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Inbox Pending"   value={stats.inboxExtracting} sub="extracting now"        icon={FileText}      color="border-blue-500/20"    />
          <StatCard label="Ready to Commit" value={stats.inboxReady}      sub="verified, awaiting commit" icon={Zap}        color="border-emerald-500/20" />
          <StatCard label="Manifests Open"  value={stats.manifestsPending} sub={`${stats.manifestsWaybills} total waybills`} icon={ClipboardList} color="border-amber-500/20" />
          <StatCard label="POD Rate"        value={`${podRate}%`}          sub={`${stats.podCompleted} of ${stats.podCompleted + stats.podPending}`} icon={CheckCircle2} color="border-emerald-500/20" />
        </div>

        {/* Depot receive — clerk inbound check-in (COLLECTED → AT_ORIGIN_HUB) */}
        <DepotReceivePanel />

        {/* 2-col: waybill intake + manifests summary */}
        <div className="grid gap-4 lg:grid-cols-2">

          {/* Inbox status */}
          <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.3)]">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-500/15 ring-1 ring-blue-500/20">
                  <FileText className="h-4 w-4 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Waybill Inbox</h3>
                  <p className="text-[11px] text-white/40">{stats.inboxTotal} items · auto-refreshes</p>
                </div>
              </div>
              <button onClick={() => navigate("/waybills/inbox")}
                className="flex items-center gap-1.5 text-xs font-bold text-blue-300 hover:text-blue-200 transition">
                Open <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-2">
              {recentInbox.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 rounded-2xl border border-dashed border-white/10 text-center">
                  <Upload className="h-7 w-7 text-white/10 mb-2" />
                  <p className="text-sm text-white/25">No items in inbox</p>
                  <button onClick={() => navigate("/waybills/inbox")}
                    className="mt-3 text-xs text-blue-300 hover:underline">Upload first waybill</button>
                </div>
              ) : (
                recentInbox.map(item => (
                  <div key={item.id} onClick={() => navigate("/waybills/inbox")}
                    className="flex items-center justify-between rounded-2xl border border-white/6 bg-black/25 px-4 py-3 cursor-pointer hover:border-white/15 hover:bg-white/5 transition">
                    <div className="flex items-center gap-3">
                      <div className={`h-2 w-2 rounded-full ${item.status === "READY" ? "bg-emerald-400" : item.status === "EXTRACTING" ? "bg-blue-400 animate-pulse" : "bg-rose-400"}`} />
                      <div>
                        <div className="text-sm font-bold text-white">{item.waybillNumber || "Scanning…"}</div>
                        <div className="text-[10px] text-white/35">{item.weight ?? "—"}kg · {item.pieces ?? "—"} pcs</div>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold uppercase rounded-full border px-2.5 py-0.5 ${
                      item.status === "READY"      ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-300" :
                      item.status === "EXTRACTING" ? "border-blue-400/25 bg-blue-500/10 text-blue-300" :
                                                     "border-rose-400/25 bg-rose-500/10 text-rose-300"
                    }`}>{item.status}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Manifests summary */}
          <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.3)]">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/20">
                  <Layers className="h-4 w-4 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Manifests</h3>
                  <p className="text-[11px] text-white/40">Load sheets & dispatch status</p>
                </div>
              </div>
              <button onClick={() => navigate("/manifests")}
                className="flex items-center gap-1.5 text-xs font-bold text-amber-300 hover:text-amber-200 transition">
                Open <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "Pending Dispatch", value: stats.manifestsPending, color: "border-amber-500/20 bg-amber-500/6 text-amber-300", icon: ClipboardList },
                { label: "Dispatched",       value: stats.manifestsDispatched, color: "border-emerald-500/20 bg-emerald-500/6 text-emerald-300", icon: Truck },
                { label: "Total Waybills",   value: stats.manifestsWaybills, color: "border-white/10 bg-white/4 text-white", icon: Package },
              ].map(m => (
                <div key={m.label} className={`rounded-2xl border ${m.color} p-4`}>
                  <m.icon className="h-4 w-4 mb-2 opacity-60" />
                  <div className={`text-2xl font-black ${m.color.split(" ").pop()}`}>{m.value}</div>
                  <div className="text-[10px] text-white/35 mt-0.5">{m.label}</div>
                </div>
              ))}
            </div>

            {/* POD completion bar */}
            <div className="mt-5 pt-4 border-t border-white/8">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-white/50 flex items-center gap-1.5">
                  <ShieldAlert className="h-3.5 w-3.5 text-emerald-400" /> POD Completion
                </span>
                <span className="text-[11px] font-black text-white">{podRate}%</span>
              </div>
              <div className="h-1.5 w-full bg-white/8 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${podRate > 80 ? "bg-emerald-400" : podRate > 50 ? "bg-amber-400" : "bg-rose-400"}`}
                  style={{ width: `${podRate}%` }} />
              </div>
              {stats.podPending > 0 && (
                <button onClick={() => navigate("/pod-deliveries")}
                  className="mt-3 flex items-center gap-1.5 text-[11px] text-rose-300 hover:underline">
                  <ShieldAlert className="h-3 w-3" />
                  {stats.podPending} deliveries missing POD — review now
                </button>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
