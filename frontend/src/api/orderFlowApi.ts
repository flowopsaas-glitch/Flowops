import { api } from './client';

const unwrap = <T>(r: any): T => (r?.data ?? r) as T;
const arr = <T>(r: any): T[] => (Array.isArray(r) ? r : r?.data ?? []);

// ── Types ────────────────────────────────────────────────────────────────

export type IntegrationType = 'SHOPIFY' | 'WOOCOMMERCE' | 'MAGENTO' | 'CUSTOM_API' | 'CSV_IMPORT' | 'WEBHOOK';
export type IntegrationStatus = 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'CONFIGURING';

export type OrderFlowIntegration = {
  id: string;
  name: string;
  type: IntegrationType;
  status: IntegrationStatus;
  autoDispatch: boolean;
  lastSyncAt: string | null;
  totalOrders: number;
  failedOrders: number;
  createdAt: string;
  updatedAt: string;
  config?: Record<string, any>;
  dispatchRules?: Record<string, any>;
  syncLogs?: OrderSyncLog[];
};

export type OrderSyncLog = {
  id: string;
  integrationId: string;
  externalOrderId: string | null;
  waybillId: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
};

export type CreateIntegrationPayload = {
  name: string;
  type: IntegrationType;
  config?: Record<string, any>;
  credentials?: Record<string, any>;
  autoDispatch?: boolean;
  dispatchRules?: Record<string, any>;
};

export type UpdateIntegrationPayload = {
  name?: string;
  config?: Record<string, any>;
  autoDispatch?: boolean;
  dispatchRules?: Record<string, any>;
  status?: string;
};

export type IngestOrderPayload = {
  integrationId: string;
  externalOrderId: string;
  orderData: Record<string, any>;
};

// ── API Functions ────────────────────────────────────────────────────────

export const createIntegration = async (payload: CreateIntegrationPayload) =>
  unwrap<OrderFlowIntegration>(await api.post('/order-flow/integrations', payload));

export const listIntegrations = async () =>
  arr<OrderFlowIntegration>(await api.get('/order-flow/integrations'));

export const getIntegration = async (id: string) =>
  unwrap<OrderFlowIntegration>(await api.get(`/order-flow/integrations/${id}`));

export const updateIntegration = async (id: string, payload: UpdateIntegrationPayload) =>
  unwrap<OrderFlowIntegration>(await api.patch(`/order-flow/integrations/${id}`, payload));

export const activateIntegration = async (id: string) =>
  unwrap<OrderFlowIntegration>(await api.post(`/order-flow/integrations/${id}/activate`, {}));

export const deactivateIntegration = async (id: string) =>
  unwrap<OrderFlowIntegration>(await api.post(`/order-flow/integrations/${id}/deactivate`, {}));

export const deleteIntegration = async (id: string) =>
  unwrap<void>(await api.delete(`/order-flow/integrations/${id}`));

export const ingestOrder = async (payload: IngestOrderPayload) =>
  unwrap<{ success: boolean; waybillId: string; externalOrderId: string }>(await api.post('/order-flow/ingest', payload));

export const getIntegrationLogs = async (integrationId: string) =>
  arr<OrderSyncLog>(await api.get(`/order-flow/integrations/${integrationId}/logs`));
