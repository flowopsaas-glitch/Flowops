/**
 * collectionsStateSync.ts — Collections state synchronisation API helpers.
 *
 * Previously used raw fetch() with manually constructed Authorization headers.
 * Now delegates to the canonical `api` client (api/client.ts) which injects
 * the bearer token via its request interceptor and throws on 4xx/5xx.
 */
import { api } from '../api/client';

export type CollectionsSyncRecord = {
  collectionId: string;
  reference?: string;
  customerName?: string;
  destination?: string;
  status?: string;
  shipmentStatus?: string;
  dispatchStatus?: string;
  podStatus?: string;
  invoiceStatus?: string;
  shipmentLinked?: boolean;
  dispatchLinked?: boolean;
  podLinked?: boolean;
  invoiceLinked?: boolean;
  driverAssigned?: boolean;
  driverName?: string | null;
  syncHealth?: string;
  aiFlags?: string[];
  aiPriority?: string;
  lastUpdatedAt?: string;
};

export type CollectionsSyncDashboard = {
  totals?: Record<string, number>;
  moduleHealth?: Record<string, number>;
  records?: CollectionsSyncRecord[];
};

export type DriverSuggestion = {
  suggestion?: { name: string; vehicleType: string; score: number } | null;
};

/** The api client already unwraps the response envelope; tolerate both shapes. */
const unwrapBody = <T>(res: unknown): T =>
  ((res as { data?: T } | null)?.data ?? res) as T;

export async function fetchCollectionsSyncDashboard(): Promise<CollectionsSyncDashboard> {
  return unwrapBody<CollectionsSyncDashboard>(
    await api.get('/collections-state-sync/dashboard'),
  );
}

export async function fetchCollectionsSyncRecords(): Promise<CollectionsSyncRecord[]> {
  return unwrapBody<CollectionsSyncRecord[]>(
    await api.get('/collections-state-sync/records'),
  );
}

export async function runCollectionsBulkSync(actor = 'frontend-user'): Promise<unknown> {
  return api.post<unknown, unknown>('/collections-state-sync/bulk-sync', { actor });
}

export async function syncSingleCollection(
  collectionId: string,
  actor = 'frontend-user',
): Promise<unknown> {
  return api.post<unknown, unknown>(`/collections-state-sync/sync/${collectionId}`, { actor });
}

export async function fetchSuggestedDriver(collectionId: string): Promise<DriverSuggestion> {
  return unwrapBody<DriverSuggestion>(
    await api.get(`/collections-state-sync/suggest-driver/${collectionId}`),
  );
}
