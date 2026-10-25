import { api } from "./client";

/**
 * Trip Truth — per-trip cost truth built from recorded trip costs.
 * Every row declares its basis (provenance):
 *  MEASURED  — recorded entries tied to the trip
 *  ALLOCATED — recorded entries shared across trips, split by a stated rule
 *  ESTIMATED — no recorded costs; config-rate estimate, shown separately
 * Estimates are never blended into the measured headline by the backend,
 * and this UI keeps them visually separate too.
 */
export type AllocationProvenance = "MEASURED" | "ALLOCATED" | "ESTIMATED";

export type TripTruthRow = {
  id: string;
  waybillId: string;
  trackingNumber?: string | null;
  period: string;
  revenue: number;
  fuelCost: number;
  labourCost: number;
  vehicleCost: number;
  overheadCost: number;
  tollsCost: number;
  otherCost: number;
  totalCost: number;
  grossMargin: number;
  marginPercent: number;
  provenance?: AllocationProvenance | null;
  sourceEntryCount: number;
  allocationNote?: string | null;
  distanceKm?: number | null;
  clientName?: string | null;
  updatedAt: string;
};

export type TripTruthList = {
  period: string;
  computedAt: string | null;
  trips: TripTruthRow[];
  total: number;
  summary: {
    measured: { trips: number; revenue: number; cost: number; margin: number };
    estimated: { trips: number; revenue: number; cost: number; margin: number };
    deliveredNotComputed: number;
  };
};

export type RecomputeSummary = {
  period: string;
  computedAt: string;
  trips: number;
  measured: number;
  allocated: number;
  estimated: number;
  recordedCost: number;
  estimatedCost: number;
  unallocatedCost: number;
  unallocatedEntries: number;
  exceptionsOpened: number;
  exceptionsOpen: number;
};

export type MarginExceptionStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";

export type TripExceptionRow = TripTruthRow & {
  exceptionStatus: MarginExceptionStatus | null;
  exceptionNote?: string | null;
  exceptionBy?: string | null;
  exceptionAt?: string | null;
};

export type TripExceptionList = {
  period: string;
  exceptions: TripExceptionRow[];
  counts: { open: number; acknowledged: number };
};

function unwrap<T>(r: unknown): T {
  return ((r as { data?: T } | null)?.data ?? r) as T;
}

export async function listTripTruth(params: {
  period: string;
  belowCostOnly?: boolean;
  provenance?: string;
}): Promise<TripTruthList> {
  const res = await api.get("/commercial-analytics/trip-truth", { params });
  return unwrap<TripTruthList>(res.data);
}

export async function recomputeTripTruth(period: string): Promise<RecomputeSummary> {
  const res = await api.post("/commercial-analytics/trip-truth/recompute", { period });
  return unwrap<RecomputeSummary>(res.data);
}

export async function listTripExceptions(period: string): Promise<TripExceptionList> {
  const res = await api.get("/commercial-analytics/trip-truth/exceptions", {
    params: { period },
  });
  return unwrap<TripExceptionList>(res.data);
}

export async function updateTripException(
  waybillId: string,
  status: MarginExceptionStatus,
  note?: string,
): Promise<TripExceptionRow> {
  const res = await api.patch(`/commercial-analytics/trip-truth/${waybillId}/exception`, {
    status,
    note,
  });
  return unwrap<TripExceptionRow>(res.data);
}

export type TruckKmTruth = {
  status: "MEASURED" | "PARTIAL" | "NOT_MEASURED";
  loadedKm: number | null;
  odometerSpanKm: number | null;
  readings: number;
  emptyKm: number | null;
  emptyPct: number | null;
  note: string;
};

export type TruckPackRow = {
  driverId: string;
  driverName: string;
  vehicleReg?: string | null;
  trips: number;
  measuredTrips: number;
  estimatedTrips: number;
  revenue: number;
  recordedCost: number;
  tripMargin: number;
  marginPct: number;
  estimatedRevenue: number;
  estimatedCost: number;
  serviceCost: number;
  serviceEvents: number;
  netMargin: number;
  costPerKm: {
    value: number;
    loadedKm: number;
    tripsWithDistance: number;
    trips: number;
  } | null;
  belowCostTrips: number;
  openExceptions: number;
  worstTripMargin: number | null;
  km: TruckKmTruth;
};

export type TruckPack = {
  period: string;
  trucks: TruckPackRow[];
  unassigned: {
    trips: number;
    measuredTrips: number;
    estimatedTrips: number;
    revenue: number;
    recordedCost: number;
    tripMargin: number;
  } | null;
  fleet: {
    trucks: number;
    trips: number;
    measuredTrips: number;
    estimatedTrips: number;
    revenue: number;
    recordedCost: number;
    tripMargin: number;
    serviceCost: number;
    netMargin: number;
  };
};

export async function getTruckPack(period: string): Promise<TruckPack> {
  const res = await api.get("/commercial-analytics/trip-truth/truck-pack", {
    params: { period },
  });
  return unwrap<TruckPack>(res.data);
}
