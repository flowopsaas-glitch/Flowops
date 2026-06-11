import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from 'recharts';
import {
  Clock, AlertTriangle, TrendingUp, MapPin, Package,
  CheckCircle, XCircle, Truck, Navigation
} from 'lucide-react';
import { analyticsApi, DispatcherDashboard as DispatcherDashboardType } from '@/api/analyticsApi';

export default function DispatcherDashboard() {
  const [data, setData] = useState<DispatcherDashboardType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const response = await analyticsApi.getDispatcherDashboard();
      console.log('✅ Dispatcher dashboard data loaded:', response);
      setData(response);
    } catch (error) {
      console.error('❌ Failed to load dispatcher dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center text-red-600 p-8">
        <AlertTriangle className="w-12 h-12 mx-auto mb-4" />
        <p className="text-xl font-bold">Failed to load dashboard data</p>
      </div>
    );
  }

  const zoneChartData = data.zoneHeatmap.map(zone => ({
    name: zone.zone,
    pickups: zone.pickups,
    deliveries: zone.deliveries,
    failures: zone.failures,
  }));

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'IN_TRANSIT': return 'bg-blue-900 text-blue-300 border border-blue-700';
      case 'OUT_FOR_DELIVERY': return 'bg-purple-900 text-purple-300 border border-purple-700';
      case 'EXCEPTION': return 'bg-red-900 text-red-300 border border-red-700';
      case 'FAILED': return 'bg-red-900 text-red-300 border border-red-700';
      default: return 'bg-gray-800 text-gray-300 border border-gray-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Operational Dashboard</h2>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span>Live Updates • Auto-refresh every 30s</span>
        </div>
      </div>

      {/* SLA Compliance Card */}
      <div className={`rounded-2xl shadow-xl p-6 ${
        data.slaCompliance.slaMet
          ? 'bg-gradient-to-br from-green-600 to-green-700'
          : 'bg-gradient-to-br from-amber-600 to-amber-700'
      } text-white`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-8 h-8 opacity-80" />
              <h3 className="text-xl font-bold">SLA Compliance</h3>
            </div>
            <div className="text-5xl font-bold mb-2">{data.slaCompliance.onTimeRate}%</div>
            <div className="text-sm opacity-90">
              Target: {data.slaCompliance.slaTarget}% • {data.slaCompliance.slaMet ? '✅ Target Met' : '⚠️ Below Target'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold mb-2">{data.slaCompliance.totalDeliveries}</div>
            <div className="text-sm opacity-90">Total Deliveries</div>
            <div className="mt-2 text-sm">
              <span className="font-semibold">{data.slaCompliance.onTimeDeliveries}</span> On Time •{' '}
              <span className="font-semibold">{data.slaCompliance.lateDeliveries}</span> Late
            </div>
          </div>
        </div>
      </div>

      {/* Operational Velocity Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-900 rounded-2xl shadow-lg p-6 border-l-4 border-amber-500 border border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <Package className="w-8 h-8 text-amber-500" />
          </div>
          <div className="text-3xl font-bold text-white mb-1">{data.operationalVelocity.pendingPickups}</div>
          <div className="text-sm text-gray-400">Pending Pickups</div>
        </div>

        <div className="bg-gray-900 rounded-2xl shadow-lg p-6 border-l-4 border-blue-500 border border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <Truck className="w-8 h-8 text-blue-500" />
          </div>
          <div className="text-3xl font-bold text-white mb-1">{data.operationalVelocity.inTransit}</div>
          <div className="text-sm text-gray-400">In Transit</div>
        </div>

        <div className="bg-gray-900 rounded-2xl shadow-lg p-6 border-l-4 border-green-500 border border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <div className="text-3xl font-bold text-white mb-1">{data.operationalVelocity.deliveredToday}</div>
          <div className="text-sm text-gray-400">Delivered Today</div>
        </div>

        <div className="bg-gray-900 rounded-2xl shadow-lg p-6 border-l-4 border-red-500 border border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
          <div className="text-3xl font-bold text-white mb-1">{data.operationalVelocity.failedToday}</div>
          <div className="text-sm text-gray-400">Failed Today</div>
          <div className="text-xs text-green-400 mt-1">Success Rate: {data.operationalVelocity.successRate}%</div>
        </div>
      </div>

      {/* Zone Heatmap */}
      <div className="bg-gray-900 rounded-2xl shadow-lg p-6 border border-gray-800">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="w-6 h-6 text-blue-400" />
          <h3 className="text-xl font-bold text-white">Zone Activity Heatmap</h3>
        </div>
        {zoneChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={zoneChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                labelStyle={{ color: '#fff' }}
              />
              <Legend />
              <Bar dataKey="pickups" fill="#3b82f6" name="Pickups" />
              <Bar dataKey="deliveries" fill="#10b981" name="Deliveries" />
              <Bar dataKey="failures" fill="#ef4444" name="Failures" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <MapPin className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>No zone activity data available</p>
          </div>
        )}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Exceptions */}
        <div className="bg-gray-900 rounded-2xl shadow-lg p-6 border border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-red-400" />
              <h3 className="text-xl font-bold text-white">Active Exceptions</h3>
            </div>
            <span className="bg-red-900 text-red-300 px-3 py-1 rounded-full text-sm font-semibold border border-red-800">
              {data.exceptions.count}
            </span>
          </div>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {data.exceptions.exceptions.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
                <p>No active exceptions</p>
              </div>
            ) : (
              data.exceptions.exceptions.map((exception) => (
                <div key={exception.id} className="bg-red-900/30 border border-red-800 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-bold text-white">{exception.waybillNumber}</div>
                      <div className="text-sm text-gray-400">
                        {exception.receiverName || 'Unknown Recipient'}
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(exception.status)}`}>
                      {exception.status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-400">
                    {exception.origin} → {exception.destination}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Created: {new Date(exception.createdAt).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Active Deliveries */}
        <div className="bg-gray-900 rounded-2xl shadow-lg p-6 border border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Navigation className="w-6 h-6 text-blue-400" />
              <h3 className="text-xl font-bold text-white">Active Deliveries</h3>
            </div>
            <span className="bg-blue-900 text-blue-300 px-3 py-1 rounded-full text-sm font-semibold border border-blue-800">
              {data.activeDeliveries.length}
            </span>
          </div>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {data.activeDeliveries.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Truck className="w-12 h-12 mx-auto mb-2 text-gray-600" />
                <p>No active deliveries</p>
              </div>
            ) : (
              data.activeDeliveries.map((delivery) => (
                <div key={delivery.id} className="bg-blue-900/30 border border-blue-800 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-bold text-white">{delivery.waybillNumber}</div>
                      <div className="text-sm text-gray-400">
                        {delivery.receiverName || 'Unknown Recipient'}
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(delivery.status)}`}>
                      {delivery.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="text-sm text-gray-400 mb-2">
                    <MapPin className="w-4 h-4 inline" /> {delivery.destination}
                  </div>
                  {delivery.driver && (
                    <div className="text-sm text-blue-300 bg-blue-900/50 rounded px-2 py-1 inline-block border border-blue-800">
                      <Truck className="w-4 h-4 inline" /> {delivery.driver.name}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Hub Bottlenecks */}
      {data.hubBottlenecks.length > 0 && (
        <div className="bg-gray-900 rounded-2xl shadow-lg p-6 border border-gray-800">
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-6 h-6 text-amber-400" />
            <h3 className="text-xl font-bold text-white">Hub Bottlenecks</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data.hubBottlenecks.map((hub) => (
              <div key={hub.id} className="bg-amber-900/30 border border-amber-800 rounded-xl p-4">
                <div className="font-bold text-white mb-2">{hub.name}</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Total Waybills:</span>
                    <span className="font-semibold text-white">{hub.waybillCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Pending:</span>
                    <span className="font-semibold text-amber-300">{hub.pendingCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">In Transit:</span>
                    <span className="font-semibold text-blue-300">{hub.inTransitCount}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
