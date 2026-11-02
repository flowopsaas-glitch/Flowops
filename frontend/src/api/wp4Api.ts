import { api } from "./client";

/**
 * WP4 — Safety Incident Layer API client.
 *
 * A report is a claim (SafetyIncident); a zone is an assertion (SafetyZone)
 * created only on verification. Every route is tenant-scoped.
 *
 * Endpoints:
 *   POST   /safety-incidents                              — one-tap report
 *   GET    /safety-incidents                              — dispatch queue
 *   GET    /safety-incidents/:incidentId                  — get incident
 *   POST   /safety-incidents/:incidentId/verify           — verify → zone + broadcast
 *   POST   /safety-incidents/:incidentId/reject           — reject with reason
 *   POST   /safety-incidents/:incidentId/withdraw         — reporting driver withdraws
 *   POST   /safety-incidents/:incidentId/corroborate      — second source match
 *   POST   /safety-incidents/sweep-expired                — expiry sweep
 *   POST   /safety-incidents/sweep-retention              — retention sweep
 */

export interface SafetyIncident {
  id: string;
  companyId: string;
  type: string;
  severity: string;
  status: 'REPORTED' | 'CORROBORATED' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' | 'WITHDRAWN';
  reportedByDriverId?: string | null;
  reportedByUserId?: string | null;
  reportedAt: string;
  reportLat: number | null;
  reportLng: number | null;
  reportAccuracyM?: number | null;
  locationSource: string;
  geohash6?: string | null;
  narrative?: string | null;
  verifiedByUserId?: string | null;
  verifiedAt?: string | null;
  verificationMethod?: string | null;
  rejectedByUserId?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  withdrawnAt?: string | null;
  withdrawnByUserId?: string | null;
  zoneId?: string | null;
  broadcastCount: number;
  lastBroadcastAt?: string | null;
  expiresAt?: string | null;
  expiredAt?: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  reportedByDriver?: { id: string; name: string } | null;
  reportedByUser?: { id: string; name: string; email: string } | null;
  verifiedByUser?: { id: string; name: string } | null;
  rejectedByUser?: { id: string; name: string } | null;
  corroborations?: Array<{
    id: string;
    driverId: string;
    driver: { id: string; name: string };
    distanceM: number;
    reportedAt: string;
  }>;
  zone?: { id: string; name: string; radiusM: number; isActive: boolean; expiresAt?: string | null } | null;
}

export interface SafetyZone {
  id: string;
  companyId: string;
  name: string;
  description?: string | null;
  lat: number;
  lng: number;
  radiusM: number;
  riskLevel: string;
  source: string;
  isActive: boolean;
  expiresAt?: string | null;
  incidentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// SAFETY INCIDENTS
// ══════════════════════════════════════════════════════════════════════════════

export const wp4ReportIncident = async (dto: {
  type: string;
  reportLat: number;
  reportLng: number;
  reportAccuracyM?: number;
  locationSource?: 'DEVICE_GPS' | 'MAP_PIN' | 'LAST_KNOWN';
  narrative?: string;
  idempotencyKey: string;
}) => {
  return api.post('/safety-incidents', dto);
};

export const wp4ListIncidents = async (opts?: { status?: string; limit?: number }): Promise<SafetyIncident[]> => {
  const qs = new URLSearchParams();
  if (opts?.status) qs.set('status', opts.status);
  if (opts?.limit !== undefined) qs.set('limit', String(opts.limit));
  const r = await api.get<SafetyIncident[]>(`/safety-incidents?${qs}`);
  return Array.isArray(r) ? r : [];
};

export const wp4GetIncident = async (incidentId: string): Promise<SafetyIncident> => {
  return (await api.get<SafetyIncident>(`/safety-incidents/${incidentId}`)).data;};

export const wp4VerifyIncident = async (incidentId: string, dto: {
  verificationMethod: 'DISPATCH_CONFIRM' | 'SECOND_SOURCE' | 'AUTHORITY_NOTIFIED';
  severity?: string;
  radiusM?: number;
  ttlHours?: number;
}) => {
  return api.post(`/safety-incidents/${incidentId}/verify`, dto);
};

export const wp4RejectIncident = async (incidentId: string, dto: {
  rejectionReason: 'NOT_THERE' | 'ALREADY_CLEARED' | 'DUPLICATE' | 'MISCLASSIFIED' | 'NOT_CREDIBLE' | 'OTHER';
  rejectionNote?: string;
}) => {
  return api.post(`/safety-incidents/${incidentId}/reject`, dto);
};

export const wp4WithdrawIncident = async (incidentId: string) => {
  return api.post(`/safety-incidents/${incidentId}/withdraw`);
};

export const wp4CorroborateIncident = async (incidentId: string, dto: {
  driverId: string;
  reportLat: number;
  reportLng: number;
}) => {
  return api.post(`/safety-incidents/${incidentId}/corroborate`, dto);
};

export const wp4SweepExpired = async () => {
  return api.post('/safety-incidents/sweep-expired');
};

export const wp4SweepRetention = async () => {
  return api.post('/safety-incidents/sweep-retention');
};

// ══════════════════════════════════════════════════════════════════════════════
// SAFETY ZONES (existing, extended with WP4 fields)
// ══════════════════════════════════════════════════════════════════════════════

export const wp4ListZones = async (): Promise<SafetyZone[]> => {
  const r = await api.get<SafetyZone[]>('/safety/zones');
  return Array.isArray(r) ? r : [];
};
