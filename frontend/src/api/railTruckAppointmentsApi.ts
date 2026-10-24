import { api } from "./client";

export type TruckAppointmentStatus =
  | "BOOKED" | "ARRIVED" | "LOADING" | "COMPLETED" | "NO_SHOW" | "CANCELLED";

export interface TruckAppointment {
  id: string;
  terminalName: string;
  haulierName: string;
  vehicleReg: string;
  driverName?: string | null;
  purpose: string;
  windowStart: string;
  windowEnd: string;
  arrivedAt?: string | null;
  loadingAt?: string | null;
  completedAt?: string | null;
  status: TruckAppointmentStatus;
  consignmentId?: string | null;
  note?: string | null;
  waitMinutes?: number | null;
  lateMinutes?: number | null;
  conflicts?: { id: string; haulierName: string; vehicleReg: string }[];
}

export interface TruckAppointmentSummary {
  total: number;
  byStatus: Record<string, number>;
  measuredWaits: number;
  avgWaitMinutes: number | null;
}

const unwrap = (r: any) => r?.data ?? r;

export async function listTruckAppointments(params?: Record<string, string>): Promise<TruckAppointment[]> {
  const r: any = await api.get("/rail/truck-appointments", { params });
  const body = unwrap(r);
  return Array.isArray(body) ? body : [];
}

export async function getTruckAppointmentSummary(): Promise<TruckAppointmentSummary> {
  const r: any = await api.get("/rail/truck-appointments/summary");
  return unwrap(r);
}

export async function bookTruckAppointment(dto: Record<string, unknown>): Promise<TruckAppointment> {
  const r: any = await api.post("/rail/truck-appointments", dto);
  return unwrap(r);
}

export async function transitionTruckAppointment(
  id: string,
  action: "arrive" | "start-loading" | "complete" | "no-show" | "cancel" | "reschedule",
  dto?: Record<string, unknown>,
): Promise<TruckAppointment> {
  const r: any = await api.post(`/rail/truck-appointments/${id}/${action}`, dto ?? {});
  return unwrap(r);
}
