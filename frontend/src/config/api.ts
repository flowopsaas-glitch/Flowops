import { FLOWOPS_API_URL } from "../lib/env";

/**
 * Versioned API base. The backend mounts this app under `/api/v1` while
 * `FLOWOPS_API_URL` (from `lib/env.ts`) is the unversioned `/api` root —
 * append `/v1` here so existing call sites keep their original paths.
 */
export const API_BASE_URL = `${FLOWOPS_API_URL}/v1`;

export const ENDPOINTS = {
  WAYBILLS: `${API_BASE_URL}/waybills`,
  BILLING: `${API_BASE_URL}/billing-batches`,
  INVOICES: `${API_BASE_URL}/invoice`,
  AI: `${API_BASE_URL}/ai`,
  DRIVERS: `${API_BASE_URL}/drivers`,
};
