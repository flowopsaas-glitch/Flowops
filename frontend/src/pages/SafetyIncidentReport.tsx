import React, { useState } from "react";
import {
  AlertTriangle, ShieldAlert, MapPin, Send, FileText, Plus,
  ArrowLeft, Truck,
} from "lucide-react";
import { api } from "../api/client";

type IncidentType =
  | "SUSPICIOUS_PERSON" | "SUSPICIOUS_VEHICLE" | "ROAD_BLOCKAGE" | "ACCIDENT"
  | "CRIME_HOTSPOT" | "POLICE_CHECKPOINT" | "PROTEST_BLOCKADE" | "WEATHER_HAZARD"
  | "OTHER";

const INCIDENT_TYPES: { value: IncidentType; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }> }[] = [
  { value: "SUSPICIOUS_PERSON", label: "Suspicious Person", icon: AlertTriangle },
  { value: "SUSPICIOUS_VEHICLE", label: "Suspicious Vehicle", icon: Truck },
  { value: "ROAD_BLOCKAGE", label: "Road Blockage", icon: MapPin },
  { value: "ACCIDENT", label: "Accident", icon: ShieldAlert },
  { value: "CRIME_HOTSPOT", label: "Crime Hotspot", icon: AlertTriangle },
  { value: "POLICE_CHECKPOINT", label: "Police Checkpoint", icon: ShieldAlert },
  { value: "PROTEST_BLOCKADE", label: "Protest Blockade", icon: Plus },
  { value: "WEATHER_HAZARD", label: "Weather Hazard", icon: Cloud },
  { value: "OTHER", label: "Other", icon: FileText },
];

const SEVERITY_LEVELS: { value: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; label: string; color: string }[] = [
  { value: "LOW", label: "Low", color: "bg-green-100 text-green-800" },
  { value: "MEDIUM", label: "Medium", color: "bg-blue-100 text-blue-800" },
  { value: "HIGH", label: "High", color: "bg-amber-100 text-amber-800" },
  { value: "CRITICAL", label: "Critical", color: "bg-red-100 text-red-800" },
];

function Cloud({ size, strokeWidth, className }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={className}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20m0 0A2.5 2.5 0 0 1 19.5 21v-10A2.5 2.5 0 0 0 17 8.5h-10A2.5 2.5 0 0 1 4.5 5M4.5 5v10A2.5 2.5 0 0 0 7 17.5h10A2.5 2.5 0 0 0 19.5 15m0 0v-2.5a2.5 2.5 0 0 1 2.5 2.5m0 0v2.5a2.5 2.5 0 0 0-2.5-2.5m-5 0a2.5 2.5 0 0 1-2.5-2.5m0 0a2.5 2.5 0 0 0 2.5-2.5m-10 0a2.5 2.5 0 0 1-2.5 2.5m0 0a2.5 2.5 0 0 0 2.5-2.5m5 0a2.5 2.5 0 0 1-2.5-2.5m0 0a2.5 2.5 0 0 0-2.5 2.5m10 0a2.5 2.5 0 0 1-2.5-2.5m0 0a2.5 2.5 0 0 0-2.5 2.5m0 0A2.5 2.5 0 0 1 9.5 20m0 0v-2.5A2.5 2.5 0 0 1 12 15m0 0h2.5A2.5 2.5 0 0 0 17 12.5m0 0v-10A2.5 2.5 0 0 0 14.5 0h-10A2.5 2.5 0 0 1 2 2.5m0 0v10A2.5 2.5 0 0 0 4.5 15m0 0h2.5A2.5 2.5 0 0 1 9 12.5m0 0v2.5A2.5 2.5 0 0 0 11.5 17m0 0h-7A2.5 2.5 0 0 1 2 14.5m0 0v-2.5A2.5 2.5 0 0 0 4.5 10m0 0h2.5A2.5 2.5 0 0 1 9 7.5m0 0v-2.5A2.5 2.5 0 0 0 6.5 5m0 0h2.5A2.5 2.5 0 0 1 12 2.5m0 0v2.5A2.5 2.5 0 0 0 14.5 5m0 0h2.5A2.5 2.5 0 0 1 19 7.5m0 0v2.5A2.5 2.5 0 0 0 16.5 10m0 0h-2.5A2.5 2.5 0 0 1 14 12.5m0 0v2.5A2.5 2.5 0 0 1 11.5 15m0 0h-2.5A2.5 2.5 0 0 1 9 17.5m0 0h2.5A2.5 2.5 0 0 1 11.5 20m0 0v2.5A2.5 2.5 0 0 0 14 22.5m0 0h2.5A2.5 2.5 0 0 0 17 20m0 0h-2.5A2.5 2.5 0 0 1 14.5 17.5m0 0h-2.5A2.5 2.5 0 0 0 12 15m0 0v2.5A2.5 2.5 0 0 1 9.5 20m0 0h-2.5A2.5 2.5 0 0 0 7 22.5m0 0h2.5A2.5 2.5 0 0 0 9.5 20m0 0v-2.5A2.5 2.5 0 0 1 12 17.5m0 0h-2.5A2.5 2.5 0 0 0 9.5 15m0 0v2.5A2.5 2.5 0 0 1 7 17.5m0 0h2.5A2.5 2.5 0 0 0 9.5 20m0 0v2.5A2.5 2.5 0 0 1 7 22.5m0 0h2.5A2.5 2.5 0 0 0 9.5 20" />
    </svg>
  );
}

export default function SafetyIncidentReport() {
  const [type, setType] = useState<IncidentType>("SUSPICIOUS_PERSON");
  const [severity, setSeverity] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("MEDIUM");
  const [narrative, setNarrative] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [locationSource, setLocationSource] = useState<"DEVICE_GPS" | "MAP_PIN" | "LAST_KNOWN">("DEVICE_GPS");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setSubmitError("Geolocation is not supported by this browser.");
      return;
    }
    setSubmitting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocationSource("DEVICE_GPS");
        setSubmitting(false);
      },
      (err) => {
        setSubmitError(err.message || "Failed to get location");
        setSubmitting(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    try {
      const latNum = parseFloat(lat);
      const lngNum = parseFloat(lng);
      if (isNaN(latNum) || isNaN(lngNum)) {
        throw new Error("Please enter valid latitude and longitude");
      }

      await api.post("/safety-incidents", {
        type,
        severity,
        narrative: narrative.trim() || undefined,
        reportLat: latNum,
        reportLng: lngNum,
        locationSource,
      });
      setSubmitted(true);
    } catch (err: any) {
      setSubmitError(err.response?.data?.message || err.message || "Failed to report incident");
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="p-6 bg-[#07111f] min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert size={32} strokeWidth={2} className="text-green-400" />
          </div>
          <h2 className="text-2xl font-black text-white mb-2">Incident Reported</h2>
          <p className="text-sm text-white/50 mb-6">Your safety report has been submitted and is under review.</p>
          <button
            onClick={() => setSubmitted(false)}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition"
          >
            Report Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-[#07111f] min-h-screen max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => {}}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm hover:bg-white/10 transition"
        >
          <ArrowLeft size={16} strokeWidth={2} />
          <span>Back to Dispatch</span>
        </button>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <h2 className="text-xl font-black text-white mb-6">Report a Safety Incident</h2>

        {submitError && (
          <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Incident Type */}
          <div>
            <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2">Incident Type</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {INCIDENT_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition border ${
                    type === t.value
                      ? "border-blue-500 bg-blue-500/10 text-blue-400"
                      : "border-white/10 bg-white/5 text-white/50 hover:border-white/20"
                  }`}
                >
                  <t.icon size={14} strokeWidth={2} />
                  <span className="font-medium">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Severity */}
          <div>
            <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2">Severity</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {SEVERITY_LEVELS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSeverity(s.value)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition border ${
                    severity === s.value
                      ? `border-${s.value === "CRITICAL" ? "red" : s.value === "HIGH" ? "amber" : s.value === "MEDIUM" ? "blue" : "green"}-500 bg-${s.value === "CRITICAL" ? "red" : s.value === "HIGH" ? "amber" : s.value === "MEDIUM" ? "blue" : "green"}-500/10 text-${s.value === "CRITICAL" ? "red" : s.value === "HIGH" ? "amber" : s.value === "MEDIUM" ? "blue" : "green"}-400`
                      : "border-white/10 bg-white/5 text-white/50 hover:border-white/20"
                  }`}
                >
                  <span className="font-medium">{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Narrative */}
          <div>
            <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2">What happened?</label>
            <textarea
              rows={3}
              placeholder="e.g. Suspicious white van, no plates, N1 southbound near Beitbridge"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              maxLength={280}
            />
            <p className="text-[10px] text-white/40 mt-1">{narrative.length}/280 characters</p>
          </div>

          {/* Location */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2">Latitude</label>
              <input
                type="number"
                step="any"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2">Longitude</label>
              <input
                type="number"
                step="any"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleUseMyLocation}
                disabled={submitting}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition border ${
                  submitting
                    ? "border-white/10 bg-white/5 text-white/40 cursor-not-allowed"
                    : "border-blue-500 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                }`}
              >
                <MapPin size={16} strokeWidth={2} />
                <span>Use My Location</span>
              </button>
            </div>
          </div>

          {/* Location Source */}
          <div>
            <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2">Location Source</label>
            <div className="flex gap-2">
              {["DEVICE_GPS", "MAP_PIN", "LAST_KNOWN"].map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setLocationSource(src as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition border ${
                    locationSource === src
                      ? "border-blue-500 bg-blue-500/10 text-blue-400"
                      : "border-white/10 bg-white/5 text-white/50 hover:border-white/20"
                  }`}
                >
                  {src.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || !lat || !lng}
            className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-lg font-black transition ${
              submitting || !lat || !lng
                ? "bg-white/5 border border-white/10 text-white/40 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/20"
            }`}
          >
            {submitting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Submitting…
              </>
            ) : (
              <>
                <Send size={18} strokeWidth={2} />
                Submit Report
              </>
            )}
          </button>
        </form>
      </div>

      <div className="mt-6 p-4 rounded-lg bg-white/5 border border-white/10 text-sm text-white/50">
        <p className="font-medium text-white mb-2">How it works:</p>
        <ul className="list-disc list-inside space-y-1 text-white/40">
          <li>Your report is immediately visible to dispatch and verifiers</li>
          <li>Critical incidents trigger driver alerts within the tenant</li>
          <li>Verified incidents create safety zones automatically</li>
          <li>All reports are audited against your tenant identity</li>
        </ul>
      </div>
    </div>
  );
}