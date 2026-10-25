import { errorMessageOf } from "@/components/patterns/errorMessage";
import { useEffect, useMemo, useState } from "react";
import { Download, Filter, Shield } from "lucide-react";
import { api } from "../../api/client";

type AuditRow = {
  id: string;
  action: string;
  actorEmail?: string | null;
  actorType?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  targetName?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  createdAt: string;
};

const ACTION_STYLE: Record<string, string> = {
  "tenant.approve":    "border-emerald-400/20 bg-emerald-500/10 text-emerald-200",
  "tenant.activate":   "border-emerald-400/20 bg-emerald-500/10 text-emerald-200",
  "request.approve":   "border-emerald-400/20 bg-emerald-500/10 text-emerald-200",
  "tenant.suspend":    "border-rose-400/20 bg-rose-500/10 text-rose-200",
  "tenant.reject":     "border-rose-400/20 bg-rose-500/10 text-rose-200",
  "request.reject":    "border-rose-400/20 bg-rose-500/10 text-rose-200",
  "tenant.plan_change":"border-blue-400/20 bg-blue-500/10 text-blue-200",
  "tenant.impersonate":"border-amber-400/20 bg-amber-500/10 text-amber-200",
  "user.password_reset":"border-orange-400/20 bg-orange-500/10 text-orange-200",
  "user.create":       "border-cyan-400/20 bg-cyan-500/10 text-cyan-200",
  "alert.churn":       "border-rose-400/20 bg-rose-500/10 text-rose-200",
  "alert.sla_spike":   "border-amber-400/20 bg-amber-500/10 text-amber-200",
  "alert.payment_failure":"border-amber-400/20 bg-amber-500/10 text-amber-200",
};

const ACTION_CATEGORIES: Record<string, string[]> = {
  "Tenant lifecycle": ["tenant.approve","tenant.activate","tenant.suspend","tenant.reject","tenant.plan_change"],
  "User management":  ["user.create","user.password_reset","tenant.impersonate"],
  "Requests":         ["request.approve","request.reject"],
  "System alerts":    ["alert.churn","alert.sla_spike","alert.payment_failure"],
};

function actionLabel(a: string) {
  return a.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Converts the audit rows to a CSV blob and triggers download. */
function exportCsv(rows: AuditRow[]) {
  const header = ["When","Action","Actor","Target","Type","Details"];
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = rows.map((r) => [
    new Date(r.createdAt).toLocaleString("en-ZA"),
    r.action,
    r.actorEmail || r.actorType || "",
    r.targetName || r.targetId || "",
    r.targetType || "",
    r.metadata ? Object.entries(r.metadata).map(([k, v]) => `${k}:${v}`).join("; ") : "",
  ].map(escape).join(","));
  const csv = [header.join(","), ...lines].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function OwnerAudit() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [textFilter, setTextFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  async function load() {
  return (async () => {
    const res = await api.get("/owner/audit");
    const data = res?.data ?? res;
    setRows(Array.isArray(data) ? data : []);
    setError("");

  })().catch((err: unknown) => {
    setError(errorMessageOf(err) || "Failed to load audit log.");

  }).finally(() => {
    setLoading(false);

  });
}

  useEffect(() => { void load(); }, []);

  // All unique actions for the filter dropdown
  const allActions = useMemo(() => Array.from(new Set(rows.map((r) => r.action))).sort(), [rows]);

  // Computed stats
  const stats = useMemo(() => {
    const byAction: Record<string, number> = {};
    rows.forEach((r) => { byAction[r.action] = (byAction[r.action] ?? 0) + 1; });
    const topAction = Object.entries(byAction).sort((a, b) => b[1] - a[1])[0];
    return {
      total: rows.length,
      byCategory: Object.entries(ACTION_CATEGORIES).map(([cat, actions]) => ({
        cat,
        count: rows.filter((r) => actions.includes(r.action)).length,
      })),
      topAction: topAction ? `${actionLabel(topAction[0])} (${topAction[1]})` : "—",
      impersonations: rows.filter((r) => r.action === "tenant.impersonate").length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (actionFilter !== "all" && r.action !== actionFilter) return false;
      if (fromDate) {
        const d = new Date(fromDate); d.setHours(0, 0, 0, 0);
        if (new Date(r.createdAt) < d) return false;
      }
      if (toDate) {
        const d = new Date(toDate); d.setHours(23, 59, 59, 999);
        if (new Date(r.createdAt) > d) return false;
      }
      if (textFilter.trim()) {
        const q = textFilter.trim().toLowerCase();
        const text = [r.action, r.actorEmail, r.targetName, r.targetId].filter(Boolean).join(" ").toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [rows, textFilter, actionFilter, fromDate, toDate]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-7 shadow-xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
          <Shield className="h-3.5 w-3.5" /> Compliance
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white">Audit Trail</h1>
            <p className="mt-2 max-w-3xl text-slate-300">
              Immutable record of every privileged platform action — approvals, suspensions, plan changes, impersonation, password resets.
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => exportCsv(filtered)}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10">
              <Download className="h-4 w-4" /> Export CSV
            </button>
            <button onClick={load}
              className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-2.5 text-sm font-bold text-cyan-200">
              Refresh
            </button>
          </div>
        </div>
        {error ? <div className="mt-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
      </div>

      {/* Stats strip */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">Total Events</div>
          <div className="mt-1.5 text-3xl font-black text-white">{stats.total}</div>
        </div>
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/5 p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-200/60">Impersonations</div>
          <div className="mt-1.5 text-3xl font-black text-amber-200">{stats.impersonations}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">Most Common</div>
          <div className="mt-1.5 text-sm font-bold text-white truncate">{stats.topAction}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">Showing</div>
          <div className="mt-1.5 text-3xl font-black text-white">{filtered.length}</div>
          <div className="text-xs text-slate-400">of {stats.total}</div>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="grid gap-3 md:grid-cols-4">
        {stats.byCategory.map(({ cat, count }) => (
          <div key={cat} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-white/40">{cat}</div>
            <div className="mt-1 text-2xl font-black text-white">{count}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="rounded-[24px] border border-white/10 bg-white/[0.04] px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-white/40">
            <Filter className="h-3.5 w-3.5" /> Filters
          </div>
          {/* Text search */}
          <input value={textFilter} onChange={(e) => setTextFilter(e.target.value)}
            placeholder="Search actor, tenant, action…"
            className="rounded-xl border border-white/10 bg-[#071224] px-3 py-2 text-sm text-white outline-none focus:border-blue-400 w-52" />
          {/* Action dropdown */}
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-xl border border-white/10 bg-[#071224] px-3 py-2 text-sm text-white outline-none focus:border-blue-400">
            <option value="all">All actions</option>
            {allActions.map((a) => (
              <option key={a} value={a}>{actionLabel(a)}</option>
            ))}
          </select>
          {/* Date range */}
          <div className="flex items-center gap-2 text-sm text-white/50">
            <span className="text-xs">From</span>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
              className="rounded-xl border border-white/10 bg-[#071224] px-3 py-2 text-sm text-white outline-none focus:border-blue-400" />
            <span className="text-xs">To</span>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
              className="rounded-xl border border-white/10 bg-[#071224] px-3 py-2 text-sm text-white outline-none focus:border-blue-400" />
          </div>
          {(textFilter || actionFilter !== "all" || fromDate || toDate) ? (
            <button onClick={() => { setTextFilter(""); setActionFilter("all"); setFromDate(""); setToDate(""); }}
              className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-200 hover:bg-rose-500/20">
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[11px] uppercase tracking-[0.16em] text-white/50">
                <th className="px-3 py-3">When</th>
                <th className="px-3 py-3">Action</th>
                <th className="px-3 py-3">Actor</th>
                <th className="px-3 py-3">Target</th>
                <th className="px-3 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-3 py-10 text-center text-slate-400">Loading audit trail…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-10 text-center text-slate-400">
                  {rows.length === 0
                    ? "No audit events yet. Owner actions will appear here."
                    : "No events match the current filters."}
                </td></tr>
              ) : filtered.map((r) => (
                <tr key={r.id} className="border-b border-white/5 align-top hover:bg-white/[0.02]">
                  <td className="px-3 py-3 whitespace-nowrap text-slate-300 text-xs">
                    {new Date(r.createdAt).toLocaleString("en-ZA")}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${ACTION_STYLE[r.action] ?? "border-white/15 bg-white/5 text-white/80"}`}>
                      {actionLabel(r.action)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-300">{r.actorEmail || r.actorType || "—"}</td>
                  <td className="px-3 py-3">
                    <div className="font-semibold text-white">{r.targetName || r.targetId || "—"}</div>
                    {r.targetType ? <div className="text-xs text-slate-500 capitalize">{r.targetType}</div> : null}
                  </td>
                  <td className="px-3 py-3 text-slate-400 text-xs max-w-xs truncate">
                    {r.metadata && Object.keys(r.metadata).length
                      ? Object.entries(r.metadata).map(([k, v]) => `${k}: ${v ?? "—"}`).join(" · ")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
