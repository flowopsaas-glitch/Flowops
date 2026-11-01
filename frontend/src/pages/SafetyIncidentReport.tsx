import { useEffect, useState, useCallback } from "react";
import {
  MapPin, AlertTriangle, ShieldAlert, Send, Clock, X, Phone,
  ChevronLeft, Activity, Warnings, type LucideIcon,
} from "lucide-react";
import * as wp4 from "../api/wp4Api";
import BackButton from "../components/BackButton";

const INCIDENT_TYPES: Array<{
  value: string;
  label: string;
  icon: LucideIcon;
  color: string;
}> = [
  { value: 'HIJACKING_ATTEMPT', label: 'Hijacking attempt', icon: Warnings, color: 'text-rose-400' },
  { value: 'ROBBERY', label: 'Robbery', icon: AlertTriangle, color: 'text-rose-400' },
  { value: 'ACCIDENT', label: 'Accident', icon: Activity, color: 'text-amber-400' },
  { value: 'ROAD_CLOSED', label: 'Road closed', icon: ChevronLeft, color: 'text-amber-400' },
  { value: 'VEHICLE_HAZARD', label: 'Vehicle hazard', icon: Phone, color: 'text-amber-400' },
  { value: 'STRIKE_PROTEST', label: 'Strike / protest', icon: Activity, color: 'text-orange-400' },
  { value: 'WEATHER', label: 'Weather hazard', icon: Warnings, color: 'text-blue-400' },
  { value: 'OTHER', label: 'Other', icon: AlertTriangle, color: 'text-slate-400' },
];

const LOCATION_SOURCES: Array<{ value: string; label: string; hint: string }> = [
  { value: 'DEVICE_GPS', label: 'Device GPS', hint: 'Live fix from your phone' },
  { value: 'MAP_PIN', label: 'Map pin', hint: 'Dropped on the map — not a GPS fix' },
  { value: 'LAST_KNOWN', label: 'Last known', hint: 'Your last recorded position' },
];

type LocationSource = 'DEVICE_GPS' | 'MAP_PIN' | 'LAST_KNOWN';

export default function SafetyIncidentReport() {
  const [selectedType, setSelectedType] = useState<string>('HIJACKING_ATTEMPT');
  const [narrative, setNarrative] = useState("");
  const [locationSource, setLocationSource] = useState<LocationSource>('DEVICE_GPS');
  const [reportLat, setReportLat] = useState<number | null>(null);
  const [reportLng, setReportLng] = useState<number | null>(null);
  const [reportAccuracyM, setReportAccuracyM] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  [/* submitting */]
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  // ── Try to get device location ──
  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Your browser doesn't support geolocation — use map pin or last known.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setReportLat(pos.coords.latitude);
        setReportLng(pos.coords.longitude);
        setReportAccuracyM(pos.coords.accuracy);
        setLocationSource('DEVICE_GPS');
      },
      (err) => {
        // Silent — user can still use map pin or last known
        setError("Couldn't get device location — you can still report with a map pin.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, []);

  const idempotencyKey = `report:${Date.now()}:${selectedType}:${Math.floor(Math.random() * 1000000)}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    if (reportLat == null || reportLng == null) {
      setError("A location is required — use device GPS or map pin.");
      setSubmitting(false);
      return;
    }

    try {
      await wp4.wp4ReportIncident({
        type: selectedType,
        reportLat,
        reportLng,
        reportAccuracyM: reportAccuracyM ?? undefined,
        locationSource,
        narrative: narrative || undefined,
        idempotencyKey,
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report failed — try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-full bg-[#07111f] p-4 sm:p-6">
        <div className="mx-auto max-w-md space-y-6">
          <BackButton to="/" />
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
            <ShieldAlert className="h-12 w-12 text-emerald-400 mx-auto mb-4" />
            <h2 className="text-xl font-black text-white">Report sent</h2>
            <p className="text-emerald-200 mt-2">
              Your report has been filed with your dispatcher. Other drivers are
              <strong>not</strong> being alerted yet — a named human verifies first.
            </p>
          </div>
          <button
            onClick={() => window.location.href = "/"}
            className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded text-white hover:bg-slate-700"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(20,120,160,0.10),transparent_30%),linear-gradient(180deg,#07111f,#0b1530)] p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <BackButton to="/" />
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-400" />
            Report safety incident
          </h1>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-rose-200 text-sm">
            <X className="h-4 w-4 mr-2" /> {error}
          </div>
        )}

        {/* What this does */}
        <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-4">
          <h3 className="text-sm font-semibold text-cyan-300 mb-2">One tap — your dispatcher sees it first</h3>
          <p className="text-sm text-slate-300">
            This files a <strong>claim</strong> with your dispatcher. Other drivers are not
            alerted until a named human verifies it. Your location is stored with accuracy —
            it is nulled after 90 days on closed incidents.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Incident type */}
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider font-semibold text-slate-400">What happened</label>
            <div className="grid grid-cols-2 gap-2">
              {INCIDENT_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setSelectedType(t.value)}
                  className={`flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-lg border transition-colors ${
                    selectedType === t.value
                      ? `border-${t.color.split('-')[1] ?? 'rose'}-500 bg-${t.color.split('-')[1] ?? 'rose'}-500/10 text-white`
                      : "border-slate-700 bg-slate-800/30 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  <t.icon className={`h-5 w-5 ${t.color}`} />
                  <span className="text-xs font-medium">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Location source */}
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider font-semibold text-slate-400">Location source</label>
            <div className="grid grid-cols-3 gap-2">
              {LOCATION_SOURCES.map((ls) => (
                <button
                  key={ls.value}
                  type="button"
                  onClick={() => setLocationSource(ls.value as LocationSource)}
                  className={`px-3 py-2 rounded-lg border text-xs transition-colors ${
                    locationSource === ls.value
                      ? "border-cyan-500 bg-cyan-500/10 text-cyan-300"
                      : "border-slate-700 bg-slate-800/30 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  <span className="font-medium">{ls.label}</span>
                  <span className="text-[10px] opacity-70 block">{ls.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* GPS coordinates (read-only display) */}
          {reportLat != null && (
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider font-semibold text-slate-400">Your position (device GPS)</label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/50">
                <MapPin className="h-4 w-4 text-slate-400" />
                <span className="text-sm text-slate-200 font-mono">
                  {reportLat.toFixed(5)}, {reportLng.toFixed(5)}
                </span>
                {reportAccuracyM != null && (
                  <span className="ml-2 text-[10px] text-slate-500">
                    ±{reportAccuracyM} m
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Narrative */}
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wider font-semibold text-slate-400">Add a note (optional)</label>
            <textarea
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              placeholder="e.g. Suspicious white van, no plates, N1 southbound"
              maxLength={280}
              rows={3}
              className="w-full bg-slate-900 border border-slate-700 rounded text-xs text-white px-3 py-2 focus:ring-1 focus:ring-cyan-500"
            />
            <span className="text-[10px] text-slate-500">
              {narrative.length}/280 characters — never required
            </span>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || !reportLat || !reportLng}
            className={`w-full px-4 py-3 rounded-lg font-bold text-white transition-colors ${
              submitting || !reportLat || !reportLng
                ? "bg-slate-700 border border-slate-600 text-slate-500 cursor-not-allowed"
                : "bg-rose-600 hover:bg-rose-500 border border-rose-500/30"
            }`}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Clock className="h-4 w-4 animate-spin" /> Sending…
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Send className="h-4 w-4" /> Send report to dispatcher
              </span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
