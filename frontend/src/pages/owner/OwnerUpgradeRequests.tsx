import { errorMessageOf } from "@/components/patterns/errorMessage";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2, ArrowUpCircle, RefreshCw, Clock } from "lucide-react";
import { api } from "../../api/client";

// ── Types ──────────────────────────────────────────────────────────────────
type UpgradeRequest = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  currentPlan: string;
  requestedPlan: string;
  requestedByEmail?: string | null;
  note?: string | null;
  decisionNote?: string | null;
  reviewedByEmail?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  company?: { name?: string | null; email?: string | null; plan?: string | null } | null;
};

function unwrap<T>(r: unknown): T { return ((r as { data?: T } | null)?.data ?? r) as T; }

const PLAN_LABEL: Record<string, string> = {
  starter: "Starter",
  professional: "Professional — 3 drivers",
  professional_10: "Professional — 10 drivers",
  professional_25: "Professional — 25 drivers",
  professional_50: "Professional — 50 drivers",
  enterprise: "Enterprise",
};

const STATUS_STYLE: Record<string, string> = {
  PENDING: "border-amber-400/30 bg-amber-500/10 text-amber-300",
  APPROVED: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
  REJECTED: "border-rose-400/30 bg-rose-500/10 text-rose-300",
};

const planName = (k?: string | null) => (k ? PLAN_LABEL[k] ?? k : "—");
const shortDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export default function OwnerUpgradeRequests() {
  const [rows, setRows] = useState<UpgradeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => (async () => {
    const r = await api.get("/owner/plan-upgrade-requests");
    const list = unwrap<UpgradeRequest[]>(r);
    setRows(Array.isArray(list) ? list : []);
    setError(null);

  })().catch((e: unknown) => {
    setError(errorMessageOf(e) || "Could not load upgrade requests.");

  }).finally(() => {
    setLoading(false);

  }), []);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async (id: string) => {
    setBusy(id);
        try {
      await api.post(`/owner/plan-upgrade-requests/${id}/approve`);
      await load();
    } catch (e) {
      setError(errorMessageOf(e) || "Could not approve.");
    } finally {
      setBusy(null);
    }
  };

  const decline = async (id: string) => {
    const reason = window.prompt("Reason for declining (optional — shown to the tenant):") ?? undefined;
    setBusy(id);
    try {
      await api.post(`/owner/plan-upgrade-requests/${id}/decline`, { reason });
      await load();
    } catch (e) {
      setError(errorMessageOf(e) || "Could not decline.");
    } finally {
      setBusy(null);
    }
  };

  const pending = rows.filter((r) => r.status === "PENDING");
  const history = rows.filter((r) => r.status !== "PENDING");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-sky-500/15 ring-1 ring-sky-500/25">
            <ArrowUpCircle className="h-6 w-6 text-sky-300" />
          </div>
          <div>
            <h1 className="text-2xl font-black">Plan Upgrade Requests</h1>
            <p className="text-sm text-white/50">Approve or decline tenant-initiated plan upgrades. Approval activates the tier immediately.</p>
          </div>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/70 hover:bg-white/10"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200">
          {error}
        </div>
      )}

      {/* Pending */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-white/45">
          <Clock className="h-4 w-4 text-amber-300" /> Awaiting your approval ({pending.length})
        </h2>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-white/30" /></div>
        ) : pending.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 py-10 text-center text-sm text-white/35">
            No pending upgrade requests.
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((r) => (
              <div key={r.id} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-black text-white">{r.company?.name ?? "Unknown tenant"}</span>
                      <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLE[r.status]}`}>
                        {r.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-white/70">
                      <span className="text-white/45">{planName(r.currentPlan)}</span>
                      <span className="mx-2 text-white/30">→</span>
                      <span className="font-bold text-sky-300">{planName(r.requestedPlan)}</span>
                    </p>
                    <p className="mt-1 text-xs text-white/40">
                      Requested {shortDate(r.createdAt)}{r.requestedByEmail ? ` · by ${r.requestedByEmail}` : ""}
                    </p>
                    {r.note && (
                      <p className="mt-2 rounded-lg border border-white/8 bg-black/20 px-3 py-2 text-xs text-white/60">
                        “{r.note}”
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => approve(r.id)}
                      disabled={busy === r.id}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/90 px-4 py-2 text-sm font-black text-black hover:bg-emerald-400 disabled:opacity-50"
                    >
                      {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Approve
                    </button>
                    <button
                      onClick={() => decline(r.id)}
                      disabled={busy === r.id}
                      className="inline-flex items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm font-bold text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" /> Decline
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div>
          <h2 className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-white/45">History</h2>
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/5 text-[11px] uppercase tracking-widest text-white/40">
                <tr>
                  <th className="px-4 py-3">Tenant</th>
                  <th className="px-4 py-3">Change</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Reviewed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {history.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-semibold text-white/80">{r.company?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-white/60">{planName(r.currentPlan)} → {planName(r.requestedPlan)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLE[r.status]}`}>
                        {r.status}
                      </span>
                      {r.decisionNote && <span className="ml-2 text-xs text-white/35">{r.decisionNote}</span>}
                    </td>
                    <td className="px-4 py-3 text-white/45">{shortDate(r.reviewedAt)}{r.reviewedByEmail ? ` · ${r.reviewedByEmail}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
