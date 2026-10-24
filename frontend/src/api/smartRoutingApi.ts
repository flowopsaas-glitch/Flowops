import { api } from './client';

const unwrap = <T>(r: unknown): T => ((r as { data?: T } | null)?.data ?? r) as T;
const arr = <T>(r: unknown): T[] => (Array.isArray(r) ? r : ((r as { data?: T[] } | null)?.data ?? [])) as T[];

// ── Types ────────────────────────────────────────────────────────────────

export type RoutePlanStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export type RoutePlan = {
  id: string;
  companyId: string;
  name: string | null;
  status: RoutePlanStatus;
  vehicleId: string | null;
  driverId: string | null;
  routeCoordinates: Array<{ lat: number; lng: number }> | null;
  stops: Array<{
    waybillId: string;
    lat?: number;
    lng?: number;
    address?: string;
    scheduledTime?: string;
    serviceTime?: number;
  }> | null;
  totalStops: number;
  estimatedTime: number | null;
  estimatedDistance: number | null;
  actualTime: number | null;
  actualDistance: number | null;
  scheduledDate: string | null;
  startTime: string | null;
  endTime: string | null;
  vehicleCapacity: number | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateRoutePlanPayload = {
  name?: string;
  vehicleId?: string;
  driverId?: string;
  stops: Array<{
    waybillId: string;
    lat?: number;
    lng?: number;
    address?: string;
    scheduledTime?: string;
    serviceTime?: number;
  }>;
  scheduledDate?: string;
  vehicleCapacity?: number;
};

export type UpdateRoutePlanPayload = {
  name?: string;
  vehicleId?: string;
  driverId?: string;
  status?: string;
  stops?: Array<{ waybillId: string; lat?: number; lng?: number; address?: string }>;
};

// ── API Functions ────────────────────────────────────────────────────────

export const createRoutePlan = async (payload: CreateRoutePlanPayload) =>
  unwrap<RoutePlan>(await api.post('/smart-routing/plans', payload));

export const listRoutePlans = async (params?: Record<string, string>) =>
  arr<RoutePlan>(await api.get('/smart-routing/plans', { params }));

export const getRoutePlan = async (id: string) =>
  unwrap<RoutePlan>(await api.get(`/smart-routing/plans/${id}`));

export const updateRoutePlan = async (id: string, payload: UpdateRoutePlanPayload) =>
  unwrap<RoutePlan>(await api.patch(`/smart-routing/plans/${id}`, payload));

export const activateRoutePlan = async (id: string) =>
  unwrap<RoutePlan>(await api.post(`/smart-routing/plans/${id}/activate`, {}));

export const completeRoutePlan = async (id: string) =>
  unwrap<RoutePlan>(await api.post(`/smart-routing/plans/${id}/complete`, {}));

export const cancelRoutePlan = async (id: string) =>
  unwrap<RoutePlan>(await api.post(`/smart-routing/plans/${id}/cancel`, {}));

export const getRouteSchedule = async (date: string) =>
  arr<RoutePlan>(await api.get('/smart-routing/schedule', { params: { date } }));
