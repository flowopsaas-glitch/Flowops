import { api } from './client';

const unwrap = <T>(r: any): T => (r?.data ?? r) as T;
const arr = <T>(r: any): T[] => (Array.isArray(r) ? r : r?.data ?? []);

// ── Types ────────────────────────────────────────────────────────────────

export type EpodStatus = 'PENDING' | 'CAPTURED' | 'VERIFIED' | 'DISPUTED';

export type ElectronicPod = {
  id: string;
  companyId: string;
  waybillId: string;
  driverId: string | null;
  status: EpodStatus;
  signatureUrl: string | null;
  photoUrls: string[];
  recipientName: string | null;
  recipientId: string | null;
  notes: string | null;
  geoLat: number | null;
  geoLng: number | null;
  capturedAt: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  disputeReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EpodStats = {
  total: number;
  captured: number;
  verified: number;
  disputed: number;
  verificationRate: number;
};

export type CaptureEpodPayload = {
  waybillId: string;
  driverId?: string;
  signatureUrl?: string;
  photoUrls?: string[];
  recipientName?: string;
  recipientId?: string;
  notes?: string;
  geoLat?: number;
  geoLng?: number;
};

// ── API Functions ────────────────────────────────────────────────────────

export const captureEpod = async (payload: CaptureEpodPayload) =>
  unwrap<ElectronicPod>(await api.post('/epod/capture', payload));

export const listEpods = async (params?: Record<string, string>) =>
  arr<ElectronicPod>(await api.get('/epod', { params }));

export const getEpod = async (id: string) =>
  unwrap<ElectronicPod>(await api.get(`/epod/${id}`));

export const getEpodByWaybill = async (waybillId: string) =>
  unwrap<ElectronicPod | null>(await api.get(`/epod/waybill/${waybillId}`));

export const verifyEpod = async (id: string, verifiedBy?: string) =>
  unwrap<ElectronicPod>(await api.post(`/epod/${id}/verify`, { verifiedBy }));

export const disputeEpod = async (id: string, reason: string) =>
  unwrap<ElectronicPod>(await api.post(`/epod/${id}/dispute`, { reason }));

export const getEpodStats = async () =>
  unwrap<EpodStats>(await api.get('/epod/stats'));
