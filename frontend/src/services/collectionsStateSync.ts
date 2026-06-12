import { FLOWOPS_API_URL } from "../lib/env";
import { getAccessToken } from "../lib/session";

const API_BASE = FLOWOPS_API_URL;

function getAuthHeaders() {
  const token = getAccessToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function fetchCollectionsSyncDashboard() {
  const response = await fetch(`${API_BASE}/collections-state-sync/dashboard`, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(data?.message || "Failed to load collections sync dashboard.");
  }
  return data;
}

export async function fetchCollectionsSyncRecords() {
  const response = await fetch(`${API_BASE}/collections-state-sync/records`, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(data?.message || "Failed to load collections sync records.");
  }
  return data;
}

export async function runCollectionsBulkSync(actor = "frontend-user") {
  const response = await fetch(`${API_BASE}/collections-state-sync/bulk-sync`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ actor }),
  });

  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(data?.message || "Failed to run bulk sync.");
  }
  return data;
}

export async function syncSingleCollection(collectionId: string, actor = "frontend-user") {
  const response = await fetch(`${API_BASE}/collections-state-sync/sync/${collectionId}`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ actor }),
  });

  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(data?.message || `Failed to sync collection ${collectionId}.`);
  }
  return data;
}

export async function fetchSuggestedDriver(collectionId: string) {
  const response = await fetch(`${API_BASE}/collections-state-sync/suggest-driver/${collectionId}`, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(data?.message || `Failed to load suggested driver for ${collectionId}.`);
  }
  return data;
}
