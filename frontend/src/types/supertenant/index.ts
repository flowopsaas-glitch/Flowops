export interface Company {
  id: number;
  name: string;
  status: 'Active' | 'Inactive' | 'Suspended';
  plan: 'STARTER' | 'PRO' | 'ENTERPRISE';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // Extended fields for dashboard stats (may come from analytics endpoint)
  activeUsers?: number;
  monthlyRevenue?: number;
  dispatchesToday?: number;
  billingStatus?: 'Active' | 'Pending' | 'Overdue';
  lastActive?: string;
}

export interface TenantStats {
  totalTenants: number;
  activeTenants: number;
  totalUsers: number;
  monthlyRevenue: number;
  systemHealth: number;
  dispatchesToday: number;
  pendingIssues: number;
  uptime: number;
}

export interface ChartDataPoint {
  label: string;
  value: number;
  secondary?: number;
}
