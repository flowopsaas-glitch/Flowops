import { useCallback, useEffect, useState } from "react";
import { Fuel, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { api } from "../../api/client";
import {
  createTripCost,
  deleteTripCost,
  listTripCosts,
  type TripCostEntry,
  type TripCostType,
} from "../../api/tripCostsApi";
import { errorMessageOf } from "../patterns/errorMessage";
import { formatMoney } from "../../lib/currency";

const tenantCurrency = () => window.__FLOWOPS_CURRENCY__ ?? "ZAR";

function unwrap<T>(r: unknown): T {
  return ((r as { data?: T } | null)?.data ?? r) as T;
}

type DriverOption = { id: string; name: string; vehicleReg?: string | null };

const TYPE_LABELS: Record<TripCostType, string> = {
  FUEL: "Fuel",
  TOLL: "Toll",
  OTHER: "Other",
};

function monthStartIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

function todayInputValue(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Measured trip costs for the current month: what drivers and the office
 * actually recorded at the pump and the toll gate. This panel is the office
 * half of per-trip truth — the totals are sums of RECORDED entries only,
 * so a quiet month reads as "nothing recorded", never as "costs were zero".
 */
export default function TripCostsPanel() {
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [entries, setEntries] = useState<TripCostEntry[]>([]);
  const [totals, setTotals] = useState<{ total: number; count: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [driverId, setDriverId] = useState("");
  const [type, setType] = useState<TripCostType>("FUEL");
  const [amount, setAmount] = useState("");
  const [litres, setLitres] = useState("");
  const [odometer, setOdometer] = useState("");
  const [date, setDate] = useState(todayInputValue());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Loader shape follows the lint-clean Clients page: AbortSignal guard
  // between the awaits and the state writes, no catch inside the loader —
  // rejections are surfaced by the callers (effect .catch / reload below).
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const driverRes = await api.get("/drivers");
      const list = await listTripCosts({ from: monthStartIso(), limit: 50 });
      if (signal?.aborted) return;
      const rawDrivers = unwrap<unknown>(driverRes.data);
      const driverList = (
        Array.isArray(rawDrivers)
          ? rawDrivers
          : ((rawDrivers as { data?: unknown[] } | null)?.data ?? [])
      ) as DriverOption[];
      setDrivers(driverList);
      setEntries(list.data);
      setTotals({ total: list.totals.total, count: list.totals.count });
      setLoadError(null);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(errorMessageOf(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [load]);

  /** Reload from event handlers (refresh button, after save/remove). */
  const reload = async () => {
    setLoading(true);
    try {
      await load();
    } catch (error) {
      setLoadError(errorMessageOf(error));
    } finally {
      setLoading(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setNotice(null);
    const amountValue = Number(amount);
    if (!driverId) {
      setFormError("Choose the driver who incurred this cost.");
      return;
    }
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setFormError("Amount must be a positive number.");
      return;
    }
    setSaving(true);
    try {
      await createTripCost({
        type,
        amount: amountValue,
        driverId,
        litres: type === "FUEL" && litres ? Number(litres) : undefined,
        odometerKm: odometer ? Number(odometer) : undefined,
        note: note.trim() ? note.trim() : undefined,
        occurredAt: date ? new Date(`${date}T12:00:00`).toISOString() : undefined,
      });
      setAmount("");
      setLitres("");
      setOdometer("");
      setNote("");
      setNotice("Cost recorded. It now counts toward that driver's measured trip costs.");
      await reload();
    } catch (error) {
      setFormError(errorMessageOf(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (entry: TripCostEntry) => {
    setFormError(null);
    setNotice(null);
    try {
      await deleteTripCost(entry.id);
      setNotice("Entry removed.");
      await reload();
    } catch (error) {
      setFormError(errorMessageOf(error));
    }
  };

  const inputClass =
    "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-white/30 focus:outline-none";
  const labelClass = "block text-[11px] font-semibold uppercase tracking-wide text-white/40 mb-1";

  return (
    <section
      aria-labelledby="trip-costs-heading"
      className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="trip-costs-heading"
            className="flex items-center gap-2 text-base font-bold text-white"
          >
            <Fuel className="h-5 w-5" /> Trip costs — measured, not estimated
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-white/45">
            Fuel and tolls actually paid, recorded by drivers on the road or captured here.
            Totals below sum recorded entries for this month only — a trip with no entry has
            unknown cost, never zero.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {totals && (
        <p className="mt-4 text-sm text-white/70" role="status">
          Recorded this month:{" "}
          <strong className="text-white">{formatMoney(totals.total, tenantCurrency())}</strong>{" "}
          across {totals.count} {totals.count === 1 ? "entry" : "entries"}
        </p>
      )}

      <form onSubmit={(e) => void submit(e)} className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <label className={labelClass} htmlFor="tc-driver">Driver</label>
          <select
            id="tc-driver"
            className={inputClass}
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
          >
            <option value="">Select driver…</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.vehicleReg ? ` · ${d.vehicleReg}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="tc-type">Type</label>
          <select
            id="tc-type"
            className={inputClass}
            value={type}
            onChange={(e) => setType(e.target.value as TripCostType)}
          >
            {(Object.keys(TYPE_LABELS) as TripCostType[]).map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="tc-amount">Amount</label>
          <input
            id="tc-amount"
            className={inputClass}
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="tc-date">Date</label>
          <input
            id="tc-date"
            type="date"
            className={inputClass}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="tc-litres">Litres (fuel)</label>
          <input
            id="tc-litres"
            className={inputClass}
            inputMode="decimal"
            placeholder="—"
            disabled={type !== "FUEL"}
            value={litres}
            onChange={(e) => setLitres(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="tc-odo">Odometer (km)</label>
          <input
            id="tc-odo"
            className={inputClass}
            inputMode="numeric"
            placeholder="—"
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
          />
        </div>
        <div className="col-span-2">
          <label className={labelClass} htmlFor="tc-note">Note</label>
          <input
            id="tc-note"
            className={inputClass}
            placeholder="e.g. Toll gate, harbour run"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="col-span-2 flex items-end md:col-span-4">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Record cost
          </button>
        </div>
      </form>

      {formError && (
        <p role="alert" className="mt-3 text-sm text-red-300">{formError}</p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm text-emerald-300">{notice}</p>
      )}

      <div className="mt-5">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-white/40">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading recorded costs…
          </p>
        ) : loadError ? (
          <p role="alert" className="text-sm text-red-300">
            Could not load trip costs: {loadError}
          </p>
        ) : entries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-white/40">
            No costs recorded this month yet. When a driver logs fuel or a toll — on the road
            or here — it appears in this list and starts building the true cost of each trip.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <span className="text-xs text-white/40">
                  {new Date(entry.occurredAt).toLocaleDateString("en-ZA")}
                </span>
                <span className="text-sm font-semibold text-white">
                  {entry.driver?.name ?? "Driver"}
                </span>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/60">
                  {TYPE_LABELS[entry.type]}
                </span>
                <span className="text-sm font-bold text-white">
                  {formatMoney(entry.amount, tenantCurrency())}
                </span>
                {entry.litres != null && (
                  <span className="text-xs text-white/40">{entry.litres} L</span>
                )}
                {entry.odometerKm != null && (
                  <span className="text-xs text-white/40">
                    {entry.odometerKm.toLocaleString()} km
                  </span>
                )}
                {entry.note && <span className="text-xs text-white/40">{entry.note}</span>}
                <span className="text-[10px] uppercase tracking-wide text-white/25">
                  {entry.source === "DRIVER_APP" ? "driver app" : entry.source.toLowerCase()}
                </span>
                <button
                  type="button"
                  onClick={() => void remove(entry)}
                  aria-label={`Remove ${TYPE_LABELS[entry.type]} entry of ${formatMoney(entry.amount, tenantCurrency())}`}
                  className="ml-auto rounded-lg border border-white/10 p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
