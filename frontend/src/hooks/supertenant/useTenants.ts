import { useState, useEffect } from 'react';
import { Company, TenantStats } from '@/types/supertenant';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

export function useTenants() {
  const [tenants, setTenants] = useState<Company[]>([]);
  const [stats, setStats] = useState<TenantStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTenants = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('access_token');
      
      // Fetch companies list
      const tenantsRes = await fetch(`${API_BASE}/companies`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!tenantsRes.ok) throw new Error(`Companies API failed: ${tenantsRes.status}`);
      
      const tenantsData: Company[] = await tenantsRes.json();
      setTenants(Array.isArray(tenantsData) ? tenantsData : []);
      
      // Try to fetch analytics for stats
      let analyticsData: any = null;
      try {
        const analyticsRes = await fetch(
          `${API_BASE}/analytics/admin?companyId=1&period=month`, 
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (analyticsRes.ok) analyticsData = await analyticsRes.json();
      } catch (e) {
        console.warn('Analytics endpoint unavailable, using computed stats');
      }
      
      // Compute stats from available data
      const activeCount = tenantsData.filter(t => t.status === 'Active').length;
      setStats({
        totalTenants: tenantsData.length,
        activeTenants: activeCount,
        totalUsers: analyticsData?.totalUsers || tenantsData.reduce((sum, t) => sum + (t.activeUsers || 0), 0),
        monthlyRevenue: analyticsData?.revenue || tenantsData.reduce((sum, t) => sum + (t.monthlyRevenue || 0), 0),
        systemHealth: analyticsData?.systemHealth || 99,
        dispatchesToday: analyticsData?.dispatchesToday || tenantsData.reduce((sum, t) => sum + (t.dispatchesToday || 0), 0),
        pendingIssues: analyticsData?.pendingIssues || tenantsData.filter(t => t.billingStatus === 'Pending').length,
        uptime: analyticsData?.uptime || 100
      });
      
      setError(null);
    } catch (err: any) {
      setError(err.message);
      console.error('Failed to load tenant data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTenants(); }, []);

  return { tenants, stats, loading, error, refresh: loadTenants };
}
