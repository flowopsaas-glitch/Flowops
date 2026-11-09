import { FLOWOPS_API_URL } from '../lib/env';

/**
 * Client for the public freight tools.
 *
 * Deliberately NOT the shared axios client. That one attaches a bearer token,
 * refreshes it, and on a 401 clears the session and redirects to login — all
 * correct for a signed-in tenant and all wrong here: these endpoints are
 * unauthenticated by design, and a prospect with no account must not be
 * bounced to a login screen for using a calculator.
 *
 * Plain fetch, no interceptors, no credentials.
 */

export type HsCodeResult = {
  code: string;
  description: string;
  indicativeRatePct: number;
  category: string;
  note?: string;
};

export type DutyLineResult = {
  description?: string;
  hsCode?: string;
  quantity?: number;
  customsValue: number;
  dutyRatePct: number;
  duty: number;
  atv: number;
  vat: number;
  totalPayable: number;
};

export type DutyEstimate = {
  currency: 'ZAR';
  vatRatePct: number;
  upliftmentPct: number;
  lines: DutyLineResult[];
  totals: {
    customsValue: number;
    duty: number;
    atv: number;
    vat: number;
    totalPayable: number;
  };
  disclaimer: string;
};

export type Rates = {
  currency: string;
  vatRatePct: number;
  upliftmentPct: number;
  disclaimer: string;
};

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${FLOWOPS_API_URL}${path}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json() as Promise<T>;
}

export function searchHsCodes(q: string, limit = 25) {
  return getJson<{ results: HsCodeResult[]; disclaimer: string }>(
    `/public/tools/hs-codes?q=${encodeURIComponent(q)}&limit=${limit}`,
  );
}

export function fetchRates() {
  return getJson<Rates>('/public/tools/rates');
}

export function estimateImportDuty(
  lines: { customsValue: number; dutyRatePct: number; description?: string; hsCode?: string; quantity?: number }[],
) {
  return fetch(`${FLOWOPS_API_URL}/public/tools/import-duty`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ lines }),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return res.json() as Promise<DutyEstimate>;
  });
}
