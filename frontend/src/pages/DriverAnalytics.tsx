import React, { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, Clock, Award, Users, Package } from 'lucide-react';
import { driverAnalyticsApi, AnalyticsOverview, DriverPerformance, DriverMetrics } from '../api/driverAnalyticsApi';

const DriverAnalytics: React.FC = () => {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [performance, setPerformance] = useState<DriverPerformance[]>([]);
  const [metrics, setMetrics] = useState<DriverMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setError(null);
      const [overviewData, performanceData, metricsData] = await Promise.all([
        driverAnalyticsApi.getOverview(),
        driverAnalyticsApi.getPerformance(),
        driverAnalyticsApi.getMetrics(),
      ]);
      setOverview(overviewData);
      setPerformance(performanceData);
      setMetrics(metricsData);
    } catch (err: any) {
      setError(err.message || 'Failed to load analytics');
      console.error('Error loading analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-400">
        <div className="animate-pulse">Loading analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-400">
        <div className="text-lg font-semibold mb-2">Error loading analytics</div>
        <div className="text-sm">{error}</div>
        <button onClick={loadData} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-purple-500" /> Driver Analytics
          </h1>
          <p className="text-gray-400 text-sm mt-1">Performance metrics and insights</p>
        </div>
      </div>

      {/* Stats Grid */}
      {overview && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">Total Deliveries</span>
              <Package className="w-5 h-5 text-green-400" />
            </div>
            <div className="text-2xl font-bold text-white">{overview.totalDeliveries}</div>
          </div>
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">Avg. Delivery Time</span>
              <Clock className="w-5 h-5 text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-white">{overview.avgDeliveryTime} min</div>
          </div>
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">On-Time Rate</span>
              <Award className="w-5 h-5 text-yellow-400" />
            </div>
            <div className="text-2xl font-bold text-white">{overview.onTimeRate}%</div>
          </div>
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">Active Drivers</span>
              <Users className="w-5 h-5 text-purple-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              {overview.activeDrivers} / {overview.totalDrivers}
            </div>
          </div>
        </div>
      )}

      {/* Charts and Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance Chart Placeholder */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-4">Weekly Performance</h3>
          <div className="h-64 flex items-center justify-center text-gray-600">
            <div className="text-center">
              <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-20" />
              <p className="text-sm">Chart visualization coming soon</p>
            </div>
          </div>
        </div>

        {/* Top Performing Drivers */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-4">Top Performing Drivers</h3>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {(performance || []).slice(0, 10).map((driver, idx) => (
              <div key={driver.driverId} className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                    {idx + 1}
                  </div>
                  <div>
                    <div className="text-white text-sm font-medium">{driver.driverName}</div>
                    <div className="text-xs text-gray-500">{driver.deliveries} deliveries</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-green-400 text-sm font-medium">{driver.onTimeRate}%</div>
                  <div className="text-xs text-gray-500">on-time</div>
                </div>
              </div>
            ))}
            {!performance || performance.length === 0 && (
              <div className="text-center text-gray-600 py-8">
                <Users className="w-12 h-12 mx-auto mb-2 opacity-20" />
                <p className="text-sm">No driver performance data yet</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Additional Metrics */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
            <div className="text-gray-400 text-xs mb-1">Total Distance</div>
            <div className="text-xl font-bold text-white">{metrics.totalDistance} km</div>
          </div>
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
            <div className="text-gray-400 text-xs mb-1">Fuel Efficiency</div>
            <div className="text-xl font-bold text-white">{metrics.fuelEfficiency} L/100km</div>
          </div>
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
            <div className="text-gray-400 text-xs mb-1">Customer Satisfaction</div>
            <div className="text-xl font-bold text-white">{metrics.customerSatisfaction}/5.0</div>
          </div>
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
            <div className="text-gray-400 text-xs mb-1">Avg. Rating</div>
            <div className="text-xl font-bold text-white">
              {performance.length > 0 
                ? ((performance || []).reduce((sum, d) => sum + d.rating, 0) / performance.length).toFixed(1)
                : 'N/A'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverAnalytics;
