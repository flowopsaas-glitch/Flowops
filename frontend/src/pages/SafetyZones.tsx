import React, { useEffect, useState } from "react";
import {
  Shield, Plus, Search, Edit2, Trash2, MapPin, AlertTriangle, Radio,
  CheckCircle2, XCircle, X, Save, Zap, Brain, Eye, Clock, Activity,
} from "lucide-react";
import { api } from "../api/client";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type SafetyZone = {
  id: string;
  name: string;
  description?: string | null;
  lat: number;
  lng: number;
  radiusM: number;
  riskLevel: RiskLevel;
  alertMessage?: string | null;
  notifyDriver: boolean;
  notifyDispatch: boolean;
  notifyAdmin: boolean;
  source?: string | null;
  isActive: boolean;
  createdAt: string;
  _count?: { alerts: number };
};

type SafetyAlert = {
  id: string;
  driverName?: string | null;
  zoneName?: string | null;
  riskLevel: RiskLevel;
  lat: number;
  lng: number;
  speed?: number | null;
  acknowledged: boolean;
  createdAt: string;
  zone?: { name: string; riskLevel: RiskLevel };
};

type FormData = {
  name: string;
  description: string;
  lat: string;
  lng: string;
  radiusM: string;
  riskLevel: RiskLevel;
  alertMessage: string;
  notifyDriver: boolean;
  notifyDispatch: boolean;
  notifyAdmin: boolean;
};

const RISK_STYLES: Record<RiskLevel, { bg: string; border: string; text: string; dot: string }> = {
  CRITICAL: { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-300", dot: "bg-red-500" },
  HIGH: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-300", dot: "bg-amber-500" },
  MEDIUM: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-300", dot: "bg-yellow-500" },
  LOW: { bg: "bg-sky-500/10", border: "border-sky-500/30", text: "text-sky-300", dot: "bg-sky-500" },
};

export default function SafetyZones() {
  const [zones, setZones] = useState<SafetyZone[]>([]);
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"zones" | "alerts">("zones");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({ name: "", description: "", lat: "", lng: "", radiusM: "1000", riskLevel: "HIGH", alertMessage: "", notifyDriver: true, notifyDispatch: true, notifyAdmin: true });
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => { void loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [z, a] = await Promise.all([
        api.get("/safety/zones"),
        api.get("/safety/alerts?limit=30"),
      ]);
      setZones(Array.isArray(z) ? z : (z as any)?.data ?? []);
      setAlerts(Array.isArray(a) ? a : (a as any)?.data ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  async function seedDefaults() {
    setSeeding(true); setError(""); setSuccess("");
    try {
      const res = await api.post("/safety/zones/seed") as any;
      if (res?.seeded) {
        setSuccess(`Seeded ${res.count} SA crime hotspots from SAPS statistics.`);
        void loadAll();
      } else {
        setSuccess(`Already have ${res?.existing ?? 0} zones — no seed needed.`);
      }
    } catch (err: any) { setError(err?.message || "Failed to seed zones"); }
    finally { setSeeding(false); }
  }

  function openCreate() {
    setForm({ name: "", description: "", lat: "", lng: "", radiusM: "1000", riskLevel: "HIGH", alertMessage: "", notifyDriver: true, notifyDispatch: true, notifyAdmin: true });
    setEditingId(null); setShowForm(true); setError("");
  }

  function openEdit(z: SafetyZone) {
    setForm({
      name: z.name, description: z.description ?? "", lat: String(z.lat), lng: String(z.lng),
      radiusM: String(z.radiusM), riskLevel: z.riskLevel, alertMessage: z.alertMessage ?? "",
      notifyDriver: z.notifyDriver, notifyDispatch: z.notifyDispatch, notifyAdmin: z.notifyAdmin,
    });
    setEditingId(z.id); setShowForm(true); setError("");
  }

  async function handleSave() {
    if (!form.name.trim()) { setError("Zone name is required"); return; }
    if (!form.lat || !form.lng) { setError("GPS coordinates are required"); return; }
    setSaving(true); setError("");
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        lat: parseFloat(form.lat),
        lng: parseFloat(form.lng),
        radiusM: parseInt(form.radiusM) || 1000,
        riskLevel: form.riskLevel,
        alertMessage: form.alertMessage.trim() || undefined,
        notifyDriver: form.notifyDriver,
        notifyDispatch: form.notifyDispatch,
        notifyAdmin: form.notifyAdmin,
      };
      if (editingId) {
        await api.patch(`/safety/zones/${editingId}`, payload);
        setSuccess("Zone updated");
      } else {
        await api.post("/safety/zones", payload);
        setSuccess("Zone created");
      }
      setShowForm(false); void loadAll();
    } catch (err: any) { setError(err?.message || "Failed to save zone"); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this safety zone?")) return;
    try { await api.delete(`/safety/zones/${id}`); void loadAll(); } catch { /* silent */ }
  }

  const filtered = zones.filter(z => !query || z.name.toLowerCase().includes(query.toLowerCase()));
  const criticalCount = zones.filter(z => z.riskLevel === "CRITICAL").length;
  const highCount = zones.filter(z => z.riskLevel === "HIGH").length;
  const totalAlerts = alerts.length;

  return (
    <div className="min-h-screen p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center">
              <Shield className="h-5 w-5 text-white" />
            </div>
            Driver Safety Zones
          </h1>
          <p className="text-sm text-white/40 mt-1">AI-supervised crime hotspot detection — protect your drivers in real-time</p>
        </div>
        <div className="flex gap-3">
          <button onClick={seedDefaults} disabled={seeding} className="flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm font-bold text-amber-200 hover:bg-amber-500/20 transition disabled:opacity-50">
            <Zap className="h-4 w-4" /> {seeding ? "Seeding..." : "Seed SA Hotspots"}
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-red-500 to-orange-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-500/20 hover:shadow-red-500/30 transition">
            <Plus className="h-4 w-4" /> Add Zone
          </button>
        </div>
      </div>

      {/* AI Insight */}
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 flex items-start gap-3">
        <Brain className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-300/70">AI Safety Supervisor</p>
          <p className="text-sm text-red-100/80 mt-1">
            {zones.length === 0
              ? "No safety zones configured. Click 'Seed SA Hotspots' to auto-load 20 high-risk areas from SAPS crime statistics."
              : `Monitoring ${zones.length} zone${zones.length > 1 ? "s" : ""} (${criticalCount} critical, ${highCount} high). ${totalAlerts} alert${totalAlerts !== 1 ? "s" : ""} triggered recently. Drivers are automatically warned when entering any active zone.`
            }
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Zones" value={zones.length} icon={<MapPin className="h-5 w-5 text-white/60" />} />
        <StatCard label="Critical" value={criticalCount} icon={<AlertTriangle className="h-5 w-5 text-red-400" />} />
        <StatCard label="High Risk" value={highCount} icon={<Radio className="h-5 w-5 text-amber-400" />} />
        <StatCard label="Alerts (30d)" value={totalAlerts} icon={<Activity className="h-5 w-5 text-sky-400" />} />
      </div>

      {/* Success/Error */}
      {success && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> {success}</div>}
      {error && !showForm && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200 flex items-center gap-2"><XCircle className="h-4 w-4" /> {error}</div>}

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab("zones")} className={`px-4 py-2 rounded-xl text-sm font-bold transition ${tab === "zones" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"}`}>
          <Shield className="h-4 w-4 inline mr-1.5" />Zones ({zones.length})
        </button>
        <button onClick={() => setTab("alerts")} className={`px-4 py-2 rounded-xl text-sm font-bold transition ${tab === "alerts" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"}`}>
          <AlertTriangle className="h-4 w-4 inline mr-1.5" />Alert History ({alerts.length})
        </button>
      </div>

      {tab === "zones" && (
        <>
          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search zones..." className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 pl-11 pr-4 text-sm text-white outline-none focus:border-red-400/40 placeholder:text-white/25" />
          </div>

          {/* Zone List */}
          {loading ? (
            <div className="text-center py-12 text-white/40"><div className="w-8 h-8 border-2 border-white/20 border-t-red-400 rounded-full animate-spin mx-auto mb-3" />Loading zones...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 rounded-2xl border border-white/10 bg-white/[0.03]">
              <Shield className="h-12 w-12 text-white/20 mx-auto mb-3" />
              <p className="text-white/40">{query ? "No zones match" : "No safety zones — seed SA hotspots or add manually"}</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filtered.map(z => {
                const style = RISK_STYLES[z.riskLevel];
                return (
                  <div key={z.id} className={`rounded-2xl border ${style.border} ${style.bg} p-5 flex items-center gap-4 group hover:bg-white/[0.06] transition`}>
                    <div className={`h-3 w-3 rounded-full ${style.dot} animate-pulse shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white truncate">{z.name}</span>
                        <span className={`text-[10px] uppercase tracking-wider font-bold ${style.text} ${style.bg} border ${style.border} rounded-md px-1.5 py-0.5`}>{z.riskLevel}</span>
                        {!z.isActive && <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 bg-gray-500/15 border border-gray-500/30 rounded-md px-1.5 py-0.5">DISABLED</span>}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-white/40">
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {z.lat.toFixed(4)}, {z.lng.toFixed(4)}</span>
                        <span><Radio className="h-3 w-3 inline" /> {z.radiusM}m radius</span>
                        {z._count?.alerts != null && <span><AlertTriangle className="h-3 w-3 inline" /> {z._count.alerts} alerts</span>}
                        {z.source && <span className="text-white/25">{z.source}</span>}
                      </div>
                      {z.description && <p className="text-xs text-white/30 mt-1 truncate">{z.description}</p>}
                    </div>
                    {/* Notification indicators */}
                    <div className="flex items-center gap-1.5 text-[10px] text-white/30">
                      {z.notifyDriver && <span title="Driver notified">📱</span>}
                      {z.notifyDispatch && <span title="Dispatch notified">📟</span>}
                      {z.notifyAdmin && <span title="Admin emailed">📧</span>}
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => openEdit(z)} className="p-2 rounded-xl border border-white/10 hover:bg-white/10 transition" title="Edit"><Edit2 className="h-4 w-4 text-sky-300" /></button>
                      <button onClick={() => handleDelete(z.id)} className="p-2 rounded-xl border border-white/10 hover:bg-white/10 transition" title="Delete"><Trash2 className="h-4 w-4 text-red-300" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === "alerts" && (
        <div className="space-y-3">
          {alerts.length === 0 ? (
            <div className="text-center py-16 rounded-2xl border border-white/10 bg-white/[0.03]">
              <CheckCircle2 className="h-12 w-12 text-emerald-500/30 mx-auto mb-3" />
              <p className="text-white/40">No safety alerts triggered — all clear</p>
            </div>
          ) : alerts.map(a => {
            const style = RISK_STYLES[a.riskLevel];
            return (
              <div key={a.id} className={`rounded-2xl border ${style.border} ${style.bg} p-4 flex items-center gap-4`}>
                <div className={`h-3 w-3 rounded-full ${style.dot} shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">{a.driverName ?? "Driver"}</span>
                    <span className="text-xs text-white/40">entered</span>
                    <span className={`text-sm font-bold ${style.text}`}>{a.zoneName ?? a.zone?.name ?? "Zone"}</span>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-white/30">
                    <span><Clock className="h-3 w-3 inline" /> {new Date(a.createdAt).toLocaleString()}</span>
                    <span><MapPin className="h-3 w-3 inline" /> {a.lat.toFixed(4)}, {a.lng.toFixed(4)}</span>
                    {a.speed != null && <span>{a.speed.toFixed(0)} km/h</span>}
                    {a.acknowledged && <span className="text-emerald-400"><CheckCircle2 className="h-3 w-3 inline" /> Acknowledged</span>}
                  </div>
                </div>
                <a href={`https://www.google.com/maps?q=${a.lat},${a.lng}`} target="_blank" rel="noreferrer" className="p-2 rounded-xl border border-white/10 hover:bg-white/10 transition" title="View on map">
                  <Eye className="h-4 w-4 text-sky-300" />
                </a>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0b1628] p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()} role="dialog">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-white">{editingId ? "Edit Safety Zone" : "Add Safety Zone"}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-xl border border-white/10 hover:bg-white/10"><X className="h-4 w-4 text-white/60" /></button>
            </div>

            <div className="space-y-4">
              <FormField label="Zone Name *" icon={<Shield className="h-3.5 w-3.5" />}>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Alexandra, JHB" className="form-input" />
              </FormField>
              <FormField label="Description" icon={<MapPin className="h-3.5 w-3.5" />}>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Known hijacking area near N3 off-ramp" className="form-input" />
              </FormField>
              <div className="grid grid-cols-3 gap-3">
                <FormField label="Latitude *" icon={<MapPin className="h-3.5 w-3.5" />}>
                  <input value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))} placeholder="-26.1076" className="form-input" />
                </FormField>
                <FormField label="Longitude *" icon={<MapPin className="h-3.5 w-3.5" />}>
                  <input value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))} placeholder="28.0897" className="form-input" />
                </FormField>
                <FormField label="Radius (m)" icon={<Radio className="h-3.5 w-3.5" />}>
                  <input value={form.radiusM} onChange={e => setForm(f => ({ ...f, radiusM: e.target.value }))} placeholder="1000" className="form-input" />
                </FormField>
              </div>
              <FormField label="Risk Level" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
                <select value={form.riskLevel} onChange={e => setForm(f => ({ ...f, riskLevel: e.target.value as RiskLevel }))} className="form-input">
                  <option value="CRITICAL">CRITICAL — Active danger, avoid stopping</option>
                  <option value="HIGH">HIGH — Known problem area</option>
                  <option value="MEDIUM">MEDIUM — Occasional incidents</option>
                  <option value="LOW">LOW — Minor risk, awareness</option>
                </select>
              </FormField>
              <FormField label="Custom Alert Message (shown to driver)" icon={<Zap className="h-3.5 w-3.5" />}>
                <textarea value={form.alertMessage} onChange={e => setForm(f => ({ ...f, alertMessage: e.target.value }))} placeholder="Lock doors. Do not stop. If followed, drive to nearest police station." className="form-input min-h-[80px] resize-none" />
              </FormField>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
                  <input type="checkbox" checked={form.notifyDriver} onChange={e => setForm(f => ({ ...f, notifyDriver: e.target.checked }))} className="rounded" /> Notify Driver
                </label>
                <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
                  <input type="checkbox" checked={form.notifyDispatch} onChange={e => setForm(f => ({ ...f, notifyDispatch: e.target.checked }))} className="rounded" /> Notify Dispatch
                </label>
                <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
                  <input type="checkbox" checked={form.notifyAdmin} onChange={e => setForm(f => ({ ...f, notifyAdmin: e.target.checked }))} className="rounded" /> Email Admin
                </label>
              </div>
            </div>

            {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowForm(false)} className="flex-1 rounded-2xl border border-white/10 bg-white/5 py-3 text-sm font-bold text-white/60 hover:bg-white/10 transition">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 rounded-2xl bg-gradient-to-r from-red-500 to-orange-600 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 transition">
                <Save className="h-4 w-4" /> {saving ? "Saving..." : editingId ? "Update Zone" : "Create Zone"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .form-input { width:100%; border-radius:0.75rem; border:1px solid rgba(255,255,255,0.1); background:rgba(0,0,0,0.2); padding:0.75rem 1rem; font-size:0.875rem; color:white; outline:none; }
        .form-input:focus { border-color:rgba(239,68,68,0.4); }
        .form-input::placeholder { color:rgba(255,255,255,0.25); }
      `}</style>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center justify-between mb-2">{icon}<Activity className="h-3.5 w-3.5 text-white/20" /></div>
      <div className="text-2xl font-black text-white">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/30 mt-1">{label}</div>
    </div>
  );
}

function FormField({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40 mb-1.5 flex items-center gap-1 block">{icon} {label}</label>
      {children}
    </div>
  );
}
