import { api } from "./client";

/**
 * WP3: Cross-border journey visibility API client.
 *
 * Every route is tenant-scoped — companyId comes from the session, never
 * from the body or query. Reference data (border posts, geofences) carries
 * `provenance` so MEASURED and REFERENCE figures are never confused.
 *
 * Endpoints:
 *   GET    /border-dwell/posts                 — border posts + geofences
 *   GET    /border-dwell/posts/:postId         — post detail + recent sessions
 *   GET    /border-dwell/posts/:postId/aggregates — median/P90/n + completeness
 *   GET    /border-dwell/sessions              — dwell sessions (postId/state/limit)
 *   POST   /border-dwell/check                 — evaluate position vs geofences
 *
 *   POST   /trip-legs/trips                    — create trip
 *   GET    /trip-legs/trips                    — list trips
 *   GET    /trip-legs/trips/:tripId            — trip + legs + provenance summary
 *   POST   /trip-legs/trips/:tripId/derive-border-legs — derive BORDER legs from dwell
 *   POST   /trip-legs/trips/:tripId/legs/declared       — create DECLARED BORDER leg
 *   POST   /trip-legs/trips/:tripId/legs/reference      — create REFERENCE leg
 *   PATCH  /trip-legs/trips/:tripId/status           — update trip status
 *
 *   GET    /trip-documents                     — list documents
 *   GET    /trip-documents/:docId              — get document
 *   POST   /trip-documents                     — create document
 *   PATCH  /trip-documents/:docId              — update document
 *   GET    /trip-documents/thresholds          — expiry thresholds
 *   POST   /trip-documents/thresholds          — set threshold
 *   POST   /trip-documents/sweep               — sweep expiry alerts
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════════

export interface BorderPost {
  id: string;
  code: string;
  name: string;
  countries: string;
  lat: number;
  lng: number;
  is24Hour: boolean;
  referenceAvgWaitHours?: number | null;
  referenceCongestion?: string | null;
  referenceCompiledAsOf?: string | null;
  geofences?: Array<{
    id: string;
    code: string;
    name: string;
    side: string;
    radiusM: number;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface BorderGeofence {
  id: string;
  code: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  side: string;
  isActive: boolean;
  provenance: string;
}

export interface BorderDwellSession {
  id: string;
  companyId: string;
  postId: string;
  geofenceId: string;
  driverId?: string | null;
  vehicleReg?: string | null;
  enteredAt?: string | null;
  enteredFromFixAt?: string | null;
  exitedAt?: string | null;
  exitedFromFixAt?: string | null;
  state: "CLOSED" | "OPEN" | "GAPPED";
  sampleCount: number;
  precisionSeconds?: number | null;
  gapLargestSeconds?: number | null;
  direction?: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
  post?: { id: string; code: string; name: string };
  geofence?: { id: string; code: string; side: string };
}

export interface DwellAggregates {
  postId: string;
  companyId: string;
  suppressed: boolean;
  suppressionThreshold: number;
  n: number;
  closedCount: number;
  openCount: number;
  gappedCount: number;
  medianMs?: number | null;
  p90Ms?: number | null;
  medianMinutes?: number | null;
  p90Minutes?: number | null;
  completeness: { closed: number; open: number; gapped: number; total: number };
}

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
  estimated: { value: number; source?: string | null; version?: string | null; at?: string | null } | null;
  actual: { value: number; declarationRef?: string | null; capturedBy?: string | null; at?: string | null } | null;
  variance?: number | null;
  varianceLabel?: string | null;
  estimatedLabel: string;
  actualLabel: string;
  hasBoth: boolean;
  hasEstimateOnly: boolean;
  hasActualOnly: boolean;
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
}

export interface TripDocument {
  id: string;
  companyId: string;
  tripId: string;
  documentType: string;
  status: "HELD" | "MISSING" | "EXPIRED" | "NOT_APPLICABLE";
  issuedAt?: string | null;
  expiresAt?: string | null;
  capturedBy?: string | null;
  evidenceRef?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentThreshold {
  id: string;
  companyId: string;
  documentType?: string | null;
  thresholdDays: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// BORDER DWELL
// ══════════════════════════════════════════════════════════════════════════════

export const wp3ListBorderPosts = async (): Promise<BorderPost[]> => {
  const r = await api.get<BorderPost[]>("/border-dwell/posts");
  return Array.isArray(r) ? r : [];
};

export const wp3GetBorderPost = async (postId: string): Promise<BorderPost> => {
  return api.get<BorderPost>(`/border-dwell/posts/${postId}`);
};

export const wp3GetDwellAggregates = async (
  postId: string,
  opts?: { from?: string; to?: string; threshold?: number },
): Promise<DwellAggregates> => {
  const qs = new URLSearchParams();
  if (opts?.from) qs.set("from", opts.from);
  if (opts?.to) qs.set("to", opts.to);
  if (opts?.threshold !== undefined) qs.set("threshold", String(opts.threshold));
  return api.get<DwellAggregates>(`/border-dwell/posts/${postId}/aggregates?${qs}`);
};

export const wp3ListDwellSessions = async (
  opts?: { postId?: string; state?: string; limit?: number },
): Promise<BorderDwellSession[]> => {
  const qs = new URLSearchParams();
  if (opts?.postId) qs.set("postId", opts.postId);
  if (opts?.state) qs.set("state", opts.state);
  if (opts?.limit !== undefined) qs.set("limit", String(opts.limit));
  const r = await api.get<BorderDwellSession[]>(`/border-dwell/sessions?${qs}`);
  return Array.isArray(r) ? r : [];
};

export const wp3CheckBorderGeofences = async (dto: {
  driverId: string;
  lat: number;
  lng: number;
  speed?: number;
}) => {
  return api.post("/border-dwell/check", dto);
};

// ══════════════════════════════════════════════════════════════════════════════
// TRIP LEGS
// ══════════════════════════════════════════════════════════════════════════════

export const wp3CreateTrip = async (dto: {
  reference: string;
  driverId?: string;
  vehicleReg?: string;
  origin?: string;
  destination?: string;
  plannedStart?: string;
  plannedEnd?: string;
}): Promise<Trip> => {
  return api.post<Trip>("/trip-legs/trips", dto);
};

export const wp3ListTrips = async (opts?: {
  status?: string;
  limit?: number;
}): Promise<Trip[]> => {
  const qs = new URLSearchParams();
  if (opts?.status) qs.set("status", opts.status);
  if (opts?.limit !== undefined) qs.set("limit", String(opts.limit));
  const r = await api.get<Trip[]>(`/trip-legs/trips?${qs}`);
  return Array.isArray(r) ? r : [];
};

export const wp3GetTrip = async (tripId: string): Promise<TripWithLegs> => {
  return api.get<TripWithLegs>(`/trip-legs/trips/${tripId}`);
};

export const wp3DeriveBorderLegs = async (tripId: string): Promise<TripLeg[]> => {
  const r = await api.post<TripLeg[]>(`/trip-legs/trips/${tripId}/derive-border-legs`);
  return Array.isArray(r) ? r : [];
};

export const wp3CreateDeclaredLeg = async (tripId: string, dto: {
  postId?: string;
  startedAt?: string;
  endedAt?: string;
  durationMinutes?: number;
  confidenceNote?: string;
  notes?: string;
}): Promise<TripLeg> => {
  return api.post<TripLeg>(`/trip-legs/trips/${tripId}/legs/declared`, dto);
};

export const wp3CreateReferenceLeg = async (tripId: string, dto: {
  kind: "LINEHAUL" | "BORDER" | "CLEARING" | "BOND" | "EMPTY_RETURN";
  postId?: string;
  durationMinutes?: number;
  source?: string;
  notes?: string;
}): Promise<TripLeg> => {
  return api.post<TripLeg>(`/trip-legs/trips/${tripId}/legs/reference`, dto);
};

export const wp3UpdateTripStatus = async (
  tripId: string,
  status: string,
): Promise<Trip> => {
  return api.patch<Trip>(`/trip-legs/trips/${tripId}/status`, { status });
};

// ── WP3 Stage 5: HS code, origin status, duty ESTIMATED vs ACTUAL ─────

export const wp3SetHsOrigin = async (tripId: string, dto: {
  hsCode?: string;
  originStatus?: "PREFERENTIAL" | "NON_PREFERENTIAL" | "UNKNOWN";
  certificateOfOriginRef?: string;
}): Promise<Trip> => {
  return api.post<Trip>(`/trip-legs/trips/${tripId}/hs-origin`, dto);
};

export const wp3SetDutyEstimate = async (tripId: string, dto: {
  duty: number;
  estimateSource: string;
  estimateVersion: string;
}): Promise<Trip> => {
  return api.post<Trip>(`/trip-legs/trips/${tripId}/duty/estimate`, dto);
};

export const wp3SetDutyActual = async (tripId: string, dto: {
  duty: number;
  declarationRef: string;
}): Promise<Trip> => {
  return api.post<Trip>(`/trip-legs/trips/${tripId}/duty/actual`, dto);
};

// ══════════════════════════════════════════════════════════════════════════════
// TRIP DOCUMENTS
// ══════════════════════════════════════════════════════════════════════════════

export const wp3ListDocuments = async (opts?: {
  tripId?: string;
  status?: string;
}): Promise<TripDocument[]> => {
  const qs = new URLSearchParams();
  if (opts?.tripId) qs.set("tripId", opts.tripId);
  if (opts?.status) qs.set("status", opts.status);
  const r = await api.get<TripDocument[]>(`/trip-documents?${qs}`);
  return Array.isArray(r) ? r : [];
};

export const wp3GetDocument = async (docId: string): Promise<TripDocument> => {
  return api.get<TripDocument>(`/trip-documents/${docId}`);
};

export const wp3CreateDocument = async (dto: {
  tripId: string;
  documentType: string;
  status?: "HELD" | "MISSING" | "EXPIRED" | "NOT_APPLICABLE";
  issuedAt?: string;
  expiresAt?: string;
  evidenceRef?: string;
}): Promise<TripDocument> => {
  return api.post<TripDocument>("/trip-documents", dto);
};

export const wp3UpdateDocument = async (docId: string, dto: {
  status?: "HELD" | "MISSING" | "EXPIRED" | "NOT_APPLICABLE";
  issuedAt?: string;
  expiresAt?: string;
  evidenceRef?: string;
}): Promise<TripDocument> => {
  return api.patch<TripDocument>(`/trip-documents/${docId}`, dto);
};

export const wp3GetThresholds = async (): Promise<DocumentThreshold[]> => {
  const r = await api.get<DocumentThreshold[]>("/trip-documents/thresholds");
  return Array.isArray(r) ? r : [];
};

export const wp3SetThreshold = async (dto: {
  documentType?: string;
  thresholdDays: number;
}): Promise<DocumentThreshold> => {
  return api.post<DocumentThreshold>("/trip-documents/thresholds", dto);
};

export const wp3SweepExpiryAlerts = async (): Promise<{
  docsChecked: number;
  expiredMarked: number;
}> => {
  return api.post<{ docsChecked: number; expiredMarked: number }>("/trip-documents/sweep", {});
};
