import { api } from "./client";

const unwrap = <T>(r: unknown): T => ((r as { data?: T } | null)?.data ?? r) as T;

/**
 * WP3 Stage 4 + Stage 5: Trip corridor split, HS code / origin / duty.
 *
 * All endpoints are tenant-scoped by the backend via the current user's
 * companyId. The frontend never sends companyId — it comes from the session.
 */

// ════════════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════════════

export interface Trip {
  id: string;
  companyId: string;
  reference: string;
  driverId?: string | null;
  vehicleReg?: string | null;
  origin?: string | null;
  destination?: string | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  status: "PLANNED" | "IN_TRANSIT" | "COMPLETED" | "CANCELLED";
  // ── WP3 Stage 5: HS code, origin status, duty ESTIMATED vs ACTUAL ─────
  hsCode?: string | null;
  originStatus?: "PREFERENTIAL" | "NON_PREFERENTIAL" | "UNKNOWN";
  certificateOfOriginRef?: string | null;
  dutyEstimated?: number | null;
  estimateSource?: string | null;
  estimateVersion?: string | null;
  estimatedAt?: string | null;
  dutyActual?: number | null;
  declarationRef?: string | null;
  capturedBy?: string | null;
  capturedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DutySummary {
  tripId: string;
  reference: string;
  hsCode?: string | null;
  originStatus?: string | null;
  certificateOfOriginRef?: string | null;
  estimated: {
    value: number;
    source?: string | null;
    version?: string | null;
    at?: string | null;
  } | null;
  actual: {
    value: number;
    declarationRef?: string | null;
    capturedBy?: string | null;
    at?: string | null;
  } | null;
  variance?: number | null;
  varianceLabel?: string | null;
  estimatedLabel: string;
  actualLabel: string;
  hasBoth: boolean;
  hasEstimateOnly: boolean;
  hasActualOnly: boolean;
}

export interface TripLeg {
  id: string;
  companyId: string;
  tripId: string;
  kind: "LINEHAUL" | "BORDER" | "CLEARING" | "BOND" | "EMPTY_RETURN";
  postId?: string | null;
  dwellSessionId?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationMinutes?: number | null;
  provenance: "MEASURED" | "DECLARED" | "REFERENCE";
  source?: string | null;
  confidenceNote?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  post?: { id: string; code: string; name: string } | null;
  dwellSession?: {
    id: string;
    state: string;
    enteredAt?: string | null;
    exitedAt?: string | null;
    precisionSeconds?: number | null;
    gapLargestSeconds?: number | null;
  } | null;
}

export interface TripWithLegs extends Trip {
  legs: TripLeg[];
  summary: {
    totalLegs: number;
    measuredLegs: number;
    declaredLegs: number;
    referenceLegs: number;
    totalDurationMinutes?: number | null;
    provenance: "MEASURED" | "PARTIAL" | "REFERENCE_ONLY" | "UNKNOWN";
    isFullyMeasured: boolean;
  };
  dutySummary: DutySummary;
}

export interface TripSummary {
  totalLegs: number;
  measuredLegs: number;
  declaredLegs: number;
  referenceLegs: number;
  totalDurationMinutes?: number | null;
  provenance: string;
  isFullyMeasured: boolean;
}

// ════════════════════════════════════════════════════════════════════════════════
// TRIP CRUD
// ════════════════════════════════════════════════════════════════════════════════

export const wp3CreateTrip = async (dto: {
  reference: string;
  driverId?: string;
  vehicleReg?: string;
  origin?: string;
  destination?: string;
  plannedStart?: string;
  plannedEnd?: string;
}): Promise<Trip> => {
  const r = await api.post<Trip>("/trip-legs/trips", dto);
  return unwrap(r);
};

export const wp3ListTrips = async (opts?: {
  status?: string;
  limit?: number;
}): Promise<Trip[]> => {
  const qs = new URLSearchParams();
  if (opts?.status) qs.set("status", opts.status);
  if (opts?.limit !== undefined) qs.set("limit", String(opts.limit));
  const r = await api.get<Trip[]>(`/trip-legs/trips?${qs}`);
  return unwrap(r);
};

export const wp3GetTrip = async (tripId: string): Promise<TripWithLegs> => {
  const r = await api.get<TripWithLegs>(`/trip-legs/trips/${tripId}`);
  return unwrap(r);
};

export const wp3DeriveBorderLegs = async (tripId: string): Promise<TripLeg[]> => {
  const r = await api.post<TripLeg[]>(`/trip-legs/trips/${tripId}/derive-border-legs`);
  return unwrap(r);
};

export const wp3CreateDeclaredLeg = async (tripId: string, dto: {
  postId?: string;
  startedAt?: string;
  endedAt?: string;
  durationMinutes?: number;
  confidenceNote?: string;
  notes?: string;
}): Promise<TripLeg> => {
  const r = await api.post<TripLeg>(`/trip-legs/trips/${tripId}/legs/declared`, dto);
  return unwrap(r);
};

export const wp3CreateReferenceLeg = async (tripId: string, dto: {
  kind: "LINEHAUL" | "BORDER" | "CLEARING" | "BOND" | "EMPTY_RETURN";
  postId?: string;
  durationMinutes?: number;
  source?: string;
  notes?: string;
}): Promise<TripLeg> => {
  const r = await api.post<TripLeg>(`/trip-legs/trips/${tripId}/legs/reference`, dto);
  return unwrap(r);
};

export const wp3UpdateTripStatus = async (
  tripId: string,
  status: string,
): Promise<Trip> => {
  const r = await api.patch<Trip>(`/trip-legs/trips/${tripId}/status`, { status });
  return unwrap(r);
};

// ════════════════════════════════════════════════════════════════════════════════
// WP3 Stage 5: HS code, origin status, duty ESTIMATED vs ACTUAL
// ════════════════════════════════════════════════════════════════════════════════

export const wp3SetHsOrigin = async (tripId: string, dto: {
  hsCode?: string;
  originStatus?: "PREFERENTIAL" | "NON_PREFERENTIAL" | "UNKNOWN";
  certificateOfOriginRef?: string;
}): Promise<Trip> => {
  const r = await api.post<Trip>(`/trip-legs/trips/${tripId}/hs-origin`, dto);
  return unwrap(r);
};

export const wp3SetDutyEstimate = async (tripId: string, dto: {
  duty: number;
  estimateSource: string;
  estimateVersion: string;
}): Promise<Trip> => {
  const r = await api.post<Trip>(`/trip-legs/trips/${tripId}/duty/estimate`, dto);
  return unwrap(r);
};

export const wp3SetDutyActual = async (tripId: string, dto: {
  duty: number;
  declarationRef: string;
}): Promise<Trip> => {
  const r = await api.post<Trip>(`/trip-legs/trips/${tripId}/duty/actual`, dto);
  return unwrap(r);
};
