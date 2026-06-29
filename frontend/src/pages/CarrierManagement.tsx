import { useEffect, useMemo, useState } from "react";
import {
  Ship, Plane, Truck, Package, Building2, Plus, Loader2, Trash2, Anchor, Search,
} from "lucide-react";
import * as carrierApi from "../api/carrierApi";
import { useToast } from "../components/ToastProvider";

const TYPE_META: Record<carrierApi.CarrierType, { label: string; icon: any }> = {
  OCEAN_LINE: { label: "Ocean line", icon: Ship },
  AIRLINE: { label: "Airline", icon: Plane },
  ROAD_CARRIER: { label: "Road carrier", icon: Truck },
  COURIER: { label: "Courier", icon: Package },
  CUSTOMS_BROKER: { label: "Customs broker", icon: Building2 },
  OTHER: { label: "Other", icon: Anchor },
};

const input = "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/25";

export default function CarrierManagement() {
  const { showToast } = useToast();
  const [carriers, setCarriers] = useState<carrierApi.Carrier[]>([]);
  const [metrics, setMetrics] = useState<carrierApi.CarrierMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", type: "OCEAN_LINE", code: "", contactEmail: "", accountNumber: "" });

  const load = async () => {
    setLoading(true);
    try {
      const [c, m] = await Promise.all([carrierApi.listCarriers(), carrierApi.carrierMetrics().catch(() => null)]);
      setCarriers(c);
      setMetrics(m);
    } catch (e: any) {
      showToast(e?.message ?? "Could not load carriers", "error");
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const visible = useMemo(() => {
    if (!q.trim()) return carriers;
    const s = q.toLowerCase();
    return carriers.filter((c) => c.name.toLowerCase().includes(s) || (c.code ?? "").toLowerCase().includes(s));
  }, [carriers, q]);

  const create = async () => {
    if (!form.name.trim()) { showToast("Carrier name is required", "error"); return; }
    setBusy("create");
    try {
      await carrierApi.createCarrier(form as any);
      setForm({ name: "", type: "OCEAN_LINE", code: "", contactEmail: "", accountNumber: "" });
      setShowNew(false);
      await load();
      showToast("Carrier added", "success");
    } catch (e: any) { showToast(e?.message ?? "Could not add carrier", "error"); }
    finally { setBusy(null); }
  };

  const remove = async (id: string) => {
    setBusy(id);
    try { await carrierApi.deleteCarrier(id); await load(); showToast("Carrier removed", "success"); }
    catch (e: any) { showToast(e?.message ?? "Could not remove", "error"); }
    finally { setBusy(null); }
  };

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.10),transparent_30%),linear-gradient(180deg,#07111f,#0b1530)] p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        {/* Header */}
        <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 fx-glass fx-reveal">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-indigo-500/20 ring-2 ring-indigo-500/30">
                <Ship className="h-7 w-7 text-indigo-300" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">Procurement</p>
                <h1 className="text-2xl font-black text-white">Carriers & Buy-Rates</h1>
                <p className="text-xs text-white/40">Shipping lines, airlines, road carriers & broker partners</p>
              </div>
            </div>
            <button onClick={() => setShowNew((v) => !v)} className="flex items-center gap-2 rounded-2xl border border-indigo-500/30 bg-indigo-500/15 px-5 py-2.5 text-sm font-bold text-indigo-200 hover:bg-indigo-500/25">
              <Plus className="h-4 w-4" /> Add carrier
            </button>
          </div>
          {metrics && (
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Kpi label="Carriers" value={metrics.total} />
              <Kpi label="Active" value={metrics.active} tone="text-emerald-300" />
              <Kpi label="Buy-rates" value={metrics.rates} tone="text-indigo-300" />
            </div>
          )}
          {showNew && (
            <div className="mt-4 grid sm:grid-cols-5 gap-2 rounded-2xl border border-indigo-500/20 bg-black/30 p-4">
              <input placeholder="Carrier name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={input}>
                {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <input placeholder="Code (SCAC/IATA)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={input} />
              <input placeholder="Account no." value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} className={input} />
              <button onClick={create} disabled={busy === "create"} className="flex items-center justify-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/20 py-2 text-sm font-black text-indigo-200 disabled:opacity-50">
                {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save
              </button>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/25" />
          <input placeholder="Search carriers…" value={q} onChange={(e) => setQ(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 py-2 text-sm text-white placeholder-white/25" />
        </div>

        {/* List */}
        {loading ? (
          <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-white/40" /></div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[24px] border border-dashed border-white/10 py-16 text-center">
            <Ship className="h-12 w-12 text-white/15" />
            <p className="text-sm font-bold text-white/40">No carriers yet</p>
            <p className="text-xs text-white/25">Add the shipping lines and carriers you book space with.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((c) => (
              <CarrierRow key={c.id} carrier={c} onChange={load} busy={busy} setBusy={setBusy} onRemove={() => remove(c.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CarrierRow({ carrier, onChange, busy, setBusy, onRemove }: {
  carrier: carrierApi.Carrier; onChange: () => void; busy: string | null;
  setBusy: (v: string | null) => void; onRemove: () => void;
}) {
  const { showToast } = useToast();
  const Icon = TYPE_META[carrier.type]?.icon ?? Anchor;
  const [showRate, setShowRate] = useState(false);
  const [rate, setRate] = useState({ lane: "", mode: "OCEAN", containerType: "", buyRate: "", currency: "USD" });

  const addRate = async () => {
    setBusy(`rate-${carrier.id}`);
    try {
      await carrierApi.addCarrierRate(carrier.id, { ...rate, buyRate: Number(rate.buyRate || 0) });
      setRate({ lane: "", mode: "OCEAN", containerType: "", buyRate: "", currency: "USD" });
      setShowRate(false);
      await onChange();
      showToast("Buy-rate added", "success");
    } catch (e: any) { showToast(e?.message ?? "Could not add rate", "error"); }
    finally { setBusy(null); }
  };

  const delRate = async (rateId: string) => {
    setBusy(`del-${rateId}`);
    try { await carrierApi.deleteCarrierRate(carrier.id, rateId); await onChange(); }
    catch (e: any) { showToast(e?.message ?? "Could not remove rate", "error"); }
    finally { setBusy(null); }
  };

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4 fx-lift">
      <div className="flex items-center gap-4">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500/10 ring-1 ring-indigo-500/20 shrink-0">
          <Icon className="h-5 w-5 text-indigo-300" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-black text-white">{carrier.name}</span>
            {carrier.code && <span className="text-[10px] font-mono text-white/40">{carrier.code}</span>}
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white/45">{TYPE_META[carrier.type]?.label}</span>
            {!carrier.isActive && <span className="text-[10px] text-rose-300">inactive</span>}
          </div>
          <div className="text-[11px] text-white/40 truncate">
            {carrier.accountNumber ? `acct ${carrier.accountNumber}` : "—"}{carrier.contactEmail ? ` · ${carrier.contactEmail}` : ""}
          </div>
        </div>
        <button onClick={() => setShowRate((v) => !v)} className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1.5 text-xs font-bold text-indigo-200 hover:bg-indigo-500/20">
          + rate
        </button>
        <button onClick={onRemove} disabled={busy === carrier.id} className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-1.5 text-rose-300 hover:bg-rose-500/20 disabled:opacity-40">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Buy-rates */}
      {(carrier.rates?.length ?? 0) > 0 && (
        <div className="mt-3 space-y-1">
          {carrier.rates!.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-lg bg-black/20 px-3 py-1.5 text-[11px] text-white/55">
              <span className="font-mono text-white/70">{r.lane || "—"}</span>
              <span className="text-white/35">{r.mode}{r.containerType ? ` · ${r.containerType}` : ""}</span>
              <span className="ml-auto font-bold text-indigo-200">{r.currency} {r.buyRate.toFixed(2)}</span>
              <button onClick={() => delRate(r.id)} disabled={busy === `del-${r.id}`} className="text-white/25 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}

      {showRate && (
        <div className="mt-3 grid sm:grid-cols-6 gap-2 rounded-xl border border-white/8 bg-black/20 p-3">
          <input placeholder="Lane (CNSHA → ZADUR)" value={rate.lane} onChange={(e) => setRate({ ...rate, lane: e.target.value })} className={`${input} sm:col-span-2`} />
          <select value={rate.mode} onChange={(e) => setRate({ ...rate, mode: e.target.value })} className={input}>
            {["OCEAN", "AIR", "ROAD"].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input placeholder="20GP/40HC/LCL" value={rate.containerType} onChange={(e) => setRate({ ...rate, containerType: e.target.value })} className={input} />
          <input type="number" placeholder="buy rate" value={rate.buyRate} onChange={(e) => setRate({ ...rate, buyRate: e.target.value })} className={input} />
          <button onClick={addRate} disabled={busy === `rate-${carrier.id}`} className="rounded-xl border border-indigo-500/30 bg-indigo-500/20 py-2 text-xs font-black text-indigo-200 disabled:opacity-50">
            {busy === `rate-${carrier.id}` ? "…" : "Add rate"}
          </button>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, tone = "text-white" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
      <div className={`text-2xl font-black ${tone}`}>{value}</div>
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40 mt-1">{label}</div>
    </div>
  );
}
