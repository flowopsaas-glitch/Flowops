import { useEffect, useMemo, useState } from "react";
import {
  MapPin, ShieldAlert, CheckCircle2, XCircle, AlertTriangle, Clock,
  RefreshCw, ChevronRight, Phone, Users, type LucideIcon,
} from "lucide-react";
import * as wp4 from "../api/wp4Api";
import BackButton from "../components/BackButton";

const STATUS_CLS: Record<string, string> = {
  REPORTED: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  CORROBORATED: "border-orange-500/30 bg-orange-500/10 text-orange-300",
  VERIFIED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  REJECTED: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  EXPIRED: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  WITHDRAWN: "border-slate-500/30 bg-slate-500/10 text-slate-300",
};

const TYPE_ICON: Record<string, LucideIcon> = {
  HIJACKING_ATTEMPT: Warnings,
  ROBBERY: AlertTriangle,
  ACCIDENT: Phone,
  ROAD_CLOSED: ChevronRight,
  VEHICLE_HAZARD: Phone,
  STRIKE_PROTEST: Users,
  WEATHER: AlertTriangle,
  OTHER: AlertTriangle,
};

const TYPE_LABEL: Record<string, string> = {
  HIJACKING_ATTEMPT: "Hijacking attempt",
  ROBBERY: "Robbery",
  ACCIDENT: "Accident",
  ROAD_CLOSED: "Road closed",
  VEHICLE_HAZARD: "Vehicle hazard",
  STRIKE_PROTEST: "Strike / protest",
  WEATHER: "Weather hazard",
  OTHER: "Other",
};

const SEVERITY_CLS: Record<string, string> = {
  CRITICAL: "text-rose-400 font-bold",
  HIGH: "text-amber-400 font-bold",
  MEDIUM: "text-orange-400",
  LOW: "text-slate-400",
};

export default function SafetyIncidentDispatch() {
  const [incidents, setIncidents] = useState<wp4.SafetyIncident[]>([]);
  const [filter, setFilter] = useState<"all" | "reported" | "corroborated">("all");
  const [loading, setLoading] = useState(true);
  [/* verifying */]
  const [verifying, setVerifying] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const incs = await wp4.wp4ListIncidents({ limit: 50 });
        if (alive) setIncidents(incs);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load incidents.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return incidents;
    return incidents.filter((i) => i.status === filter.toUpperCase());
  }, [incidents, filter]);

  const handleVerify = async (incident: wp4.SafetyIncident) => {
    setVerifying((prev) => new Set([...prev, incident.id]));
    try {
      await wp4.wp4VerifyIncident(incident.id, {
        verificationMethod: 'DISPATCH_CONFIRM',
        severity: incident.severity,
        radiusM: 3000,
        ttlHours: 6,
      });
      setIncidents((prev) => prev.map((i) =>
        i.id === incident.id ? { ...i, status: 'VERIFIED' as any } : i
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verify failed.");
    } finally {
      setVerifying((prev) => { const n = new Set(prev); n.delete(incident.id); return n; });
    }
  };

  const handleReject = async (incident: wp4.SafetyIncident) => {
    const reason = window.prompt("Rejection reason (NOT_THERE / ALREADY_CLEARED / DUPLICATE / MISCLASSIFIED / NOT_CREDIBLE / OTHER):");
    if (!reason) return;
    setVerifying((prev) => new Set([...prev, incident.id]));
    try {
      await wp4.wp4RejectIncident(incident.id, {
        rejectionReason: reason as any,
        rejectionNote: `Rejected via dispatch board`,
      });
      setIncidents((prev) => prev.map((i) =>
        i.id === incident.id ? { ...i, status: 'REJECTED' as any } : i
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reject failed.");
    } finally {
      setVerifying((prev) => { const n = new Set(prev); n.delete(incident.id); return n; });
    }
  };

  const handleCorroborate = async (incident: wp4.SafetyIncident) => {
    // Dispatch can corroborate using the incident's own location
    if (!incident.reportLat || !incident.reportLng) {
      setError("No location to corroborate from.");
      return;
    }
    // Find a driver — for now, use a placeholder; real UI would show the driver roster
    setError("Corroboration requires a second driver to report from the scene. Share this incident ID with them.");
  };

  const fmtTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  };

  const TYPE_COLOR: Record<string, string> = {
    HIJACKING_ATTEMPT: "text-rose-400",
    ROBBERY: "text-rose-400",
    ACCIDENT: "text-amber-400",
    ROAD_CLOSED: "text-amber-400",
    VEHICLE_HAZARD: "text-amber-400",
    STRIKE_PROTEST: "text-orange-400",
    WEATHER: "text-blue-400",
    OTHER: "text-slate-400",
  };

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(20,120,160,0.10),transparent_30%),linear-gradient(180deg,#07111f,#0b1530)] p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <BackButton to="/" />
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-400" />
              Safety incident dispatch
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setFilter("all");
                void window.location.reload();
              }}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-white hover:bg-slate-700"
            >
              <RefreshCw className={`h-4 w-4`} /> Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-rose-200 text-sm">
            <XCircle className="h-4 w-4 mr-2" /> {error}
          </div>
        )}

        {/* Filter */}
        <div className="flex gap-2">
          {[["all", "All"], ["reported", "Reported"], ["corroborated", "Corroborated"]] as [string, string][]}.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key as any)}
              className={`px-3 py-1.5 rounded text-xs border transition-colors ${
                filter === key
                  ? "border-cyan-500 bg-cyan-500/10 text-cyan-300"
                  : "border-slate-700 bg-slate-800/30 text-slate-400 hover:border-slate-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Summary */}
        <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-3">
          <div className="flex gap-6 text-sm">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Total</div>
              <div className="text-white font-mono">{incidents.length}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Awaiting verification</div>
              <div className="text-amber-400 font-mono">{filtered.filter(i => i.status === 'REPORTED').length}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Corroborated</div>
              <div className="text-orange-400 font-mono">{filtered.filter(i => i.status === 'CORROBORATED').length}</div>
            </div>
          </div>
        </div>

        {/* Incidents list */}
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          {loading ? (
            <div className="h-48 flex items-center justify-center text-slate-400">
              Loading incidents…
            </div>
          ) : filtered.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-slate-400">
              No incidents in this view.
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((inc) => {
                const Icon = TYPE_ICON[inc.type] || AlertTriangle;
                const isReported = inc.status === 'REPORTED';
                const isCorroborated = inc.status === 'CORROBORATED';
                return (
                  <article
                    key={inc.id}
                    className={`rounded-lg border p-3 hover:border-cyan-500/50 transition-colors ${inc.status === 'REPORTED' ? 'border-amber-500/30 bg-amber-500/5' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${TYPE_COLOR[inc.type]}`} />
                        <span className="font-medium text-slate-200">{TYPE_LABEL[inc.type]}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_CLS[inc.status]}`}>
                          {inc.status}
                        </span>
                        {isCorroborated && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] border border-orange-500/30 bg-orange-500/10 text-orange-300">
                            Corroborated
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">{fmtTime(inc.reportedAt)}</span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="text-sm text-slate-300 font-mono">
                            {inc.reportLat != null && inc.reportLng != null
                              ? `${inc.reportLat.toFixed(4)}, ${inc.reportLng.toFixed(4)}`
                              : "—"}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {inc.locationSource} • {inc.reportAccuracyM != null ? `±${inc.reportAccuracyM} m` : "accuracy unknown"}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-sm font-bold ${SEVERITY_CLS[inc.severity]}`}>{inc.severity}</div>
                          <div className="text-[10px] text-slate-500">Severity</div>
                        </div>
                      </div>

                      {inc.narrative && (
                        <div className="text-sm text-slate-400 italic">" {inc.narrative} "</div>
                      )}

                      {inc.reportedByDriver && (
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <Phone className="h-3 w-3" />
                          <span>Reported by {inc.reportedByDriver.name}</span>
                        </div>
                      )}

                      {inc.corroborations && inc.corroborations.length > 0 && (
                        <div className="flex items-center gap-2 text-xs text-orange-400">
                          <Users className="h-3 w-3" />
                          <span>{inc.corroborations.length} driver(s) corroborated</span>
                          {inc.corroborations[0] && (
                            <span className="ml-2">• {Math.round(inc.corroborations[0].distanceM)} m away</span>
                          )}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="mt-3 flex gap-2">
                        {isReported && (
                          <button
                            onClick={() => handleVerify(inc)}
                            disabled={verifying.has(inc.id)}
                            className="flex-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/30 rounded text-xs text-white disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {verifying.has(inc.id) ? "Verifying…" : "Verify → zone + alert"}
                          </button>
                        )}
                        {(isReported || isCorroborated) && (
                          <button
                            onClick={() => handleReject(inc)}
                            disabled={verifying.has(inc.id)}
                            className="flex-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded text-xs text-white disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Reject
                          </button>
                        )}
                        {isReported && (
                          <button
                            onClick={() => handleCorroborate(inc)}
                            className="flex-1 px-3 py-1.5 bg-slate-800 border border-slate-600 rounded text-xs text-slate-400 hover:bg-slate-700"
                          >
                            Corroborate
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {/* What this board is */}
        <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-3 text-xs text-slate-400">
          <ShieldAlert className="h-4 w-4 mr-2 inline" />
          A report is a claim; a zone is an assertion. Verifying creates a SafetyZone that
          alerts drivers within the radius. Rejected incidents require a named reason — no
          silent dismissals. Corroboration (second driver within 1 500 m / 45 min) raises
          priority but does not verify — a human verifies.
        </div>
      </div>
    </div>
  );
}
