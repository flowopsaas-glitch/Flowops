import { api } from './client';

const unwrap = <T>(r: unknown): T => ((r as { data?: T } | null)?.data ?? r) as T;
const arr = <T>(r: unknown): T[] => (Array.isArray(r) ? r : ((r as { data?: T[] } | null)?.data ?? [])) as T[];

// ── Types ────────────────────────────────────────────────────────────────

export type RouteOptimizationStatus = 'PENDING' | 'OPTIMIZING' | 'COMPLETED' | 'FAILED';

export type DeliveryAllocation = {
  id: string;
  waybillId: string;
  driverId: string | null;
  vehicleId: string | null;
  sequence: number;
  estimatedArrival: string | null;
  distance: number | null;
  status: string;
};

export type RouteOptimization = {
  id: string;
  companyId: string;
  name: string | null;
  status: RouteOptimizationStatus;
  deliveryIds: string[];
  vehicleIds: string[];
  depot: { lat: number; lng: number; address?: string } | null;
  optimizedRoutes: OptimizedRoute[] | null;
  totalDistance: number | null;
  totalDuration: number | null;
  savingsPercent: number | null;
  modelUsed: string | null;
  aiInsights: RouteAiInsights | null;
  allocations: DeliveryAllocation[];
  createdAt: string;
  updatedAt: string;
};

export type RouteInsights = {
  id: string;
  status: RouteOptimizationStatus;
  aiInsights: RouteAiInsights;
  savingsPercent: number | null;
  totalDistance: number | null;
  totalDuration: number | null;
  modelUsed: string | null;
};

export type OptimizedRoute = {
  driverId?: string | null;
  vehicleId?: string | null;
  stops?: unknown[];
  totalDistance?: number | null;
  totalTime?: number | null;
  [key: string]: unknown;
};

export type RouteAiInsights = string | { summary?: string; [key: string]: unknown };

export type CreateOptimizationPayload = {
  name?: string;
  deliveryIds: string[];
  vehicleIds: string[];
  depot?: { lat: number; lng: number; address?: string };
};

// ── API Functions ────────────────────────────────────────────────────────

export const createOptimization = async (payload: CreateOptimizationPayload) =>
  unwrap<RouteOptimization>(await api.post('/route-optimization', payload));

export const listOptimizations = async () =>
  arr<RouteOptimization>(await api.get('/route-optimization'));

export const getOptimization = async (id: string) =>
  unwrap<RouteOptimization>(await api.get(`/route-optimization/${id}`));

export const getOptimizationInsights = async (id: string) =>
  unwrap<RouteInsights>(await api.get(`/route-optimization/${id}/insights`));
