import { useCallback, useEffect, useState } from "react";
import { Loader2, Truck } from "lucide-react";
import { getTruckPack, type TruckPack as TruckPackData } from "../../api/tripTruthApi";
import { errorMessageOf } from "../patterns/errorMessage";
import { formatMoney } from "../../lib/currency";

const tenantCurrency = () => window.__FLOWOPS_CURRENCY__ ?? "ZAR";
const km = (n: number | null) => (n === null ? "—" : `${n.toLocaleString()} km`);

/**
 * Per-truck month-end pack (Slices 4–5): the same allocation rows as the
 * trip list, rolled up per truck — trip margin from recorded costs,
 * workshop spend as its own line, and net margin after both. Kilometres
 * are shown only as far as evidence reaches: loaded km is straight-line
 * sender→recipient distance, empty km appears only when an odometer span
 * was actually recorded, and is labelled an upper bound.
 */
export default function TruckPack({ period }: { period: string }) {
  const [pack, setPack] = useState<TruckPackData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Lint-proven loader shape (see TripTruthPanel).
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await getTruckPack(period);
        if (signal?.aborted) return;
        setPack(data);
        setLoadError(null);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [period],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoadError(errorMessageOf(error));
    });
    return () => controller.abort();
  }, [load]);

  return (
    <section
      aria-labelledby="truck-pack-heading"
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
    >
      <h3 id="truck-pack-heading" className="flex items-center gap-2 text-sm font-bold">
        <Truck className="h-4 w-4" /> Truck month-end pack
      </h3>
      <p className="mt-1 max-w-2xl text-xs text-white/45">
        Per truck for {period}: trip margin from recorded costs, workshop spend on its own
        line, net after both. Money counts measured trips only; estimated trips are noted,
        never blended. Loaded km is straight-line distance — empty km is shown only where
        an odometer span was recorded, and is an upper bound.
      </p>

      {loading ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-white/40">
          <Loader2 className="h-4 w-4 animate-spin" /> Building the truck pack…
        </p>
      ) : loadError ? (
        <p role="alert" className="mt-3 text-sm text-red-300">
          Could not load the truck pack: {loadError}
        </p>
      ) : !pack || pack.trucks.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-white/10 p-4 text-sm text-white/40">
          No trucks to pack for {period} yet — compute trip truth above first, then each
          truck's month rolls up here from the same rows.
        </p>
      ) : (
        <>
          <p role="status" className="mt-3 text-sm text-white/60">
            Fleet net for {period}:{" "}
            <strong className={pack.fleet.netMargin < 0 ? "text-red-300" : "text-white"}>
              {formatMoney(pack.fleet.netMargin, tenantCurrency())}
            </strong>{" "}
            (trip margin {formatMoney(pack.fleet.tripMargin, tenantCurrency())} − workshop{" "}
            {formatMoney(pack.fleet.serviceCost, tenantCurrency())}) across {pack.fleet.trucks}{" "}
            {pack.fleet.trucks === 1 ? "truck" : "trucks"} · {pack.fleet.measuredTrips} measured
            trips
            {pack.fleet.estimatedTrips > 0 &&
              ` · ${pack.fleet.estimatedTrips} estimated trips excluded`}
          </p>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-white/40">
                  <th scope="col" className="py-2 pr-3">Truck</th>
                  <th scope="col" className="py-2 pr-3 text-right">Trips</th>
                  <th scope="col" className="py-2 pr-3 text-right">Revenue</th>
                  <th scope="col" className="py-2 pr-3 text-right">Recorded cost</th>
                  <th scope="col" className="py-2 pr-3 text-right">Trip margin</th>
                  <th scope="col" className="py-2 pr-3 text-right">Workshop</th>
                  <th scope="col" className="py-2 pr-3 text-right">Net</th>
                  <th scope="col" className="py-2 pr-3 text-right">Cost/km</th>
                  <th scope="col" className="py-2 pr-3 text-right">Loaded km</th>
                  <th scope="col" className="py-2 text-right">Empty km</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {pack.trucks.map((t) => (
                  <tr key={t.driverId}>
                    <td className="py-2.5 pr-3">
                      <span className="font-semibold">{t.driverName}</span>
                      {t.vehicleReg && (
                        <span className="text-white/40"> · {t.vehicleReg}</span>
                      )}
                      <span className="block text-[11px] text-white/35">
                        {t.belowCostTrips > 0 &&
                          `${t.belowCostTrips} below-cost ${t.belowCostTrips === 1 ? "trip" : "trips"} · `}
                        {t.openExceptions > 0 && `${t.openExceptions} open exceptions · `}
                        {t.estimatedTrips > 0 && `${t.estimatedTrips} estimated trips excluded`}
                        {t.belowCostTrips === 0 && t.openExceptions === 0 && t.estimatedTrips === 0 &&
                          "all trips measured"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      {t.measuredTrips}
                      <span className="text-white/35">/{t.trips}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-right">{formatMoney(t.revenue, tenantCurrency())}</td>
                    <td className="py-2.5 pr-3 text-right">{formatMoney(t.recordedCost, tenantCurrency())}</td>
                    <td className={`py-2.5 pr-3 text-right font-bold ${t.tripMargin < 0 ? "text-red-300" : ""}`}>
                      {formatMoney(t.tripMargin, tenantCurrency())}
                      <span className="block text-[11px] font-normal text-white/35">
                        {t.revenue > 0 ? `${t.marginPct.toFixed(1)}%` : "no revenue"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right text-white/70">
                      {formatMoney(t.serviceCost, tenantCurrency())}
                      {t.serviceEvents > 0 && (
                        <span className="block text-[11px] text-white/35">
                          {t.serviceEvents} {t.serviceEvents === 1 ? "service" : "services"} logged
                        </span>
                      )}
                    </td>
                    <td className={`py-2.5 pr-3 text-right font-bold ${t.netMargin < 0 ? "text-red-300" : ""}`}>
                      {formatMoney(t.netMargin, tenantCurrency())}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-white/70">
                      {t.costPerKm ? (
                        <>
                          {formatMoney(t.costPerKm.value, tenantCurrency())}
                          <span className="block text-[11px] text-white/35">
                            over {t.costPerKm.tripsWithDistance}/{t.costPerKm.trips} trips
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-white/70">{km(t.km.loadedKm)}</td>
                    <td className="py-2.5 text-right">
                      {t.km.status === "MEASURED" ? (
                        <span className="font-semibold">
                          {km(t.km.emptyKm)}
                          <span className="block text-[11px] font-normal text-white/35">
                            {t.km.emptyPct?.toFixed(1)}% of {km(t.km.odometerSpanKm)} · upper bound
                          </span>
                        </span>
                      ) : (
                        <span
                          className="text-amber-300/80"
                          title={t.km.note}
                        >
                          not measured
                          <span className="block max-w-[220px] text-[11px] font-normal text-white/35">
                            {t.km.note}
                          </span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pack.unassigned && (
            <p className="mt-3 text-xs text-white/40">
              Not attributed to a truck: {pack.unassigned.trips}{" "}
              {pack.unassigned.trips === 1 ? "trip" : "trips"} with no driver on the manifest —{" "}
              {formatMoney(pack.unassigned.tripMargin, tenantCurrency())} margin on{" "}
              {pack.unassigned.measuredTrips} measured{" "}
              {pack.unassigned.measuredTrips === 1 ? "trip" : "trips"}. Put a driver on the
              run and these land in that truck's pack.
            </p>
          )}
        </>
      )}
    </section>
  );
}
