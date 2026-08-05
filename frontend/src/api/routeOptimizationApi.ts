import { api } from './client';

const unwrap = <T>(r: any): T => (r?.data ?? r) as T;
const arr = <T>(r: any): T[] => (Array.isArray(r) ? r : r?.data ?? []);

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
  optimizedRoutes: any[] | null;
  totalDistance: number | null;
  totalDuration: number | null;
  savingsPercent: number | null;
  modelUsed: string | null;
  aiInsights: any | null;
  allocations: DeliveryAllocation[];
  createdAt: string;
  updatedAt: string;
};

export type RouteInsights = {
  id: string;
  status: RouteOptimizationStatus;
  aiInsights: any;
  savingsPercent: number | null;
  totalDistance: number | null;
  totalDuration: number | null;
  modelUsed: string | null;
};

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
