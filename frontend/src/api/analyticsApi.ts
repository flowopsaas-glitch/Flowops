import { FLOWOPS_API_URL } from '../lib/env';

// Get the auth token - try multiple possible keys
const getToken = (): string | null => {
  // Check all possible token storage keys
  const keys = [
    'token',
    'accessToken', 
    'access_token',
    'auth_token',
    'authToken',
    'FLOWOPS_TOKEN',
    'flowops_token'
  ];
  
  for (const key of keys) {
    const token = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (token) {
      console.log(`✅ Found token in localStorage key: ${key}`);
      return token;
    }
  }
  
  console.warn('⚠️  No auth token found in localStorage');
  return null;
};

export interface AdminDashboard {
  period: string;
  revenue: {
    totalRevenue: number;
    paidRevenue: number;
    outstandingRevenue: number;
    previousRevenue: number;
    growthRate: number;
    invoiceCount: number;
  };
  aiROI: {
    fraudSavings: number;
    routingSavings: number;
    pricingRevenue: number;
    totalSavings: number;
    eventsProcessed: number;
    roiMultiple: number;
  };
  customerInsights: {
    totalCustomers: number;
    totalWaybills: number;
    deliveredWaybills: number;
    avgDeliveryTimeHours: number;
    deliverySuccessRate: number;
  };
  fleetUtilization: {
    totalDrivers: number;
    activeDrivers: number;
    utilizationRate: number;
    totalDeliveries: number;
    avgDeliveriesPerDriver: number;
  };
  growthMetrics: {
    currentPeriodWaybills: number;
    previousPeriodWaybills: number;
    growthRate: number;
    trend: 'UP' | 'DOWN' | 'STABLE';
  };
  topClients: Array<{
    id: number;
    name: string;
    waybillCount: number;
    deliveredCount: number;
  }>;
  generatedAt: string;
}

export interface DispatcherDashboard {
  slaCompliance: {
    onTimeRate: number;
    onTimeDeliveries: number;
    lateDeliveries: number;
    totalDeliveries: number;
    slaTarget: number;
    slaMet: boolean;
  };
  exceptions: {
    count: number;
    exceptions: Array<{
      id: number;
      waybillNumber: string;
      status: string;
      receiverName?: string;
      receiverPhone?: string;
      origin?: string;
      destination?: string;
      createdAt: string;
    }>;
  };
  operationalVelocity: {
    pendingPickups: number;
    inTransit: number;
    deliveredToday: number;
    failedToday: number;
    successRate: number;
  };
  zoneHeatmap: Array<{
    zone: string;
    pickups: number;
    deliveries: number;
    failures: number;
    totalActivity: number;
  }>;
  hubBottlenecks: Array<{
    id: number;
    name: string;
    status: string;
    waybillCount: number;
    pendingCount: number;
    inTransitCount: number;
  }>;
  activeDeliveries: Array<{
    id: number;
    waybillNumber: string;
    receiverName?: string;
    receiverPhone?: string;
    destination?: string;
    status: string;
    driver?: {
      name: string;
      phone: string;
      lat?: number;
      lng?: number;
    };
  }>;
  generatedAt: string;
}

export const analyticsApi = {
  getAdminDashboard: async (period: '7d' | '30d' | '90d' = '30d'): Promise<AdminDashboard> => {
    const token = getToken();
    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await fetch(`${FLOWOPS_API_URL}/analytics/admin?period=${period}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Admin dashboard API error:', response.status, errorText);
      throw new Error(`Failed to load admin dashboard: ${response.status}`);
    }

    return response.json();
  },

  getDispatcherDashboard: async (): Promise<DispatcherDashboard> => {
    const token = getToken();
    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await fetch(`${FLOWOPS_API_URL}/analytics/dispatcher`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Dispatcher dashboard API error:', response.status, errorText);
      throw new Error(`Failed to load dispatcher dashboard: ${response.status}`);
    }

    return response.json();
  },

  getSmartDashboard: async (period: '7d' | '30d' | '90d' = '30d') => {
    const token = getToken();
    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await fetch(`${FLOWOPS_API_URL}/analytics/smart?period=${period}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to load dashboard: ${response.status}`);
    }

    return response.json();
  },
};
