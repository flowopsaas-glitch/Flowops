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
