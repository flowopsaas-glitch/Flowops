import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Clock,
  Loader2, Plus, RefreshCw, Truck, Wrench,
} from "lucide-react";
import { api } from "../api/client";

type FleetDriver = {
  id: string; name: string; vehicleType: string; vehicleReg?: string | null;
  status: string; currentKm: number | null; nextServiceKm: number | null;
  nextServiceDate: string | null; vehicleNotes: string | null;
  services: Array<{ servicedAt: string; serviceType: string }>;
  kmUntilService: number | null; daysUntilService: number | null;
  serviceAlert: boolean;
};

type ServiceLog = {
  id: string; serviceType: string; notes?: string | null;
  kmAtService?: number | null; cost?: number | null; servicedAt: string;
};

function unwrapList(r: any): any[] { const d = r?.data ?? r; return Array.isArray(d) ? d : []; }
function unwrap(r: any): any { return r?.data ?? r; }

const SERVICE_TYPES = [
  "Oil Change", "Tyre Rotation", "Tyre Replacement", "Annual Service",
  "Brake Service", "Battery Replacement", "Wheel Alignment", "Transmission Service",
  "Air Filter", "Spark Plugs", "Coolant Flush", "Other",
];

export default function FleetMaintenance() {
  const [drivers, setDrivers] = useState<FleetDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FleetDriver | null>(null);
  const [history, setHistory] = useState<ServiceLog[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const [showOdoForm, setShowOdoForm] = useState(false);

  // Log service form
  const [logForm, setLogForm] = useState({ serviceType: SERVICE_TYPES[0], notes: "", kmAtService: "", cost: "", servicedAt: "" });
  const [saving, setSaving] = useState(false);

  // Odometer form
  const [odoForm, setOdoForm] = useState({ currentKm: "", nextServiceKm: "", nextServiceDate: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const raw: any = await api.get("/drivers/fleet/dashboard");
      setDrivers(unwrapList(raw));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadHistory = useCallback(async (driverId: string) => {
    setHistLoading(true);
    try {
      const raw: any = await api.get(`/drivers/${driverId}/service-history`);
      setHistory(unwrapList(raw));
    } finally { setHistLoading(false); }
  }, []);

  const selectDriver = (d: FleetDriver) => {
    setSelected(d);
    setShowLogForm(false);
    setShowOdoForm(false);
    setOdoForm({ currentKm: String(d.currentKm ?? ""), nextServiceKm: String(d.nextServiceKm ?? ""), nextServiceDate: d.nextServiceDate ? d.nextServiceDate.slice(0, 10) : "" });
    void loadHistory(d.id);
  };

  const logService = async () => {
    if (!selected || !logForm.serviceType) return;
    setSaving(true);
    try {
      await api.post(`/drivers/${selected.id}/service-log`, {
        serviceType: logForm.serviceType,
        notes: logForm.notes || undefined,
        kmAtService: logForm.kmAtService ? parseInt(logForm.kmAtService) : undefined,
        cost: logForm.cost ? parseFloat(logForm.cost) : undefined,
        servicedAt: logForm.servicedAt || undefined,
      });
      setLogForm({ serviceType: SERVICE_TYPES[0], notes: "", kmAtService: "", cost: "", servicedAt: "" });
      setShowLogForm(false);
      await loadHistory(selected.id);
      await load();
    } finally { setSaving(false); }
  };

  const saveOdometer = async () => {
    if (!selected || !odoForm.currentKm) return;
    setSaving(true);
    try {
      await api.patch(`/drivers/${selected.id}/odometer`, {
        currentKm: parseInt(odoForm.currentKm),
        nextServiceKm: odoForm.nextServiceKm ? parseInt(odoForm.nextServiceKm) : undefined,
        nextServiceDate: odoForm.nextServiceDate || undefined,
      });
      setShowOdoForm(false);
      await load();
    } finally { setSaving(false); }
  };

  const alerts = useMemo(() => drivers.filter((d) => d.serviceAlert).length, [drivers]);

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.06),transparent_28%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8 overflow-y-auto">
      <div className="mx-auto max-w-[1200px] space-y-6">

        {/* Header */}
        <div className="rounded-[30px] border border-white/10 bg-white/6 p-6 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300">
                <Wrench className="h-3.5 w-3.5" /> Fleet Maintenance
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-white">Vehicle Service Tracker</h1>
              <p className="mt-1 text-sm text-white/50">Track odometers, log services, and never miss a service date.</p>
            </div>
            <div className="flex items-center gap-3">
              {alerts > 0 && (
                <span className="flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" /> {alerts} service alert{alerts !== 1 ? "s" : ""}
                </span>
              )}
              <button onClick={load} className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-white hover:bg-white/10">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
          {/* Driver fleet list */}
          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-[24px] border border-white/5 bg-white/[0.03]" />
              ))
            ) : drivers.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-white/10 py-16 text-center">
                <Truck className="mx-auto h-10 w-10 text-white/10 mb-3" />
                <div className="text-white/30 font-bold">No drivers in fleet yet.</div>
              </div>
            ) : drivers.map((d) => (
              <button
                key={d.id}
                onClick={() => selectDriver(d)}
                className={`w-full rounded-[24px] border p-5 text-left transition-all ${
                  selected?.id === d.id
                    ? "border-amber-400/30 bg-amber-500/8"
                    : d.serviceAlert
                    ? "border-amber-400/20 bg-amber-500/5 hover:bg-amber-500/10"
                    : "border-white/10 bg-white/[0.05] hover:bg-white/[0.08]"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/8 ring-1 ring-white/10">
                      <Truck className="h-5 w-5 text-white/60" />
                    </div>
                    <div>
                      <div className="font-bold text-white">{d.name}</div>
                      <div className="text-xs text-white/40">
                        {d.vehicleReg ?? d.vehicleType}
                        {d.currentKm != null && ` · ${d.currentKm.toLocaleString()} km`}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    {d.serviceAlert ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                        <AlertTriangle className="h-3 w-3" /> Service Due
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-500/8 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" /> OK
                      </span>
                    )}
                    {d.kmUntilService != null && (
                      <span className="text-[10px] text-white/30">
                        {d.kmUntilService <= 0 ? "Overdue" : `${d.kmUntilService.toLocaleString()} km to service`}
                      </span>
                    )}
                    {d.daysUntilService != null && (
                      <span className="text-[10px] text-white/30">
                        {d.daysUntilService <= 0 ? "Service date passed" : `${d.daysUntilService}d until service`}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Detail panel */}
          {selected ? (
            <div className="space-y-4">
              {/* Driver header */}
              <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/20">
                    <Truck className="h-5 w-5 text-amber-400" />
                  </div>
                  <div>
                    <div className="font-black text-white">{selected.name}</div>
                    <div className="text-xs text-white/40">{selected.vehicleReg ?? selected.vehicleType}</div>
                  </div>
                </div>
                {selected.vehicleNotes && (
                  <div className="text-xs text-white/50 bg-black/20 rounded-xl px-3 py-2">{selected.vehicleNotes}</div>
                )}
                <div className="mt-3 flex gap-2">
                  <button onClick={() => { setShowOdoForm((v) => !v); setShowLogForm(false); }}
                    className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/70 hover:bg-white/10">
                    {showOdoForm ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    Update Odometer
                  </button>
                  <button onClick={() => { setShowLogForm((v) => !v); setShowOdoForm(false); }}
                    className="flex items-center gap-2 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/20">
                    <Plus className="h-3.5 w-3.5" /> Log Service
                  </button>
                </div>
              </div>

              {/* Odometer form */}
              {showOdoForm && (
                <div className="rounded-[20px] border border-white/10 bg-white/[0.05] p-4 space-y-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.14em] text-white/50">Update Odometer</div>
                  {[
                    { label: "Current km *", key: "currentKm", type: "number", placeholder: "e.g. 45000" },
                    { label: "Next service at km", key: "nextServiceKm", type: "number", placeholder: "e.g. 50000" },
                    { label: "Next service date", key: "nextServiceDate", type: "date", placeholder: "" },
                  ].map(({ label, key, type, placeholder }) => (
                    <div key={key}>
                      <label className="text-[10px] text-white/40 block mb-1">{label}</label>
                      <input type={type} placeholder={placeholder}
                        value={(odoForm as any)[key]}
                        onChange={(e) => setOdoForm((p) => ({ ...p, [key]: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-amber-400" />
                    </div>
                  ))}
                  <button disabled={saving || !odoForm.currentKm} onClick={saveOdometer}
                    className="w-full rounded-2xl bg-amber-500 hover:bg-amber-400 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Save Odometer"}
                  </button>
                </div>
              )}

              {/* Log service form */}
              {showLogForm && (
                <div className="rounded-[20px] border border-white/10 bg-white/[0.05] p-4 space-y-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.14em] text-white/50">Log Service Record</div>
                  <div>
                    <label className="text-[10px] text-white/40 block mb-1">Service type *</label>
                    <select value={logForm.serviceType} onChange={(e) => setLogForm((p) => ({ ...p, serviceType: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-[#071224] px-3 py-2 text-sm text-white outline-none focus:border-amber-400">
                      {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  {[
                    { label: "Km at service", key: "kmAtService", type: "number", placeholder: "45000" },
                    { label: "Cost (ZAR)", key: "cost", type: "number", placeholder: "1200.00" },
                    { label: "Service date", key: "servicedAt", type: "date", placeholder: "" },
                    { label: "Notes", key: "notes", type: "text", placeholder: "Replaced front tyres, aligned…" },
                  ].map(({ label, key, type, placeholder }) => (
                    <div key={key}>
                      <label className="text-[10px] text-white/40 block mb-1">{label}</label>
                      <input type={type} placeholder={placeholder}
                        value={(logForm as any)[key]}
                        onChange={(e) => setLogForm((p) => ({ ...p, [key]: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-amber-400" />
                    </div>
                  ))}
                  <button disabled={saving} onClick={logService}
                    className="w-full rounded-2xl bg-amber-500 hover:bg-amber-400 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Save Service Record"}
                  </button>
                </div>
              )}

              {/* Service history */}
              <div className="rounded-[20px] border border-white/10 bg-white/[0.05] overflow-hidden">
                <div className="border-b border-white/10 px-4 py-3">
                  <span className="text-[11px] font-black uppercase tracking-[0.14em] text-white/50">Service History</span>
                </div>
                {histLoading ? (
                  <div className="py-8 text-center text-white/30 text-sm">Loading…</div>
                ) : history.length === 0 ? (
                  <div className="py-8 text-center text-white/20 text-sm">No service records yet.</div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {history.map((s) => (
                      <div key={s.id} className="flex items-start justify-between px-4 py-3">
                        <div>
                          <div className="text-sm font-bold text-white">{s.serviceType}</div>
                          {s.notes && <div className="text-xs text-white/40 mt-0.5">{s.notes}</div>}
                          <div className="text-[10px] text-white/30 mt-1 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(s.servicedAt).toLocaleDateString("en-ZA")}
                            {s.kmAtService != null && ` · ${s.kmAtService.toLocaleString()} km`}
                          </div>
                        </div>
                        {s.cost != null && (
                          <span className="text-sm font-bold text-white/60">
                            ZAR {s.cost.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] min-h-[200px]">
              <div className="text-center text-white/20">
                <Wrench className="h-8 w-8 mx-auto mb-2" />
                <div className="text-sm font-bold">Select a driver to view fleet details</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
