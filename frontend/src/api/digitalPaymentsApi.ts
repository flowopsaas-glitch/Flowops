import { api } from './client';

const unwrap = <T>(r: unknown): T => ((r as { data?: T } | null)?.data ?? r) as T;
const arr = <T>(r: unknown): T[] => (Array.isArray(r) ? r : ((r as { data?: T[] } | null)?.data ?? [])) as T[];

// ── Types ────────────────────────────────────────────────────────────────

export type PaymentMethod = 'CARD' | 'EFT' | 'MOBILE_MONEY' | 'QR_CODE' | 'CASH';
export type PaymentGateway = 'PAYSTACK' | 'OZOW' | 'YOCO' | 'MANUAL';
export type PaymentStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';

export type DigitalPayment = {
  id: string;
  companyId: string;
  waybillId: string | null;
  driverId: string | null;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  reference: string | null;
  externalId: string | null;
  payerName: string | null;
  payerPhone: string | null;
  payerEmail: string | null;
  gateway: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentStats = {
  total: number;
  pending: number;
  successful: number;
  failed: number;
  refunded: number;
  totalRevenue: number;
  successRate: number;
};

export type CreatePaymentPayload = {
  amount: number;
  method: PaymentMethod;
  currency?: string;
  waybillId?: string;
  driverId?: string;
  payerName?: string;
  payerPhone?: string;
  payerEmail?: string;
  gateway?: PaymentGateway;
};

// ── API Functions ────────────────────────────────────────────────────────

export const createPayment = async (payload: CreatePaymentPayload) =>
  unwrap<DigitalPayment>(await api.post('/digital-payments', payload));

export const confirmPayment = async (reference: string, externalId?: string) =>
  unwrap<DigitalPayment>(await api.post('/digital-payments/confirm', { reference, externalId }));

export const listPayments = async (params?: Record<string, string>) =>
  arr<DigitalPayment>(await api.get('/digital-payments', { params }));

export const getPayment = async (id: string) =>
  unwrap<DigitalPayment>(await api.get(`/digital-payments/${id}`));

export const getPaymentsByWaybill = async (waybillId: string) =>
  arr<DigitalPayment>(await api.get(`/digital-payments/waybill/${waybillId}`));

export const failPayment = async (id: string) =>
  unwrap<DigitalPayment>(await api.post(`/digital-payments/${id}/fail`, {}));

export const refundPayment = async (id: string) =>
  unwrap<DigitalPayment>(await api.post(`/digital-payments/${id}/refund`, {}));

export const getPaymentStats = async () =>
  unwrap<PaymentStats>(await api.get('/digital-payments/stats'));
