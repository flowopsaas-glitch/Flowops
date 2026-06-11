import api from './client';

export interface DriverLocation {
  id: number;
  name: string;
  phone: string;
  status: string;
  vehicleReg: string;
  vehicleType: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  lastUpdate: string;
  activeDeliveries: number;
  deliveries: any[];
}

export interface FleetStats {
  totalDrivers: number;
  activeDrivers: number;
  offlineDrivers: number;
  todayDeliveries: number;
  inTransit: number;
}

export const fleetMapApi = {
  getActiveDrivers: async (companyId?: number): Promise<DriverLocation[]> => {
    const params = companyId ? { companyId } : {};
    const response = await api.get('/fleet-map/drivers', { params });
    return response as any;
  },

  getFleetStats: async (companyId?: number): Promise<FleetStats> => {
    const params = companyId ? { companyId } : {};
    const response = await api.get('/fleet-map/stats', { params });
    return response as any;
  },
};
