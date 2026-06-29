import { api } from "./client";

const unwrap = (r: any) => r?.data ?? r;

export type DisbursementStatus = "OUTSTANDING" | "INVOICED" | "RECOVERED" | "WRITTEN_OFF";

export interface Disbursement {
  id: string;
  fileId?: string | null;
  clientName?: string | null;
  authority: string;
  category?: string | null;
  reference?: string | null;
  description?: string | null;
  amount: number;
  currency: string;
  status: DisbursementStatus;
  paidAt: string;
  recoveredAt?: string | null;
  invoiceId?: string | null;
}

export interface DisbursementMetrics {
  outstanding: number;
  outstandingCount: number;
  recovered: number;
  writtenOff: number;
  total: number;
  aging: { d0_30: number; d31_60: number; d61_90: number; d90plus: number };
}

export const listDisbursements = async (q?: { status?: string; q?: string }): Promise<Disbursement[]> => {
  const r = unwrap(await api.get("/disbursements", { params: q }));
  return Array.isArray(r) ? r : [];
};
export const disbursementMetrics = async (): Promise<DisbursementMetrics> => unwrap(await api.get("/disbursements/metrics"));
export const createDisbursement = async (dto: Partial<Disbursement>): Promise<Disbursement> => unwrap(await api.post("/disbursements", dto));
export const updateDisbursement = async (id: string, dto: Partial<Disbursement>): Promise<Disbursement> => unwrap(await api.patch(`/disbursements/${id}`, dto));
export const recoverDisbursement = async (id: string, invoiceId?: string): Promise<Disbursement> => unwrap(await api.post(`/disbursements/${id}/recover`, { invoiceId }));
export const setDisbursementStatus = async (id: string, status: string): Promise<Disbursement> => unwrap(await api.patch(`/disbursements/${id}/status`, { status }));
export const deleteDisbursement = async (id: string): Promise<{ deleted: boolean }> => unwrap(await api.delete(`/disbursements/${id}`));
