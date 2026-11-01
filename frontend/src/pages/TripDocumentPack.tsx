import { useEffect, useMemo, useState } from "react";
import {
  FileText, Clock, ShieldAlert, Plus, RefreshCw, AlertTriangle,
  Mail, CheckCircle2, type LucideIcon,
} from "lucide-react";
import * as wp3 from "../api/wp3Api";
import BackButton from "../components/BackButton";

const STATUS_CLS: Record<string, string> = {
  HELD: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  MISSING: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  EXPIRED: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  NOT_APPLICABLE: "border-slate-500/30 bg-slate-500/10 text-slate-300",
};

const STATUS_ICON: Record<string, LucideIcon> = {
  HELD: CheckCircle2,
  MISSING: AlertTriangle,
  EXPIRED: Mail,
  NOT_APPLICABLE: ShieldAlert,
};

export default function TripDocumentPack() {
  const [docs, setDocs] = useState<wp3.TripDocument[]>([]);
  const [thresholds, setThresholds] = useState<wp3.DocumentThreshold[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await Promise.all([loadDocs(), loadThresholds()]);
      } catch (err) {
        if (alive)
          setError(err instanceof Error ? err.message : "Failed to load.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const loadDocs = async () => {
    const d = await wp3.wp3ListDocuments();
    setDocs(d);
  };

  const loadThresholds = async () => {
    const t = await wp3.wp3GetThresholds();
    setThresholds(t);
  };

  const handleCreate = async () => {
    setCreating(true);
    setError("");
    try {
      await wp3.wp3CreateDocument({
        tripId: `trip-${Date.now()}`,
        documentType: "Carnet de Passage",
        status: "HELD",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        evidenceRef: "",
      });
      await loadDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setCreating(false);
    }
  };

  const handleSweep = async () => {
    setSweeping(true);
    setError("");
    try {
      const result = await wp3.wp3SweepExpiryAlerts();
      setError(
        `Sweep complete: ${result.docsChecked} docs checked, ${result.expiredMarked} expired marked.`,
      );
      await loadDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sweep failed.");
    } finally {
      setSweeping(false);
    }
  };

  const handleStatusChange = async (doc: wp3.TripDocument, status: string) => {
    try {
      await wp3.wp3UpdateDocument(doc.id, { status });
      await loadDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    }
  };

  const expiredSoon = docs.filter(
    (d) =>
      d.status !== "EXPIRED" &&
      d.status !== "NOT_APPLICABLE" &&
      d.expiresAt &&
      new Date(d.expiresAt).getTime() - Date.now() <= 30 * 24 * 60 * 60 * 1000 &&
      new Date(d.expiresAt).getTime() > Date.now(),
  );

  const alreadyExpired = docs.filter(
    (d) => d.status === "EXPIRED" || (d.expiresAt && new Date(d.expiresAt).getTime() <= Date.now()),
  );

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(20,120,160,0.10),transparent_30%),linear-gradient(180deg,#07111f,#0b1530)] p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <BackButton to="/" />
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              <FileText className="h-5 w-5 text-cyan-300" />
              Trip Document Pack (WP3)
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSweep}
              disabled={sweeping}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-4 w-4 ${sweeping ? "animate-spin" : ""}`} />
              {sweeping ? "Sweeping…" : "Sweep for expiry alerts"}
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/30 rounded text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-4 w-4" /> Capture document
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-rose-200 text-sm">
            <AlertTriangle className="h-4 w-4 mr-2" /> {error}
          </div>
        )}

        {/* Expiry alerts banner */}
        {alreadyExpired.length > 0 || expiredSoon.length > 0 ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4">
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-rose-300 mt-0.5" />
              <div>
                <h3 className="font-semibold text-rose-300 flex items-center gap-2">
                  {alreadyExpired.length > 0 ? "Expired documents" : ""}
                  {expiredSoon.length > 0 ? "Expiring soon" : ""}
                </h3>
                <p className="text-sm text-rose-200 mt-1">
                  {alreadyExpired.length > 0
                    ? `${alreadyExpired.length} document(s) have expired — an alert has been published on the outbox and gateway.`
                    : ""}
                  {expiredSoon.length > 0
                    ? `${expiredSoon.length} document(s) expire within 30 days — threshold alerts are active.`
                    : ""}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {/* Documents table */}
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white">Documents</h3>
            <p className="text-xs text-slate-400">{docs.length} document(s)</p>
          </div>

          {loading ? (
            <div className="h-32 flex items-center justify-center text-slate-400">
              Loading documents…
            </div>
          ) : docs.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-slate-400">
              No documents yet. Capture a document for a trip to begin.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="pb-2 text-xs uppercase tracking-wider text-slate-400 font-semibold">Document</th>
                    <th className="pb-2 text-xs uppercase tracking-wider text-slate-400 font-semibold">Status</th>
                    <th className="pb-2 text-xs uppercase tracking-wider text-slate-400 font-semibold">Expires</th>
                    <th className="pb-2 text-xs uppercase tracking-wider text-slate-400 font-semibold">Captured by</th>
                    <th className="pb-2 text-xs uppercase tracking-wider text-slate-400 font-semibold">Evidence</th>
                    <th className="pb-2 text-xs uppercase tracking-wider text-slate-400 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {docs.map((d) => {
                    const daysLeft = d.expiresAt
                      ? Math.ceil(
                          (new Date(d.expiresAt).getTime() - Date.now()) /
                          (1000 * 60 * 60 * 24),
                        )
                      : null;
                    return (
                      <tr key={d.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2.5">
                          <div className="font-medium text-slate-200">{d.documentType}</div>
                          <div className="text-[10px] text-slate-500">Trip {d.tripId.slice(-6)}</div>
                        </td>
                        <td className="py-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${STATUS_CLS[d.status]}`}>
                            {d.status}
                          </span>
                          {daysLeft != null && d.status === "HELD" && daysLeft <= 30 && (
                            <div className="text-[10px] text-rose-300 mt-0.5">
                              {daysLeft <= 0 ? "Expired" : `${daysLeft} days left`}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5">
                          <span className="font-mono text-slate-200">
                            {d.expiresAt ? new Date(d.expiresAt).toLocaleDateString() : "—"}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-300">{d.capturedBy ?? "—"}</td>
                        <td className="py-2.5 text-slate-300">
                          {d.evidenceRef ?? "—"}
                        </td>
                        <td className="py-2.5">
                          <select
                            value={d.status}
                            onChange={(e) => handleStatusChange(d, e.target.value)}
                            className="bg-slate-900 border border-slate-600 rounded text-[10px] text-white px-2 py-1 focus:ring-1 focus:ring-cyan-500"
                          >
                            <option value="HELD">HELD</option>
                            <option value="MISSING">MISSING</option>
                            <option value="EXPIRED">EXPIRED</option>
                            <option value="NOT_APPLICABLE">NOT_APPLICABLE</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Thresholds */}
        <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Expiry alert thresholds</h3>
            <p className="text-xs text-slate-400">Days before expiry to alert</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {thresholds.length > 0 ? (
              thresholds.map((t) => (
                <div key={t.id} className="p-3 rounded-lg border border-slate-700 bg-slate-800/30">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-300">
                      {t.documentType ?? "All documents"}
                    </span>
                    <span className="text-[10px] text-cyan-300 font-mono">{t.thresholdDays} days</span>
                  </div>
                  <p className="text-[10px] text-slate-500">Active: {t.isActive ? "yes" : "no"}</p>
                </div>
              ))
            ) : (
              <div className="p-3 rounded-lg border border-slate-700 bg-slate-800/30 text-center">
                <p className="text-xs text-slate-500">No thresholds configured — defaults apply (30 / 14 / 3 days)</p>
              </div>
            )}
          </div>
          <p className="text-[10px] text-slate-500 mt-3">
            Thresholds are per-company and configurable downwards only. Alerts
            fire on the outbox, gateway socket, and notification row — no
            quiet-hours deferral. An expiring permit at 23:00 is still
            expiring.
          </p>
        </div>

        {/* What this pack is */}
        <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-3 text-xs text-slate-400">
          <ShieldAlert className="h-4 w-4 mr-2 inline" />
          This pack records what the operator holds. It does not file anything
          with SARS, ASYCUDA, PAPSS or any other authority. Reference data
          from the SADC corridor service is shown as "typically required —
          verify", never as "required".
        </div>
      </div>
    </div>
  );
}
