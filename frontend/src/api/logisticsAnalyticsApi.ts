import { api } from "./client";

export type LogisticsSnapshot = {
  id: string;
  companyId: string;
  period: string;
  totalDeliveries: number;
  deliveredOnTime: number;
  failedDeliveries: number;
  returnedParcels: number;
  totalCollections: number;
  onTimePercentage: number;
  avgDeliveryMinutes: number | null;
  slaBreaches: number;
  customerRatingAvg: number | null;
  revenue: number;
  costPerDelivery: number | null;
  codCollected: number;
  activeDrivers: number;
  avgDriverUtilPct: number | null;
  topDriverId: string | null;
  aiInsights: {
    summary: string;
    trends: string[];
    recommendations: string[];
  } | null;
  aiGeneratedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TrendPoint = {
  period: string;
  totalDeliveries: number;
  onTimePercentage: number;
  revenue: number;
  slaBreaches: number;
  failedDeliveries: number;
};

/** Fetch analytics snapshot for a specific period (defaults to current month). */
export async function getLogisticsAnalytics(period?: string): Promise<LogisticsSnapshot> {
  const params = period ? { period } : undefined;
  const r: any = await api.get("/logistics-analytics", { params });
  return r?.data ?? r;
}

/** Fetch trend data for the last 6 months. */
export async function getLogisticsTrends(): Promise<TrendPoint[]> {
  const r: any = await api.get("/logistics-analytics/trends");
  return r?.data ?? r;
}

/** Force-refresh analytics for the current period (recompute + AI insights). */
export async function refreshLogisticsAnalytics(): Promise<LogisticsSnapshot> {
  const r: any = await api.post("/logistics-analytics/refresh");
  return r?.data ?? r;
}
