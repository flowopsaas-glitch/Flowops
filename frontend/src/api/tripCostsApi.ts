import { api } from "./client";

/**
 * Measured trip costs — fuel/tolls/other actually paid, captured per driver
 * (and per waybill/manifest when known). Nothing here is estimated: a trip
 * with no entries has UNKNOWN fuel/toll cost, and the UI must never present
 * that absence as zero.
 */
export type TripCostType = "FUEL" | "TOLL" | "OTHER";
export type TripCostSource = "DRIVER_APP" | "OFFICE" | "IMPORT";

export type TripCostEntry = {
  id: string;
  driverId: string;
  waybillId?: string | null;
  manifestId?: string | null;
  type: TripCostType;
  amount: number;
  litres?: number | null;
  odometerKm?: number | null;
  note?: string | null;
  occurredAt: string;
  source: TripCostSource;
  driver?: { id: string; name: string; vehicleReg?: string | null } | null;
};

export type TripCostList = {
  data: TripCostEntry[];
  total: number;
  totals: {
    byType: Partial<Record<TripCostType, { total: number; count: number }>>;
    total: number;
    count: number;
  };
};

function unwrap<T>(r: unknown): T {
  return ((r as { data?: T } | null)?.data ?? r) as T;
}

export async function listTripCosts(params: {
  from?: string;
  to?: string;
  driverId?: string;
  limit?: number;
}): Promise<TripCostList> {
  const res = await api.get("/trip-costs", { params });
  return unwrap<TripCostList>(res.data);
}

export async function createTripCost(payload: {
  type: TripCostType;
  amount: number;
  driverId: string;
  litres?: number;
  odometerKm?: number;
  note?: string;
  occurredAt?: string;
}): Promise<TripCostEntry> {
  const res = await api.post("/trip-costs", payload);
  return unwrap<TripCostEntry>(res.data);
}

export async function deleteTripCost(id: string): Promise<void> {
  await api.delete(`/trip-costs/${id}`);
}
