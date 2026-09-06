import { useState, useEffect } from "react";
import {
  Loader2, CheckCircle2, XCircle, Clock, Shield, RefreshCw,
  User, Building2, Mail, Calendar, Sparkles, AlertTriangle,
} from "lucide-react";
import { api } from "../api/client";

interface ApprovalRequest {
  id: string;
  fullName: string;
  email: string;
  company: string;
  phone?: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  updatedAt?: string;
}

const STATUS_STYLE: Record<string, { cls: string; icon: typeof Clock; text: string }> = {
  PENDING:  { cls: "border-amber-500/30 bg-amber-500/10 text-amber-300", icon: Clock,        text: "Pending" },
  APPROVED: { cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", icon: CheckCircle2, text: "Approved" },
  REJECTED: { cls: "border-red-500/30 bg-red-500/10 text-red-300", icon: XCircle,      text: "Rejected" },
};

function StatusChip({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.PENDING;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${s.cls}`}>
      <Icon className="h-3 w-3" /> {s.text}
    </span>
  );
}

function KpiCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5 text-center">
      <div className={`text-3xl font-black ${color}`}>{value}</div>
      <div className="mt-1 text-[11px] font-bold uppercase tracking-wider text-white/40">{label}</div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function AdminApprovalDashboard() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ApprovalRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("PENDING");
  const [refreshing, setRefreshing] = useState(false);

  const load = async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const res: any = await api.get("/admin/approval-requests");
      const data = Array.isArray(res) ? res : res?.data ?? [];
      setRequests(data);
    } catch {
      setError("Failed to load approval requests");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void load("initial"); }, []);

  const handleApprove = async (id: string) => {
    setActionLoading(true);
    setError("");
    try {
      await api.post(`/admin/approval-requests/${id}/approve`, {});
      setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: "APPROVED" } : r));
      setSelected(null);
    } catch (e: any) {
      setError(e?.message ?? "Approve failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (id: string) => {
    if (!rejectionReason.trim()) { setError("Please provide a rejection reason"); return; }
    setActionLoading(true);
    setError("");
    try {
      await api.post(`/admin/approval-requests/${id}/reject`, { reason: rejectionReason });
      setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: "REJECTED" } : r));
      setSelected(null);
      setRejectionReason("");
    } catch (e: any) {
      setError(e?.message ?? "Reject failed");
    } finally {
      setActionLoading(false);
    }
  };

  const filtered = requests.filter((r) => filter === "ALL" || r.status === filter);
  const pending = requests.filter((r) => r.status === "PENDING").length;
  const approved = requests.filter((r) => r.status === "APPROVED").length;
  const rejected = requests.filter((r) => r.status === "REJECTED").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl border border-sky-500/25 bg-sky-500/10">
            <Shield className="h-6 w-6 text-sky-300" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Approval Queue</h1>
            <p className="text-sm text-white/40">Review and approve new tenant workspace requests</p>
          </div>
        </div>
        <button
          onClick={() => void load("refresh")}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white/60 hover:bg-white/10 hover:text-white transition disabled:opacity-40"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-500/25 bg-red-500/8 px-5 py-3 text-sm text-red-200">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" /> {error}
          <button onClick={() => setError("")} className="ml-auto text-red-400 hover:text-red-200 text-xs font-bold">Dismiss</button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard value={pending} label="Pending" color="text-amber-300" />
        <KpiCard value={approved} label="Approved" color="text-emerald-300" />
        <KpiCard value={rejected} label="Rejected" color="text-red-300" />
        <KpiCard value={requests.length} label="Total" color="text-white" />
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        {(["ALL", "PENDING", "APPROVED", "REJECTED"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider transition ${
              filter === f
                ? "border border-sky-500/30 bg-sky-500/15 text-sky-200"
                : "border border-white/8 bg-white/[0.03] text-white/40 hover:bg-white/8 hover:text-white/70"
            }`}
          >
            {f}
          </button>
        ))}
        <span className="ml-auto text-[11px] font-bold text-white/25">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Request list */}
        <div className="lg:col-span-3 space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-white/10 py-16 text-center">
              <Sparkles className="h-8 w-8 text-white/10 mx-auto mb-3" />
              <p className="text-sm text-white/25 font-bold">No {filter !== "ALL" ? filter.toLowerCase() : ""} requests</p>
            </div>
          ) : (
            filtered.map((req) => (
              <button
                key={req.id}
                onClick={() => setSelected(req)}
                className={`w-full rounded-[20px] border p-5 text-left transition ${
                  selected?.id === req.id
                    ? "border-sky-500/40 bg-sky-500/8 ring-1 ring-sky-500/20"
                    : "border-white/8 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.06]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5">
                        <User className="h-4 w-4 text-white/50" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-black text-white truncate">{req.fullName}</div>
                        <div className="text-xs text-white/40 truncate">{req.email}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-3 text-[11px] text-white/35">
                      <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {req.company}</span>
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {timeAgo(req.createdAt)}</span>
                    </div>
                  </div>
                  <StatusChip status={req.status} />
                </div>
              </button>
            ))
          )}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2">
          {selected ? (
            <div className="sticky top-6 rounded-[24px] border border-white/10 bg-white/[0.04] p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-wider text-white/50">Request Details</h3>
                <StatusChip status={selected.status} />
              </div>

              <div className="space-y-4">
                {[
                  { icon: User, label: "Full Name", value: selected.fullName },
                  { icon: Mail, label: "Email", value: selected.email },
                  { icon: Building2, label: "Company", value: selected.company },
                  { icon: Calendar, label: "Requested", value: new Date(selected.createdAt).toLocaleString("en-ZA") },
                ].map((field) => (
                  <div key={field.label}>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/30 mb-1">
                      <field.icon className="h-3 w-3" /> {field.label}
                    </div>
                    <div className="text-sm font-medium text-white/80">{field.value}</div>
                  </div>
                ))}
              </div>

              {selected.status === "PENDING" && (
                <div className="space-y-4 border-t border-white/8 pt-5">
                  {/* Rejection reason */}
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-white/30 mb-1.5 block">
                      Rejection reason (if rejecting)
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Provide a reason..."
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white placeholder-white/25 focus:border-sky-500/40 focus:outline-none focus:ring-1 focus:ring-sky-500/20 resize-none"
                    />
                  </div>

                  {/* Action buttons */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleApprove(selected.id)}
                      disabled={actionLoading}
                      className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/15 py-3 text-sm font-black text-emerald-200 transition hover:bg-emerald-500/25 disabled:opacity-40"
                    >
                      {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(selected.id)}
                      disabled={actionLoading}
                      className="flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/15 py-3 text-sm font-black text-red-200 transition hover:bg-red-500/25 disabled:opacity-40"
                    >
                      {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                      Reject
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="sticky top-6 rounded-[24px] border border-dashed border-white/10 py-20 text-center">
              <User className="h-8 w-8 text-white/10 mx-auto mb-3" />
              <p className="text-sm text-white/25">Select a request to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
