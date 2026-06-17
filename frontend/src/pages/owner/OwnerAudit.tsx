import { useEffect, useMemo, useState } from "react";
import { Shield } from "lucide-react";
import { api } from "../../api/client";

type AuditRow = {
  id: string;
  action: string;
  actorEmail?: string | null;
  actorType?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  targetName?: string | null;
  metadata?: Record<string, any> | null;
  ip?: string | null;
  createdAt: string;
};

const ACTION_STYLE: Record<string, string> = {
  "tenant.approve": "border-emerald-400/20 bg-emerald-500/10 text-emerald-200",
  "request.approve": "border-emerald-400/20 bg-emerald-500/10 text-emerald-200",
  "tenant.suspend": "border-rose-400/20 bg-rose-500/10 text-rose-200",
  "tenant.reject": "border-rose-400/20 bg-rose-500/10 text-rose-200",
  "request.reject": "border-rose-400/20 bg-rose-500/10 text-rose-200",
  "tenant.plan_change": "border-blue-400/20 bg-blue-500/10 text-blue-200",
  "tenant.impersonate": "border-amber-400/20 bg-amber-500/10 text-amber-200",
};

function actionLabel(a: string) {
  return a.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function OwnerAudit() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res: any = await api.get("/owner/audit");
      const data = res?.data ?? res;
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load audit log.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.action, r.actorEmail, r.targetName, r.targetId].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [rows, filter]);

  return (
    <div className="space-y-6">
      <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-7 shadow-xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
          <Shield className="h-3.5 w-3.5" /> Compliance
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white">Audit Trail</h1>
            <p className="mt-2 max-w-3xl text-slate-300">
              Immutable record of privileged platform actions — tenant approvals, suspensions,
              plan changes, and view-as-tenant impersonation.
            </p>
          </div>
          <div className="flex gap-3">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by action, actor, tenant…"
              className="rounded-2xl border border-white/10 bg-[#071224] px-4 py-2.5 text-sm text-white outline-none focus:border-blue-400"
            />
            <button onClick={load} className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-2.5 text-sm font-bold text-cyan-200">
              Refresh
            </button>
          </div>
        </div>
        {error ? (
          <div className="mt-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
        ) : null}
      </div>

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
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-white/5 align-top">
                  <td className="px-3 py-3 whitespace-nowrap text-slate-300">
                    {new Date(r.createdAt).toLocaleString("en-ZA")}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${ACTION_STYLE[r.action] ?? "border-white/15 bg-white/5 text-white/80"}`}>
                      {actionLabel(r.action)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-300">{r.actorEmail || r.actorType || "—"}</td>
                  <td className="px-3 py-3 font-semibold text-white">{r.targetName || r.targetId || "—"}</td>
                  <td className="px-3 py-3 text-slate-400">
                    {r.metadata && Object.keys(r.metadata).length
                      ? Object.entries(r.metadata)
                          .map(([k, v]) => `${k}: ${v ?? "—"}`)
                          .join(", ")
                      : "—"}
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-slate-400">
                    No audit events yet. Owner actions (approve, suspend, plan change, impersonate) will appear here.
                  </td>
                </tr>
              ) : null}
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-slate-400">Loading audit trail…</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
