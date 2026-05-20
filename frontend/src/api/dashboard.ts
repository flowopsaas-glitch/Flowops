import api from "./client";

export interface DashboardMetrics {
  totalCollections: number;
  activeDrivers: number;
  parcelsInTransit: number;
  activeAccounts: number;
  needsAttention: number;
  stockLevels: number;
}

export const getDashboardMetrics = async (): Promise<DashboardMetrics> => {
  const response = await api.get("/dashboard/metrics");
  return response.data;
};
