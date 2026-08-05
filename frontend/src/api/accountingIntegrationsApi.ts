import { api, getApiBaseUrl, getToken } from "./client";

export type ProviderKey = "XERO" | "SAGE" | "PASTEL";

export type IntegrationStatus = {
  provider: ProviderKey;
  name: string;
  usesOAuth: boolean;
  configured: boolean;
  status: "CONNECTED" | "DISCONNECTED" | "ERROR" | "EXPIRED";
  tenantName: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  connectionId: string | null;
};

export type ReconcileIssue = {
  severity: "HIGH" | "MEDIUM" | "LOW";
  type: string;
  doc: string;
  client: string;
  detail: string;
};

export type Reconciliation = {
  connected: { provider: string; tenant: string | null }[];
  healthScore: number;
  totals: { documents: number; synced: number; unsynced: number; high: number; medium: number };
  issues: ReconcileIssue[];
  suggestedMapping: Record<string, { sales: string; accountsReceivable: string; vat: string }>;
  summary: string;
  generatedAt: string;
};

const unwrap = <T>(r: any): T => (r?.data ?? r) as T;
const arr = <T>(r: any): T[] => (Array.isArray(r) ? r : r?.data ?? []);

export const listIntegrations = async () => arr<IntegrationStatus>(await api.get("/accounting/integrations"));
export const reconcileBooks = async () => unwrap<Reconciliation>(await api.get("/accounting/integrations/reconcile"));
export const authorizeProvider = async (provider: ProviderKey) =>
  unwrap<{ url: string }>(await api.get(`/accounting/integrations/${provider.toLowerCase()}/authorize`));
export const connectPastel = async () => unwrap(await api.post("/accounting/integrations/pastel/connect", {}));
export const disconnectIntegration = async (id: string) =>
  unwrap(await api.post(`/accounting/integrations/${id}/disconnect`, {}));
export const syncInvoice = async (invoiceId: string) =>
  unwrap(await api.post(`/accounting/integrations/sync/invoice/${invoiceId}`, {}));
export const listSyncLogs = async () => arr<any>(await api.get("/accounting/integrations/logs"));

export async function downloadPastelImport() {
  const token = getToken();
  const res = await fetch(`${getApiBaseUrl()}/accounting/integrations/pastel/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Pastel export failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "pastel-import.csv";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
