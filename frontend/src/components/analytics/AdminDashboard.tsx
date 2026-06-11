import { useState, useEffect } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, Users, Truck,
  Package, CheckCircle, AlertCircle, Zap, Award
} from 'lucide-react';
import { analyticsApi, AdminDashboard as AdminDashboardType } from '@/api/analyticsApi';

export default function AdminDashboard() {
  const [data, setData] = useState<AdminDashboardType | null>(null);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [period]);

  const loadData = async () => {
    try {
      setLoading(true);
      const response = await analyticsApi.getAdminDashboard(period);
      console.log('✅ Admin dashboard data loaded:', response);
      setData(response);
    } catch (error) {
      console.error('❌ Failed to load admin dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center text-red-600 p-8">
        <AlertCircle className="w-12 h-12 mx-auto mb-4" />
        <p className="text-xl font-bold">Failed to load dashboard data</p>
        <p className="text-sm mt-2">Please check your connection and try again</p>
      </div>
    );
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      minimumFractionDigits: 0,
    }).format(value);
  };

  // Prepare chart data
  const aiROIData = [
    { name: 'Fraud Savings', value: data.aiROI.fraudSavings, color: '#ef4444' },
    { name: 'Routing Savings', value: data.aiROI.routingSavings, color: '#3b82f6' },
    { name: 'Pricing Revenue', value: data.aiROI.pricingRevenue, color: '#10b981' },
  ].filter(item => item.value > 0);

  const zoneActivityData = [
    { name: 'Waybills', value: data.customerInsights.totalWaybills, color: '#3b82f6' },
    { name: 'Delivered', value: data.customerInsights.deliveredWaybills, color: '#10b981' },
  ];

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Strategic Analytics</h2>
        <div className="flex gap-2">
          {(['7d', '30d', '90d'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                period === p
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
              }`}
            >
              {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* Revenue Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 text-white shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="w-8 h-8 opacity-80" />
            <span className={`flex items-center gap-1 text-sm font-medium ${
              data.revenue.growthRate >= 0 ? 'text-green-200' : 'text-red-200'
            }`}>
              {data.revenue.growthRate >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {data.revenue.growthRate}%
            </span>
          </div>
          <div className="text-3xl font-bold mb-1">{formatCurrency(data.revenue.totalRevenue)}</div>
          <div className="text-sm opacity-80">Total Revenue</div>
        </div>

        <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-2xl p-6 text-white shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle className="w-8 h-8 opacity-80" />
          </div>
          <div className="text-3xl font-bold mb-1">{formatCurrency(data.revenue.paidRevenue)}</div>
          <div className="text-sm opacity-80">Paid Revenue</div>
        </div>

        <div className="bg-gradient-to-br from-amber-600 to-amber-700 rounded-2xl p-6 text-white shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <AlertCircle className="w-8 h-8 opacity-80" />
          </div>
          <div className="text-3xl font-bold mb-1">{formatCurrency(data.revenue.outstandingRevenue)}</div>
          <div className="text-sm opacity-80">Outstanding</div>
        </div>

        <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-2xl p-6 text-white shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <Zap className="w-8 h-8 opacity-80" />
          </div>
          <div className="text-3xl font-bold mb-1">{data.aiROI.totalSavings > 0 ? `${data.aiROI.roiMultiple}x` : '0x'}</div>
          <div className="text-sm opacity-80">AI ROI Multiple</div>
        </div>
      </div>

      {/* AI ROI Section */}
      <div className="bg-gray-900 rounded-2xl shadow-lg p-6 border border-gray-800">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-6 h-6 text-purple-400" />
          <h3 className="text-xl font-bold text-white">AI ROI Tracker</h3>
        </div>
        {aiROIData.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={aiROIData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${formatCurrency(value)}`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {aiROIData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-4">
              <div className="bg-red-900/30 rounded-xl p-4 border border-red-800">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-5 h-5 text-red-400" />
                  <span className="font-semibold text-red-100">Fraud Prevention</span>
                </div>
                <div className="text-2xl font-bold text-red-300">{formatCurrency(data.aiROI.fraudSavings)}</div>
                <div className="text-sm text-red-400">Saved from fraudulent deliveries</div>
              </div>
              <div className="bg-blue-900/30 rounded-xl p-4 border border-blue-800">
                <div className="flex items-center gap-2 mb-2">
                  <Truck className="w-5 h-5 text-blue-400" />
                  <span className="font-semibold text-blue-100">Route Optimization</span>
                </div>
                <div className="text-2xl font-bold text-blue-300">{formatCurrency(data.aiROI.routingSavings)}</div>
                <div className="text-sm text-blue-400">Fuel and time savings</div>
              </div>
              <div className="bg-green-900/30 rounded-xl p-4 border border-green-800">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-5 h-5 text-green-400" />
                  <span className="font-semibold text-green-100">Dynamic Pricing</span>
                </div>
                <div className="text-2xl font-bold text-green-300">{formatCurrency(data.aiROI.pricingRevenue)}</div>
                <div className="text-sm text-green-400">Additional revenue generated</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <Zap className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg">No AI events recorded yet</p>
            <p className="text-sm mt-2">AI savings will appear here as events are processed</p>
          </div>
        )}
      </div>

      {/* Customer & Fleet Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Customer Insights */}
        <div className="bg-gray-900 rounded-2xl shadow-lg p-6 border border-gray-800">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-6 h-6 text-blue-400" />
            <h3 className="text-xl font-bold text-white">Customer Insights</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-800 rounded-xl">
              <div>
                <div className="text-sm text-gray-400">Total Customers</div>
                <div className="text-2xl font-bold text-white">{data.customerInsights.totalCustomers}</div>
              </div>
              <Users className="w-10 h-10 text-blue-500 opacity-20" />
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-800 rounded-xl">
              <div>
                <div className="text-sm text-gray-400">Total Waybills</div>
                <div className="text-2xl font-bold text-white">{data.customerInsights.totalWaybills}</div>
              </div>
              <Package className="w-10 h-10 text-purple-500 opacity-20" />
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-800 rounded-xl">
              <div>
                <div className="text-sm text-gray-400">Delivery Success Rate</div>
                <div className="text-2xl font-bold text-green-400">{data.customerInsights.deliverySuccessRate}%</div>
              </div>
              <CheckCircle className="w-10 h-10 text-green-500 opacity-20" />
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-800 rounded-xl">
              <div>
                <div className="text-sm text-gray-400">Avg Delivery Time</div>
                <div className="text-2xl font-bold text-white">{data.customerInsights.avgDeliveryTimeHours}h</div>
              </div>
              <Truck className="w-10 h-10 text-amber-500 opacity-20" />
            </div>
          </div>
        </div>

        {/* Fleet Utilization */}
        <div className="bg-gray-900 rounded-2xl shadow-lg p-6 border border-gray-800">
          <div className="flex items-center gap-2 mb-4">
            <Truck className="w-6 h-6 text-green-400" />
            <h3 className="text-xl font-bold text-white">Fleet Utilization</h3>
          </div>
          <div className="space-y-4">
            <div className="relative pt-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-300">Utilization Rate</span>
                <span className="text-sm font-bold text-blue-400">{data.fleetUtilization.utilizationRate}%</span>
              </div>
              <div className="overflow-hidden h-3 text-xs flex rounded-full bg-gray-800">
                <div
                  style={{ width: `${data.fleetUtilization.utilizationRate}%` }}
                  className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-gradient-to-r from-blue-500 to-blue-600"
                ></div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-900/30 rounded-xl p-4 text-center border border-blue-800">
                <div className="text-3xl font-bold text-blue-300">{data.fleetUtilization.activeDrivers}</div>
                <div className="text-sm text-blue-400">Active Drivers</div>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-gray-300">{data.fleetUtilization.totalDrivers}</div>
                <div className="text-sm text-gray-400">Total Drivers</div>
              </div>
            </div>
            <div className="bg-green-900/30 rounded-xl p-4 border border-green-800">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-400">Total Deliveries</div>
                  <div className="text-2xl font-bold text-green-300">{data.fleetUtilization.totalDeliveries}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-400">Avg per Driver</div>
                  <div className="text-2xl font-bold text-green-300">{data.fleetUtilization.avgDeliveriesPerDriver}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Clients */}
      <div className="bg-gray-900 rounded-2xl shadow-lg p-6 border border-gray-800">
        <div className="flex items-center gap-2 mb-4">
          <Award className="w-6 h-6 text-amber-400" />
          <h3 className="text-xl font-bold text-white">Top Clients</h3>
        </div>
        {data.topClients && data.topClients.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-300">Rank</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-300">Client Name</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-300">Waybills</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-300">Delivered</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-300">Success Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.topClients.map((client, index) => {
                  const successRate = client.waybillCount > 0
                    ? (client.deliveredCount / client.waybillCount) * 100
                    : 0;
                  return (
                    <tr key={client.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                      <td className="py-3 px-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                          index === 0 ? 'bg-amber-600 text-white' :
                          index === 1 ? 'bg-gray-600 text-white' :
                          index === 2 ? 'bg-orange-700 text-white' :
                          'bg-gray-800 text-gray-400'
                        }`}>
                          {index + 1}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-medium text-white">{client.name}</td>
                      <td className="py-3 px-4 text-right text-gray-300">{client.waybillCount}</td>
                      <td className="py-3 px-4 text-right text-green-400 font-medium">{client.deliveredCount}</td>
                      <td className="py-3 px-4 text-right">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          successRate >= 90 ? 'bg-green-900 text-green-300' :
                          successRate >= 70 ? 'bg-amber-900 text-amber-300' :
                          'bg-red-900 text-red-300'
                        }`}>
                          {successRate.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <Award className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No client data available</p>
          </div>
        )}
      </div>

      {/* Growth Metrics */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl shadow-xl p-6 text-white">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-6 h-6" />
          <h3 className="text-xl font-bold">Growth Metrics</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="text-sm opacity-80 mb-1">Current Period</div>
            <div className="text-3xl font-bold">{data.growthMetrics.currentPeriodWaybills}</div>
            <div className="text-sm opacity-80">Waybills</div>
          </div>
          <div>
            <div className="text-sm opacity-80 mb-1">Previous Period</div>
            <div className="text-3xl font-bold">{data.growthMetrics.previousPeriodWaybills}</div>
            <div className="text-sm opacity-80">Waybills</div>
          </div>
          <div>
            <div className="text-sm opacity-80 mb-1">Growth Rate</div>
            <div className="text-3xl font-bold flex items-center gap-2">
              {data.growthMetrics.growthRate >= 0 ? (
                <TrendingUp className="w-8 h-8 text-green-300" />
              ) : (
                <TrendingDown className="w-8 h-8 text-red-300" />
              )}
              {data.growthMetrics.growthRate}%
            </div>
            <div className="text-sm opacity-80">Trend: {data.growthMetrics.trend}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
