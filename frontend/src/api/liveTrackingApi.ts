// src/api/liveTrackingApi.ts

import { FLOWOPS_API_URL } from "../lib/env";
import { getAccessToken } from "../lib/session";

export type LiveTrackingQuery = {
  stuckMins?: number;
  onlyStuck?: boolean;
  limit?: number;
  q?: string;
};

export type LiveTrackingDriver = {
  id: number;
  name: string;
  zone?: string | null;
};

export type LiveTrackingCollection = {
  id: number;
  name: string;
  status?: string;
  approvalStatus?: string;
};

export type LiveTrackingShipment = {
  dispatchId: number;
  status: string;
  updatedAt: string;
  createdAt: string;

  stuckMinutes: number;
  isStuck: boolean;

  approvalsPending: boolean;
  acksCount: number;
  uploadsCount: number;
  hasInvoice: boolean;

  assignedDriver: LiveTrackingDriver | null;
  collection: LiveTrackingCollection | null;

  ai: {
    priorityScore: number; // 0-100
    priorityBand: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    summary: string;
    reasons: string[];
    actions: string[];
  };
};

export type LiveTrackingResponse = {
  summary: {
    total: number;
    stuck: number;
    approvalsPending: number;
    highRisk: number;
    critical: number;
    assigned: number;
    unassigned: number;
  };
  items: LiveTrackingShipment[];
};

function getApiBase(): string {
  return FLOWOPS_API_URL;
}

function getToken(): string | null {
  return getAccessToken();
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBase();
  const token = getToken();

  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
    credentials: "include",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = `Request failed (${res.status})`;
    try {
      const j = JSON.parse(text);
      msg = j?.message || j?.error || msg;
    } catch {
      if (text) msg = text;
    }
    throw new Error(msg);
  }

  return (await res.json()) as T;
}

export async function fetchLiveTracking(query: LiveTrackingQuery): Promise<LiveTrackingResponse> {
  const params = new URLSearchParams();

  if (query.stuckMins != null) params.set("stuckMins", String(query.stuckMins));
  if (query.onlyStuck != null) params.set("onlyStuck", String(query.onlyStuck));
  if (query.limit != null) params.set("limit", String(query.limit));
  if (query.q) params.set("q", String(query.q));

  const qs = params.toString();
  return http<LiveTrackingResponse>(`/shipments/live${qs ? `?${qs}` : ""}`);
}