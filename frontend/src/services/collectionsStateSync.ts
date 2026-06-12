/**
 * collectionsStateSync.ts — Collections state synchronisation API helpers.
 *
 * Previously used raw fetch() with manually constructed Authorization headers.
 * Now delegates to the canonical `api` client (api/client.ts) which injects
 * the bearer token via its request interceptor and throws on 4xx/5xx.
 */
import { api } from '../api/client';

export async function fetchCollectionsSyncDashboard() {
  return api.get<any, any>('/collections-state-sync/dashboard');
}

export async function fetchCollectionsSyncRecords() {
  return api.get<any, any>('/collections-state-sync/records');
}

export async function runCollectionsBulkSync(actor = 'frontend-user') {
  return api.post<any, any>('/collections-state-sync/bulk-sync', { actor });
}

export async function syncSingleCollection(collectionId: string, actor = 'frontend-user') {
  return api.post<any, any>(`/collections-state-sync/sync/${collectionId}`, { actor });
}

export async function fetchSuggestedDriver(collectionId: string) {
  return api.get<any, any>(`/collections-state-sync/suggest-driver/${collectionId}`);
}
