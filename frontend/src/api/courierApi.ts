import { api } from "./client";

export type CourierOrderStatus = "NEW" | "ASSIGNED" | "DISPATCHED" | "COMPLETED" | "CANCELLED";
export type CourierOrderPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export type CourierOrder = {
  id: string;
  reference: string;
  clientName: string;
  pickupAddress: string;
  dropoffAddress: string;
  contactName?: string | null;
  contactPhone?: string | null;
  itemsDesc?: string | null;
  pieces: number;
  weightKg?: number | null;
  priority: CourierOrderPriority;
  windowEnd?: string | null;
  status: CourierOrderStatus;
  assignedDriverId?: string | null;
  assignedDriverName?: string | null;
  sequence?: number | null;
  createdAt: string;
};

export type CourierStats = {
  new: number; assigned: number; dispatched: number; completed: number; cancelled: number;
};

export type PlanAssignment = { driverId: string; driverName?: string; orderIds: string[]; reasoning?: string };
export type OrchestrationPlan = {
  assignments: PlanAssignment[];
  unassigned: string[];
  summary: string;
  model: string;
};

const unwrap = (r: any) => r?.data ?? r;

export async function listCourierOrders(status?: string): Promise<CourierOrder[]> {
  const r: any = await api.get("/couriers/orders", { params: status ? { status } : {} });
  const d = unwrap(r);
  return Array.isArray(d) ? d : [];
}

export async function getCourierStats(): Promise<CourierStats> {
  const r: any = await api.get("/couriers/stats");
  return unwrap(r);
}

export async function createCourierOrder(payload: Partial<CourierOrder>): Promise<CourierOrder> {
  const r: any = await api.post("/couriers/orders", payload);
  return unwrap(r);
}

export async function updateCourierOrder(id: string, payload: Partial<CourierOrder>): Promise<CourierOrder> {
  const r: any = await api.patch(`/couriers/orders/${id}`, payload);
  return unwrap(r);
}

export async function orchestrateCouriers(): Promise<OrchestrationPlan> {
  const r: any = await api.post("/couriers/orchestrate", {});
  return unwrap(r);
}

export async function applyOrchestration(assignments: { driverId: string; orderIds: string[] }[]): Promise<{ applied: number }> {
  const r: any = await api.post("/couriers/orchestrate/apply", { assignments });
  return unwrap(r);
}
