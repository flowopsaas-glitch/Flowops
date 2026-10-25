/**
 * DepotsPage — Depot / Branch management.
 * Create, view, and manage all company depots on a map.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Building2, Edit2, MapPin, Plus, RefreshCw, Save, Trash2, X,
} from "lucide-react";
import api from "../api/client";

interface Depot {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  createdAt: string;
}

const EMPTY: Omit<Depot, "id" | "createdAt"> = {
  name: "", address: "", city: "", lat: undefined, lng: undefined,
};

const SA_CITIES = [
  { name: "Johannesburg", lat: -26.2041, lng: 28.0473 },
  { name: "Cape Town",    lat: -33.9249, lng: 18.4241 },
  { name: "Durban",       lat: -29.8587, lng: 31.0218 },
  { name: "Pretoria",     lat: -25.7479, lng: 28.2293 },
  { name: "Port Elizabeth", lat: -33.9608, lng: 25.6022 },
  { name: "Bloemfontein", lat: -29.1210, lng: 26.2150 },
  { name: "East London",  lat: -33.0153, lng: 27.9116 },
  { name: "Nelspruit",    lat: -25.4753, lng: 30.9694 },
];

function unwrap<T>(res: unknown): T[] {
  const d = (res as { data?: unknown } | null)?.data ?? res;
  return Array.isArray(d) ? (d as T[]) : [];
}

function DepotModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: Depot | null;
  onSave: (data: typeof EMPTY) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<typeof EMPTY>(
    initial ? { name: initial.name, address: initial.address ?? "", city: initial.city ?? "", lat: initial.lat ?? undefined, lng: initial.lng ?? undefined }
            : { ...EMPTY }
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k: string, v: string | number | undefined) => setForm(p => ({ ...p, [k]: v }));

  function fillCity(city: typeof SA_CITIES[0]) {
    setForm(p => ({ ...p, city: city.name, lat: city.lat, lng: city.lng }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setErr("Depot name is required."); return; }
    setSaving(true); setErr("");
    try {
      await onSave(form);
    } catch (ex) {
      setErr(ex?.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full rounded-2xl border border-white/10 bg-[#071224] px-4 py-3 text-sm text-white outline-none focus:border-sky-400 placeholder-white/20 transition";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[28px] border border-white/10 bg-[#07111e] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/8 px-6 py-4">
          <h2 className="text-lg font-black text-white">{initial ? "Edit Depot" : "Add New Depot"}</h2>
          <button onClick={onClose} className="rounded-xl p-1.5 hover:bg-white/10 text-white/50">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          {err && <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{err}</div>}

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-white/50" htmlFor="field-depot-name-5">Depot Name *</label>
            <input id="field-depot-name-5" value={form.name} onChange={e => set("name", e.target.value)} required
              placeholder="e.g. Johannesburg Hub" className={inputCls} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-white/50" htmlFor="field-address-4">Address</label>
              <input id="field-address-4" value={form.address ?? ""} onChange={e => set("address", e.target.value)}
                placeholder="Street address" className={inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-white/50" htmlFor="field-city-3">City</label>
              <input id="field-city-3" value={form.city ?? ""} onChange={e => set("city", e.target.value)}
                placeholder="City" className={inputCls} />
            </div>
          </div>

          {/* Quick city preset buttons */}
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-white/40">Quick Presets</div>
            <div className="flex flex-wrap gap-2">
              {SA_CITIES.map(c => (
                <button type="button" key={c.name}
                  onClick={() => fillCity(c)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition ${
                    form.city === c.name
                      ? "border-sky-500/40 bg-sky-500/15 text-sky-300"
                      : "border-white/10 bg-white/5 text-white/40 hover:bg-white/10"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-white/50" htmlFor="field-latitude-2">Latitude</label>
              <input id="field-latitude-2" type="number" step="0.0001" value={form.lat ?? ""}
                onChange={e => set("lat", e.target.value ? +e.target.value : undefined)}
                placeholder="e.g. -26.2041" className={inputCls + " [appearance:textfield]"} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-white/50" htmlFor="field-longitude-1">Longitude</label>
              <input id="field-longitude-1" type="number" step="0.0001" value={form.lng ?? ""}
                onChange={e => set("lng", e.target.value ? +e.target.value : undefined)}
                placeholder="e.g. 28.0473" className={inputCls + " [appearance:textfield]"} />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-2xl border border-white/10 px-5 py-2.5 text-sm font-bold text-white/60 hover:bg-white/5">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 rounded-2xl bg-sky-500 px-6 py-2.5 text-sm font-black text-slate-950 hover:bg-sky-400 disabled:opacity-50 transition">
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : initial ? "Update Depot" : "Add Depot"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function DepotsPage() {
  const [depots, setDepots] = useState<Depot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Depot | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const load = useCallback(async () => {
    try {
      const res = await api.get("/branches");
      setDepots(unwrap<Depot>(res));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleSave(data: typeof EMPTY) {
    if (editing) {
      await api.patch(`/branches/${editing.id}`, data);
      showToast(`${data.name} updated.`);
    } else {
      await api.post("/branches", data);
      showToast(`${data.name} added.`);
    }
    setShowModal(false);
    setEditing(null);
    void load();
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Remove this depot? This cannot be undone.")) return;
    setDeleting(id);
    try {
      // Branches don't have a DELETE endpoint — use PATCH to deactivate or just show message
      showToast("Contact admin to remove depots from the database.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-2xl border border-emerald-500/30 bg-emerald-500/15 px-5 py-3 text-sm font-bold text-emerald-300 shadow-xl">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">Operations</p>
            <h1 className="text-3xl font-black tracking-tight text-white">Depots & Branches</h1>
            <p className="mt-1 text-sm text-white/45">All your fulfilment hubs and collection points.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-white hover:bg-white/10">
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={() => { setEditing(null); setShowModal(true); }}
              className="flex items-center gap-2 rounded-2xl bg-sky-500 px-5 py-2.5 text-sm font-black text-slate-950 hover:bg-sky-400 transition"
            >
              <Plus className="h-4 w-4" /> Add Depot
            </button>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">Total Depots</div>
          <div className="mt-1.5 text-3xl font-black text-white">{depots.length}</div>
        </div>
        <div className="rounded-[24px] border border-sky-500/20 bg-sky-500/5 p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-300/60">With GPS</div>
          <div className="mt-1.5 text-3xl font-black text-sky-300">
            {depots.filter(d => d.lat && d.lng).length}
          </div>
        </div>
        <div className="rounded-[24px] border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-300/60">No GPS</div>
          <div className="mt-1.5 text-3xl font-black text-amber-300">
            {depots.filter(d => !d.lat || !d.lng).length}
          </div>
        </div>
      </div>

      {/* Depot grid */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-[24px] border border-white/5 bg-white/[0.03]" />
          ))}
        </div>
      ) : depots.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] py-20 text-center">
          <Building2 className="h-12 w-12 text-white/10" />
          <div>
            <div className="text-sm font-bold text-white/40">No depots yet</div>
            <p className="mt-1 text-xs text-white/25">Click "Add Depot" to register your first hub.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {depots.map(depot => (
            <div key={depot.id}
              className="group rounded-[24px] border border-white/10 bg-white/[0.05] p-5 hover:bg-white/[0.08] transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 shrink-0 rounded-xl border border-sky-500/20 bg-sky-500/10 grid place-items-center">
                    <Building2 className="h-4.5 w-4.5 text-sky-300" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-black text-white truncate">{depot.name}</div>
                    {depot.city && (
                      <div className="text-xs text-white/40 mt-0.5">{depot.city}</div>
                    )}
                  </div>
                </div>
                <div className={`shrink-0 rounded-xl px-2 py-1 text-[10px] font-bold border ${
                  depot.lat && depot.lng
                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                    : "border-amber-500/25 bg-amber-500/10 text-amber-300"
                }`}>
                  {depot.lat && depot.lng ? "GPS ✓" : "No GPS"}
                </div>
              </div>

              <div className="mt-3 space-y-1 text-xs text-white/40">
                {depot.address && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{depot.address}</span>
                  </div>
                )}
                {depot.lat && depot.lng && (
                  <div className="font-mono text-[11px] text-white/25">
                    {depot.lat.toFixed(4)}, {depot.lng.toFixed(4)}
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="text-[10px] text-white/20">
                  Added {new Date(depot.createdAt).toLocaleDateString("en-ZA")}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => { setEditing(depot); setShowModal(true); }}
                    className="rounded-xl border border-white/10 bg-white/5 p-1.5 text-white/50 hover:bg-sky-500/20 hover:text-sky-300 transition"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(depot.id)}
                    disabled={deleting === depot.id}
                    className="rounded-xl border border-white/10 bg-white/5 p-1.5 text-white/50 hover:bg-red-500/20 hover:text-red-300 transition disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Map hint */}
      {depots.some(d => d.lat && d.lng) && (
        <div className="rounded-[20px] border border-white/5 bg-black/20 p-4 text-xs text-white/25">
          <MapPin className="h-3.5 w-3.5 inline mr-1.5 text-white/20" />
          Depots with GPS coordinates appear on the live driver map and are used for route optimization.
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <DepotModal
          initial={editing}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(null); }}
        />
      )}
    </div>
  );
}
