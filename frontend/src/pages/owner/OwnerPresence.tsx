import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw, MapPin, Users, Circle, Search, Loader2 } from "lucide-react";
import { api } from "../../api/client";

// ── Types ──────────────────────────────────────────────────────────────────
type PresenceStatus = "online" | "recent" | "idle";

type TenantPresence = {
  companyId: string;
  name: string;
  plan: string;
  isActive: boolean;
  status: PresenceStatus;
  activeUsers: number;
  totalUsers: number;
  lastActiveAt: string | null;
  lastLoginAt: string | null;
  location: { approxCity: string | null; country: string | null; ip: string | null };
  activeUserNames: string[];
};

type PresenceResponse = {
  generatedAt: string;
  summary: { tenants: number; online: number; recent: number; idle: number; activeUsersTotal: number };
  tenants: TenantPresence[];
};

function unwrap<T>(r: unknown): T { return ((r as { data?: T } | null)?.data ?? r) as T; }

const DOT: Record<PresenceStatus, string> = {
  online: "bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.6)]",
  recent: "bg-amber-400",
  idle: "bg-slate-600",
};
const LABEL: Record<PresenceStatus, string> = { online: "Online", recent: "Active today", idle: "Idle" };
const STATUS_TEXT: Record<PresenceStatus, string> = {
  online: "text-emerald-300",
  recent: "text-amber-300",
  idle: "text-slate-400",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function locationLabel(loc: TenantPresence["location"]): string {
  if (loc.approxCity && loc.country) return `~${loc.approxCity}, ${loc.country}`;
  if (loc.country) return `~${loc.country}`;
  if (loc.ip) return loc.ip;
  return "—";
}

export default function OwnerPresence() {
  const [data, setData] = useState<PresenceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | PresenceStatus>("all");

  const load = useCallback(() => (async () => {
    try {
      const r = await api.get("/owner/tenants/presence");
      setData(unwrap<PresenceResponse>(r));
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.message ?? e?.message ?? "Could not load tenant presence.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  })(), []);

  const refresh = useCallback(() => {
    setRefreshing(true);
    return load();
  }, [load]);

  useEffect(() => {
    void load();
    // Auto-refresh every 30s so the green lights stay live.
    const t = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(t);
  }, [load, refresh]);

  const tenants = useMemo(() => {
    let list = data?.tenants ?? [];
    if (filter !== "all") list = list.filter((t) => t.status === filter);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(s) || (t.location.approxCity ?? "").toLowerCase().includes(s));
    }
    // Online first, then recent, then idle; within each, most-recently-active first.
    const rank: Record<PresenceStatus, number> = { online: 0, recent: 1, idle: 2 };
    return [...list].sort((a, b) => {
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      return (new Date(b.lastActiveAt ?? 0).getTime()) - (new Date(a.lastActiveAt ?? 0).getTime());
    });
  }, [data, filter, q]);

  const s = data?.summary;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/25">
            <Activity className="h-6 w-6 text-emerald-300" />
          </div>
          <div>
            <h1 className="text-2xl font-black">Tenant Presence</h1>
            <p className="text-sm text-white/50">
              Live sign-in status across all tenants. Auto-refreshes every 30s.
              {data && <span className="text-white/30"> · updated {timeAgo(data.generatedAt)}</span>}
            </p>
          </div>
        </div>
        <button
          onClick={() => void refresh()}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/70 hover:bg-white/10"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Summary cards */}
      {s && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryCard label="Online now" value={s.online} dot="online" />
          <SummaryCard label="Active today" value={s.recent} dot="recent" />
          <SummaryCard label="Idle" value={s.idle} dot="idle" />
          <SummaryCard label="Active users" value={s.activeUsersTotal} icon />
        </div>
      )}

      {error && <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200">{error}</div>}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tenant or city…"
            className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-10 pr-3 text-sm text-white placeholder-white/25 outline-none focus:border-emerald-500/50"
          />
        </div>
        <div className="flex gap-1.5">
          {(["all", "online", "recent", "idle"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-xl px-3 py-2 text-xs font-bold capitalize transition ${
                filter === f ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/30" : "bg-white/5 text-white/50 hover:bg-white/10"
              }`}
            >
              {f === "all" ? "All" : LABEL[f]}
            </button>
          ))}
        </div>
      </div>

      {/* Tenant table */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-white/30" /></div>
      ) : tenants.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 py-14 text-center text-sm text-white/35">No tenants match.</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-[11px] uppercase tracking-widest text-white/40">
              <tr>
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Active users</th>
                <th className="px-4 py-3">Last seen</th>
                <th className="px-4 py-3">Approx. location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {tenants.map((t) => (
                <tr key={t.companyId} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <div className="font-bold text-white">{t.name}</div>
                    <div className="text-[11px] text-white/35 capitalize">{String(t.plan).replace(/_/g, " ")}{!t.isActive && " · suspended"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${DOT[t.status]}`} />
                      <span className={`font-semibold ${STATUS_TEXT[t.status]}`}>{LABEL[t.status]}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {t.activeUsers > 0 ? (
                      <span className="text-emerald-300 font-semibold" title={t.activeUserNames.join(", ")}>
                        {t.activeUsers} online
                      </span>
                    ) : (
                      <span className="text-white/40">{t.totalUsers} total</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-white/60">{timeAgo(t.lastActiveAt ?? t.lastLoginAt)}</td>
                  <td className="px-4 py-3 text-white/50">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-white/30" /> {locationLabel(t.location)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-white/25">
        Location is approximate (city-level, derived from the last sign-in IP address) — not precise GPS.
        Online = a user made a request in the last 5 minutes.
      </p>
    </div>
  );
}

function SummaryCard({ label, value, dot }: { label: string; value: number; dot?: PresenceStatus; icon?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-white/45">
        {dot ? <Circle className={`h-3 w-3 rounded-full ${DOT[dot]}`} /> : <Users className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div className="mt-2 text-3xl font-black text-white">{value}</div>
    </div>
  );
}
