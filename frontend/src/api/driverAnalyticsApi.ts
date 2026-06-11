import api from './client';

export interface AnalyticsOverview {
  totalDeliveries: number;
  onTimeRate: number;
  activeDrivers: number;
  totalDrivers: number;
  avgDeliveryTime: number;
}

export interface DriverPerformance {
  driverId: number;
  driverName: string;
  deliveries: number;
  avgDeliveryTime: number;
  onTimeRate: number;
  rating: number;
}

export interface DriverMetrics {
  avgDeliveryTime: number;
  totalDistance: number;
  fuelEfficiency: number;
  customerSatisfaction: number;
}

export const driverAnalyticsApi = {
  getOverview: async (companyId?: number): Promise<AnalyticsOverview> => {
    const params = companyId ? { companyId } : {};
    const response = await api.get('/driver-analytics/overview', { params });
    return response as any;
  },

  getPerformance: async (companyId?: number, days: number = 30): Promise<DriverPerformance[]> => {
    const params = { ...(companyId && { companyId }), days };
    const response = await api.get('/driver-analytics/performance', { params });
    return response as any;
  },

  getMetrics: async (companyId?: number): Promise<DriverMetrics> => {
    const params = companyId ? { companyId } : {};
    const response = await api.get('/driver-analytics/metrics', { params });
    return response as any;
  },
};
