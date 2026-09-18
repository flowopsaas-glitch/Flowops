import React, { useEffect, useState } from "react";
import {
  Truck, Plus, Search, Edit2, Power, Shield, TrendingUp, Phone,
  User, Hash, Save, X, CheckCircle2, XCircle, MapPin, Clock, Star,
  Brain, AlertTriangle,
} from "lucide-react";
import { api } from "../api/client";

type Driver = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  vehicleType?: string | null;
  vehicleReg?: string | null;
  pin?: string | null;
  status?: string | null;
  isActive?: boolean;
  lastLat?: number | null;
  lastLng?: number | null;
  lastSeen?: string | null;
  createdAt?: string;
  // Performance (from leaderboard data)
  deliveryCount?: number;
  successRate?: number;
  avgRating?: number;
};

type FormData = {
  name: string;
  phone: string;
  email: string;
  vehicleType: string;
  vehicleReg: string;
  pin: string;
};

const VEHICLE_TYPES = ["CAR", "VAN", "BAKKIE", "MOTORCYCLE", "TRUCK", "BICYCLE"];
const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: "text-emerald-300 bg-emerald-500/15 border-emerald-500/30",
  ON_ROUTE: "text-blue-300 bg-blue-500/15 border-blue-500/30",
  OFFLINE: "text-gray-400 bg-gray-500/15 border-gray-500/30",
  BUSY: "text-amber-300 bg-amber-500/15 border-amber-500/30",
};

export default function DriversManagement() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({ name: "", phone: "", email: "", vehicleType: "VAN", vehicleReg: "", pin: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [aiInsight, setAiInsight] = useState<string | null>(null);

  useEffect(() => { void loadDrivers(); }, []);

  async function loadDrivers() {
    setLoading(true);
    try {
      const res = await api.get("/drivers");
      const data = Array.isArray(res) ? res : (res as any)?.data ?? [];
      setDrivers(data);
      generateAiInsight(data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  function generateAiInsight(data: Driver[]) {
    const active = data.filter(d => d.isActive !== false);
    const offline = active.filter(d => d.status === "OFFLINE" || !d.lastSeen);
    const noPin = active.filter(d => !d.pin);
    const insights: string[] = [];
    if (offline.length > 0) insights.push(`${offline.length} driver${offline.length > 1 ? "s" : ""} haven't checked in recently`);
    if (noPin.length > 0) insights.push(`${noPin.length} driver${noPin.length > 1 ? "s" : ""} don't have a PIN set (can't use mobile portal)`);
    if (active.length === 0) insights.push("No active drivers — add your first driver to get started");
    if (active.length >= 3 && offline.length === 0) insights.push("All drivers active and checked in — fleet is healthy");
    setAiInsight(insights.length > 0 ? insights.join(". ") + "." : null);
  }

  function openCreate() {
    setForm({ name: "", phone: "", email: "", vehicleType: "VAN", vehicleReg: "", pin: "" });
    setEditingId(null);
    setShowForm(true);
    setError(""); setSuccess("");
  }

  function openEdit(d: Driver) {
    setForm({
      name: d.name,
      phone: d.phone ?? "",
      email: d.email ?? "",
      vehicleType: d.vehicleType ?? "VAN",
      vehicleReg: d.vehicleReg ?? "",
      pin: d.pin ?? "",
    });
    setEditingId(d.id);
    setShowForm(true);
    setError(""); setSuccess("");
  }

  async function handleSave() {
    if (!form.name.trim()) { setError("Driver name is required"); return; }
    setSaving(true); setError("");
    try {
      const payload: any = {
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        vehicleType: form.vehicleType || undefined,
        vehicleReg: form.vehicleReg.trim() || undefined,
        pin: form.pin.trim() || undefined,
      };
      if (editingId) {
        await api.patch(`/drivers/${editingId}`, payload);
        setSuccess("Driver updated successfully");
      } else {
        payload.status = "AVAILABLE";
        await api.post("/drivers", payload);
        setSuccess(
          payload.phone
            ? "Driver added to fleet"
            : "Driver added — add a phone number + PIN so they can log into the driver app.",
        );
      }
      setShowForm(false);
      void loadDrivers();
    } catch (err: any) {
      setError(err?.message || "Failed to save driver");
    } finally { setSaving(false); }
  }

  async function toggleActive(d: Driver) {
    try {
      await api.patch(`/drivers/${d.id}`, { isActive: !d.isActive });
      void loadDrivers();
    } catch { /* silent */ }
  }

  const filtered = drivers.filter(d =>
    !query || d.name.toLowerCase().includes(query.toLowerCase()) ||
    d.phone?.includes(query) || d.vehicleReg?.toLowerCase().includes(query.toLowerCase())
  );

  const activeCount = drivers.filter(d => d.isActive !== false).length;
  const onRouteCount = drivers.filter(d => d.status === "ON_ROUTE").length;
  const offlineCount = drivers.filter(d => d.status === "OFFLINE" || (d.isActive !== false && !d.lastSeen)).length;

  return (
    <div className="min-h-screen p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center">
              <Truck className="h-5 w-5 text-white" />
            </div>
            Driver Fleet Management
          </h1>
          <p className="text-sm text-white/40 mt-1">Add drivers, set PINs, manage vehicles, monitor performance</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition">
          <Plus className="h-4 w-4" /> Add Driver
        </button>
      </div>

      {/* AI Insight Banner */}
      {aiInsight && (
        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 flex items-start gap-3">
          <Brain className="h-5 w-5 text-sky-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300/70">AI Fleet Supervisor</p>
            <p className="text-sm text-sky-100/80 mt-1">{aiInsight}</p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Drivers" value={drivers.length} icon={<User className="h-5 w-5 text-white/60" />} />
        <StatCard label="Active" value={activeCount} icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />} />
        <StatCard label="On Route" value={onRouteCount} icon={<MapPin className="h-5 w-5 text-blue-400" />} />
        <StatCard label="Offline" value={offlineCount} icon={<AlertTriangle className="h-5 w-5 text-amber-400" />} />
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
        <input
          value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search by name, phone, or vehicle reg..."
          className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 pl-11 pr-4 text-sm text-white outline-none focus:border-sky-400/40 placeholder:text-white/25"
        />
      </div>

      {/* Success/Error */}
      {success && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> {success}</div>}
      {error && !showForm && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200 flex items-center gap-2"><XCircle className="h-4 w-4" /> {error}</div>}

      {/* Driver List */}
      {loading ? (
        <div className="text-center py-12 text-white/40">
          <div className="w-8 h-8 border-2 border-white/20 border-t-sky-400 rounded-full animate-spin mx-auto mb-3" />
          Loading fleet...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-white/10 bg-white/[0.03]">
          <Truck className="h-12 w-12 text-white/20 mx-auto mb-3" />
          <p className="text-white/40">{query ? "No drivers match your search" : "No drivers yet — add your first driver"}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(d => (
            <div key={d.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 flex items-center gap-4 hover:bg-white/[0.06] transition group">
              {/* Avatar */}
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-sky-500/20 to-indigo-500/20 border border-white/10 flex items-center justify-center shrink-0">
                <User className="h-6 w-6 text-sky-300" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white truncate">{d.name}</span>
                  {d.status && (
                    <span className={`text-[10px] uppercase tracking-wider font-bold border rounded-md px-1.5 py-0.5 ${STATUS_COLORS[d.status] ?? STATUS_COLORS.OFFLINE}`}>
                      {d.status}
                    </span>
                  )}
                  {d.isActive === false && (
                    <span className="text-[10px] uppercase tracking-wider font-bold text-red-300 bg-red-500/15 border border-red-500/30 rounded-md px-1.5 py-0.5">
                      DEACTIVATED
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-white/40">
                  {d.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {d.phone}</span>}
                  {d.vehicleType && <span className="flex items-center gap-1"><Truck className="h-3 w-3" /> {d.vehicleType}</span>}
                  {d.vehicleReg && <span>{d.vehicleReg}</span>}
                  {d.pin ? <span className="flex items-center gap-1 text-emerald-400/60"><Shield className="h-3 w-3" /> PIN set</span> : <span className="flex items-center gap-1 text-amber-400/60"><Shield className="h-3 w-3" /> No PIN</span>}
                </div>
                {d.lastSeen && (
                  <div className="flex items-center gap-1 mt-1 text-[10px] text-white/25">
                    <Clock className="h-3 w-3" /> Last seen: {new Date(d.lastSeen).toLocaleString()}
                  </div>
                )}
              </div>

              {/* Performance */}
              <div className="hidden md:flex items-center gap-4 text-xs text-white/40">
                {d.deliveryCount != null && (
                  <div className="text-center">
                    <div className="text-lg font-bold text-white">{d.deliveryCount}</div>
                    <div>Deliveries</div>
                  </div>
                )}
                {d.avgRating != null && (
                  <div className="text-center flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 text-amber-400" />
                    <span className="text-lg font-bold text-white">{d.avgRating.toFixed(1)}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                <button onClick={() => openEdit(d)} className="p-2 rounded-xl border border-white/10 hover:bg-white/10 transition" title="Edit">
                  <Edit2 className="h-4 w-4 text-sky-300" />
                </button>
                <button onClick={() => toggleActive(d)} className="p-2 rounded-xl border border-white/10 hover:bg-white/10 transition" title={d.isActive === false ? "Reactivate" : "Deactivate"}>
                  <Power className={`h-4 w-4 ${d.isActive === false ? "text-emerald-300" : "text-red-300"}`} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0b1628] p-6 space-y-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-white">{editingId ? "Edit Driver" : "Add New Driver"}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-xl border border-white/10 hover:bg-white/10"><X className="h-4 w-4 text-white/60" /></button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Full Name *" icon={<User className="h-3.5 w-3.5" />}>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Sipho Dlamini" className="form-input" />
              </FormField>
              <FormField label="Phone Number" icon={<Phone className="h-3.5 w-3.5" />}>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="073 937 5209" className="form-input" />
              </FormField>
              <FormField label="Email (optional)" icon={<User className="h-3.5 w-3.5" />}>
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="sipho@email.com" className="form-input" />
              </FormField>
              <FormField label="Vehicle Type" icon={<Truck className="h-3.5 w-3.5" />}>
                <select value={form.vehicleType} onChange={e => setForm(f => ({ ...f, vehicleType: e.target.value }))} className="form-input">
                  {VEHICLE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </FormField>
              <FormField label="Vehicle Registration" icon={<Hash className="h-3.5 w-3.5" />}>
                <input value={form.vehicleReg} onChange={e => setForm(f => ({ ...f, vehicleReg: e.target.value }))} placeholder="CA 123-456" className="form-input" />
              </FormField>
              <FormField label="PIN (4-6 digits — for mobile login)" icon={<Shield className="h-3.5 w-3.5" />}>
                <input value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, "").slice(0, 6) }))} placeholder="4-6 digit PIN" maxLength={6} className="form-input" />
              </FormField>
            </div>

            {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowForm(false)} className="flex-1 rounded-2xl border border-white/10 bg-white/5 py-3 text-sm font-bold text-white/60 hover:bg-white/10 transition">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 transition">
                <Save className="h-4 w-4" /> {saving ? "Saving..." : editingId ? "Update Driver" : "Add Driver"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .form-input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(0,0,0,0.2);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          color: white;
          outline: none;
        }
        .form-input:focus { border-color: rgba(56,189,248,0.4); }
        .form-input::placeholder { color: rgba(255,255,255,0.25); }
      `}</style>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center justify-between mb-2">{icon}<TrendingUp className="h-3.5 w-3.5 text-white/20" /></div>
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
