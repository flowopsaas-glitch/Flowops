import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  EyeOff,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { api } from "../api/client";

// ── Types ──────────────────────────────────────────────────────────────────

type AiEvent = {
  id: string;
  type: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  resolved: boolean;
  dismissed: boolean;
  resolvedAt?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  createdAt: string;
};

type Stats = { total: number; unresolved: number; critical: number };

// ── Severity config ────────────────────────────────────────────────────────

const SEV: Record<string, { cls: string; dot: string; label: string; icon: React.ReactNode }> = {
  critical: {
    cls:   "border-rose-400/20 bg-rose-500/10 text-rose-200",
    dot:   "bg-rose-400 animate-ping",
    label: "Critical",
    icon:  <ShieldAlert className="h-3.5 w-3.5" />,
  },
  warning: {
    cls:   "border-amber-400/20 bg-amber-500/10 text-amber-200",
    dot:   "bg-amber-400",
    label: "Warning",
    icon:  <AlertTriangle className="h-3.5 w-3.5" />,
  },
  info: {
    cls:   "border-blue-400/20 bg-blue-500/10 text-blue-200",
    dot:   "bg-blue-400",
    label: "Info",
    icon:  <Activity className="h-3.5 w-3.5" />,
  },
};

function SeverityBadge({ severity }: { severity: string }) {
  const s = SEV[severity] ?? SEV.info;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.icon}
      {s.label}
    </span>
  );
}

// ── Event card ─────────────────────────────────────────────────────────────

function EventCard({
  event,
  onResolve,
  onDismiss,
  busy,
}: {
  event: AiEvent;
  onResolve: (id: string) => void;
  onDismiss: (id: string) => void;
  busy: string | null;
}) {
  return (
    <div className={`rounded-[24px] border p-5 transition-opacity ${
      event.resolved
        ? "border-white/5 bg-white/[0.02] opacity-50"
        : event.severity === "critical"
          ? "border-rose-500/20 bg-rose-500/[0.04]"
          : event.severity === "warning"
            ? "border-amber-500/15 bg-amber-500/[0.03]"
            : "border-white/10 bg-white/[0.04]"
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <SeverityBadge severity={event.severity} />
            {event.sourceType && (
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white/50 capitalize">
                {event.sourceType}
              </span>
            )}
          </div>
          <div className="mt-2 font-bold text-white">{event.title}</div>
          <div className="mt-1 text-sm text-slate-400 leading-relaxed">{event.body}</div>
          <div className="mt-2 text-[11px] text-white/30">
            {new Date(event.createdAt).toLocaleString("en-ZA")}
            {event.resolved && event.resolvedAt && (
              <span className="ml-2 text-emerald-400/60">
                Resolved {new Date(event.resolvedAt).toLocaleString("en-ZA")}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        {!event.resolved && !event.dismissed && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              disabled={busy === `dismiss-${event.id}`}
              onClick={() => onDismiss(event.id)}
              title="Dismiss"
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/40 hover:text-white hover:bg-white/10 disabled:opacity-60"
            >
              {busy === `dismiss-${event.id}` ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              disabled={busy === `resolve-${event.id}`}
              onClick={() => onResolve(event.id)}
              title="Mark resolved"
              className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-2 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-60"
            >
              {busy === `resolve-${event.id}` ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        )}
        {event.resolved && (
          <CheckCircle2 className="h-5 w-5 text-emerald-400/40 shrink-0" />
        )}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function HighRiskQueuePage() {
  const [events, setEvents] = useState<AiEvent[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [evRes, stRes] = await Promise.allSettled([
        api.get("/ai-events"),
        api.get("/ai-events/stats"),
      ]);
      if (evRes.status === "fulfilled") {
        const d: any = evRes.value;
        setEvents(Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : []));
      }
      if (stRes.status === "fulfilled") {
        const s: any = stRes.value;
        setStats(s?.data ?? s);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const resolve = async (id: string) => {
    setBusy(`resolve-${id}`);
    try {
      await api.post(`/ai-events/${id}/resolve`, {});
      await load();
    } finally {
      setBusy(null);
    }
  };

  const dismiss = async (id: string) => {
    setBusy(`dismiss-${id}`);
    try {
      await api.post(`/ai-events/${id}/dismiss`, {});
      await load();
    } finally {
      setBusy(null);
    }
  };

  const visible = useMemo(() => {
    let list = events.filter((e) => !e.dismissed);
    if (!showResolved) list = list.filter((e) => !e.resolved);
    if (severityFilter !== "all") list = list.filter((e) => e.severity === severityFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((e) => e.title.toLowerCase().includes(q) || e.body.toLowerCase().includes(q) || e.type.toLowerCase().includes(q));
    }
    return list.sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return (order[a.severity as keyof typeof order] ?? 3) - (order[b.severity as keyof typeof order] ?? 3);
    });
  }, [events, showResolved, severityFilter, search]);

  const unresolvedCritical = events.filter((e) => e.severity === "critical" && !e.resolved && !e.dismissed).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`rounded-[30px] border p-7 shadow-xl ${unresolvedCritical > 0 ? "border-rose-500/30 bg-rose-500/[0.04]" : "border-white/10 bg-white/[0.05]"}`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1 text-xs font-bold text-rose-300">
              <ShieldAlert className="h-3.5 w-3.5" /> Security Control
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white">High Risk Queue</h1>
            <p className="mt-1 text-sm text-slate-400">
              AI-detected anomalies, route deviations, SLA breaches and operational risks.
            </p>
            {unresolvedCritical > 0 && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-rose-400/30 bg-rose-500/15 px-4 py-1.5 text-sm font-bold text-rose-200">
                <span className="h-2 w-2 rounded-full bg-rose-400 animate-ping" />
                {unresolvedCritical} critical event{unresolvedCritical > 1 ? "s" : ""} require attention
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={load} className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-white hover:bg-white/10">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { label: "Total Events",  val: stats.total,      tone: "text-white" },
            { label: "Unresolved",    val: stats.unresolved, tone: "text-amber-300" },
            { label: "Critical",      val: stats.critical,   tone: "text-rose-300" },
          ].map(({ label, val, tone }) => (
            <div key={label} className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">{label}</div>
              <div className={`mt-2 text-3xl font-black ${tone}`}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {(["all", "critical", "warning", "info"] as const).map((s) => (
            <button key={s} onClick={() => setSeverityFilter(s)}
              className={`rounded-2xl px-4 py-2 text-sm font-bold transition-colors capitalize ${severityFilter === s ? "bg-white/15 text-white border border-white/20" : "border border-white/10 bg-white/5 text-white/50 hover:text-white"}`}>
              {s} {s !== "all" && `(${events.filter((e) => e.severity === s && !e.dismissed).length})`}
            </button>
          ))}
        </div>
        <button onClick={() => setShowResolved((v) => !v)}
          className={`rounded-2xl px-4 py-2 text-sm font-bold transition-colors ${showResolved ? "border border-emerald-400/20 bg-emerald-500/10 text-emerald-200" : "border border-white/10 bg-white/5 text-white/50 hover:text-white"}`}>
          {showResolved ? <CheckCircle2 className="inline h-3.5 w-3.5 mr-1" /> : null}
          Show resolved
        </button>
        <div className="ml-auto relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events…"
            className="w-52 rounded-2xl border border-white/10 bg-[#071224] pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-blue-400" />
        </div>
      </div>

      {/* Event list */}
      {loading ? (
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-[24px] border border-white/5 bg-white/[0.03]" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-[28px] border border-white/10 bg-white/[0.04] py-20 text-center">
          <XCircle className="mx-auto h-10 w-10 text-white/10 mb-3" />
          <div className="text-white/40 font-bold">
            {events.length === 0
              ? "No AI events yet. Exceptions and alerts will appear here as they occur."
              : "No events match your filters."}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((e) => (
            <EventCard key={e.id} event={e} onResolve={resolve} onDismiss={dismiss} busy={busy} />
          ))}
        </div>
      )}
    </div>
  );
}
