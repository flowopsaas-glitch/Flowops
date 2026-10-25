import { useCallback, useEffect, useState } from "react";
import { Calculator, Loader2, RefreshCw, Scale } from "lucide-react";
import {
  listTripTruth,
  recomputeTripTruth,
  type AllocationProvenance,
  type RecomputeSummary,
  type TripTruthList,
} from "../../api/tripTruthApi";
import { errorMessageOf } from "../patterns/errorMessage";
import { formatMoney } from "../../lib/currency";
import BelowCostQueue from "./BelowCostQueue";
import TruckPack from "./TruckPack";

const tenantCurrency = () => window.__FLOWOPS_CURRENCY__ ?? "ZAR";

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const PROVENANCE_STYLES: Record<AllocationProvenance, string> = {
  MEASURED: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  ALLOCATED: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  ESTIMATED: "border-amber-400/40 bg-amber-400/10 text-amber-300",
};

const PROVENANCE_TITLES: Record<AllocationProvenance, string> = {
  MEASURED: "Cost comes from entries recorded against this trip",
  ALLOCATED: "Recorded entries shared across trips, split by a stated rule",
  ESTIMATED: "No recorded costs — config-rate estimate, not measured truth",
};

/**
 * Trip Truth: what each delivered trip actually cost, built from recorded
 * fuel/toll entries. The headline margin covers measured + allocated trips
 * only; estimates are always badged and totalled separately, because an
 * estimate presented as truth is how operators lose money quietly.
 */
export default function TripTruthPanel() {
  const [period, setPeriod] = useState(currentPeriod());
  const [belowCostOnly, setBelowCostOnly] = useState(false);
  const [provenance, setProvenance] = useState<string>("");
  const [data, setData] = useState<TripTruthList | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [computing, setComputing] = useState(false);
  const [computeError, setComputeError] = useState<string | null>(null);
  const [lastCompute, setLastCompute] = useState<RecomputeSummary | null>(null);

  // Loader shape follows the lint-clean Clients/Fleet pages: state writes
  // inside try, AbortSignal guard, rejection surfaced by the callers.
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const list = await listTripTruth({
          period,
          belowCostOnly: belowCostOnly || undefined,
          provenance: provenance || undefined,
        });
        if (signal?.aborted) return;
        setData(list);
        setLoadError(null);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [period, belowCostOnly, provenance],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoadError(errorMessageOf(error));
    });
    return () => controller.abort();
  }, [load]);

  const recompute = async () => {
    setComputing(true);
    setComputeError(null);
    try {
      const summary = await recomputeTripTruth(period);
      setLastCompute(summary);
      await load();
    } catch (error) {
      setComputeError(errorMessageOf(error));
    } finally {
      setComputing(false);
    }
  };

  const reload = () => {
    setLoading(true);
    load().catch((error: unknown) => setLoadError(errorMessageOf(error)));
  };

  const inputClass =
    "rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none";
  const measured = data?.summary.measured;
  const estimated = data?.summary.estimated;
  const measuredMarginPct =
    measured && measured.revenue > 0 ? (measured.margin / measured.revenue) * 100 : null;
  const allEstimated =
    data != null && data.trips.length > 0 && measured != null && measured.trips === 0;

  return (
    <section aria-labelledby="trip-truth-heading" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="trip-truth-heading" className="flex items-center gap-2 text-base font-bold">
            <Scale className="h-5 w-5" /> Trip Truth — true cost per delivered trip
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-white/45">
            Built from fuel and tolls actually recorded (driver app + Fleet → Trip costs),
            split across trips by stated rules. The headline below counts measured trips
            only — estimates are badged and totalled separately, never blended in.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="tt-period">Period</label>
          <input
            id="tt-period"
            type="month"
            className={inputClass}
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setLoading(true);
            }}
          />
          <button
            type="button"
            onClick={reload}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button
            type="button"
            onClick={() => void recompute()}
            disabled={computing}
            title="Rebuild per-trip costs from recorded entries (managers)"
            className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-bold text-black disabled:opacity-50"
          >
            {computing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calculator className="h-3.5 w-3.5" />}
            Recompute
          </button>
        </div>
      </div>

      {computeError && (
        <p role="alert" className="text-sm text-red-300">
          Recompute failed: {computeError}
        </p>
      )}
      {lastCompute && (
        <p role="status" className="text-sm text-white/60">
          Recomputed {lastCompute.trips} trips: {lastCompute.measured} measured,{" "}
          {lastCompute.allocated} allocated, {lastCompute.estimated} estimated.
          {lastCompute.exceptionsOpened > 0 && (
            <span className="text-red-300">
              {" "}
              {lastCompute.exceptionsOpened} new below-cost{" "}
              {lastCompute.exceptionsOpened === 1 ? "exception" : "exceptions"} opened below.
            </span>
          )}
          {lastCompute.unallocatedEntries > 0 && (
            <>
              {" "}
              <span className="text-amber-300">
                {formatMoney(lastCompute.unallocatedCost, tenantCurrency())} of recorded costs
                ({lastCompute.unallocatedEntries}{" "}
                {lastCompute.unallocatedEntries === 1 ? "entry" : "entries"}) could not be tied
                to a delivered trip — they are not smeared across other trips.
              </span>
            </>
          )}
        </p>
      )}

      <BelowCostQueue period={period} />

      {allEstimated && (
        <p role="status" className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">
          No measured trip costs yet for this period — every figure below is a config-rate
          estimate. When drivers log fuel and tolls (driver app, or Fleet → Trip costs),
          recompute replaces estimates with what trips actually cost.
        </p>
      )}

      {measured && measured.trips > 0 && (
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-white/40">
              Measured truth · {measured.trips} {measured.trips === 1 ? "trip" : "trips"}
            </div>
            <div className="mt-1 text-lg font-black">
              {formatMoney(measured.margin, tenantCurrency())}
              {measuredMarginPct != null && (
                <span className={measuredMarginPct < 0 ? "text-red-300" : "text-emerald-300"}>
                  {" "}({measuredMarginPct.toFixed(1)}%)
                </span>
              )}
            </div>
            <div className="text-xs text-white/45">
              Revenue {formatMoney(measured.revenue, tenantCurrency())} − recorded cost{" "}
              {formatMoney(measured.cost, tenantCurrency())}
            </div>
          </div>
          {estimated && estimated.trips > 0 && (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-200/70">
                Estimated · {estimated.trips} {estimated.trips === 1 ? "trip" : "trips"} (excluded above)
              </div>
              <div className="mt-1 text-lg font-black text-white/80">
                {formatMoney(estimated.margin, tenantCurrency())}
              </div>
              <div className="text-xs text-white/45">
                Config-rate guess until costs are recorded for these trips
              </div>
            </div>
          )}
          {data && data.summary.deliveredNotComputed > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-white/40">
                Not yet computed
              </div>
              <div className="mt-1 text-lg font-black">{data.summary.deliveredNotComputed}</div>
              <div className="text-xs text-white/45">
                Delivered trips with no cost row yet — press Recompute
              </div>
            </div>
          )}
        </div>
      )}

      <TruckPack period={period} />

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2 text-white/70">
          <input
            type="checkbox"
            checked={belowCostOnly}
            onChange={(e) => {
              setBelowCostOnly(e.target.checked);
              setLoading(true);
            }}
          />
          Below-cost trips only
        </label>
        <label className="flex items-center gap-2 text-white/70">
          Basis
          <select
            className={inputClass}
            value={provenance}
            onChange={(e) => {
              setProvenance(e.target.value);
              setLoading(true);
            }}
            aria-label="Filter by cost basis"
          >
            <option value="">All bases</option>
            <option value="MEASURED">Measured</option>
            <option value="ALLOCATED">Allocated</option>
            <option value="ESTIMATED">Estimated</option>
          </select>
        </label>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-white/40">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading trip truth…
        </p>
      ) : loadError ? (
        <p role="alert" className="text-sm text-red-300">
          Could not load trip truth: {loadError}
        </p>
      ) : !data || data.trips.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-white/40">
          No computed trips for {period} yet. Press Recompute to build per-trip costs from
          recorded fuel and toll entries — trips nobody recorded costs for will be flagged
          as estimates, not silently zeroed.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-white/40">
                <th scope="col" className="py-2 pr-3">Trip</th>
                <th scope="col" className="py-2 pr-3">Client</th>
                <th scope="col" className="py-2 pr-3">Basis</th>
                <th scope="col" className="py-2 pr-3 text-right">Revenue</th>
                <th scope="col" className="py-2 pr-3 text-right">Cost</th>
                <th scope="col" className="py-2 pr-3 text-right">Margin</th>
                <th scope="col" className="py-2 text-right">Margin %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {data.trips.map((trip) => (
                <tr key={trip.id}>
                  <td className="py-2.5 pr-3 font-semibold">{trip.trackingNumber ?? trip.waybillId}</td>
                  <td className="py-2.5 pr-3 text-white/60">{trip.clientName ?? "—"}</td>
                  <td className="py-2.5 pr-3">
                    {trip.provenance ? (
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${PROVENANCE_STYLES[trip.provenance]}`}
                        title={trip.allocationNote ?? PROVENANCE_TITLES[trip.provenance]}
                      >
                        {trip.provenance}
                      </span>
                    ) : (
                      <span className="text-white/30">unknown</span>
                    )}
                    {trip.sourceEntryCount > 0 && (
                      <span className="ml-1.5 text-[10px] text-white/35">
                        {trip.sourceEntryCount} {trip.sourceEntryCount === 1 ? "entry" : "entries"}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right">{formatMoney(trip.revenue, tenantCurrency())}</td>
                  <td className="py-2.5 pr-3 text-right">{formatMoney(trip.totalCost, tenantCurrency())}</td>
                  <td className={`py-2.5 pr-3 text-right font-bold ${trip.grossMargin < 0 ? "text-red-300" : ""}`}>
                    {formatMoney(trip.grossMargin, tenantCurrency())}
                  </td>
                  <td className={`py-2.5 text-right ${trip.grossMargin < 0 ? "text-red-300" : "text-white/60"}`}>
                    {trip.revenue > 0 ? `${trip.marginPercent.toFixed(1)}%` : "no revenue"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
