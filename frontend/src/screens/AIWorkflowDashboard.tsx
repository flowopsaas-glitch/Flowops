import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Truck, Users, Package, Sparkles } from "lucide-react";
import axios from 'axios';

// Role & subscription props
interface AIWorkflowDashboardProps {
  role: string; // OWNER, ADMIN, OPS, SALES, USER
  subscription: string;
}

interface Metrics {
  totalCollections: number;
  pendingCollections: number;
  scheduledCollections: number;
  collectedCollections: number;
  cancelledCollections: number;
  driversOnline: number;
  stockItems: number;
  activeJobs: number;
  dispatchQueue: number;
  salesOrders: number;
}

export const AIWorkflowDashboard: React.FC<AIWorkflowDashboardProps> = ({ role, subscription }) => {
  const [metrics, setMetrics] = useState<Metrics>({
    totalCollections: 0,
    pendingCollections: 0,
    scheduledCollections: 0,
    collectedCollections: 0,
    cancelledCollections: 0,
    driversOnline: 0,
    stockItems: 0,
    activeJobs: 0,
    dispatchQueue: 0,
    salesOrders: 0
  });

  // Fetch data from API
  const fetchMetrics = async () => {
    try {
      const response = await axios.get('/api/dashboard/metrics');
      setMetrics(response.data);
    } catch (error) {
      console.error('Failed to fetch metrics', error);
    }
  };

  useEffect(() => {
    fetchMetrics();

    const interval = setInterval(fetchMetrics, 15000); // refresh every 15 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">AI Workflow Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-6">
        <Card className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
          <CardHeader>
            <CardTitle>Total Collections</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <Package className="w-8 h-8" />
            <span className="text-2xl font-bold">{metrics.totalCollections}</span>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white">
          <CardHeader>
            <CardTitle>Pending Collections</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <Sparkles className="w-8 h-8" />
            <span className="text-2xl font-bold">{metrics.pendingCollections}</span>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-green-500 to-teal-600 text-white">
          <CardHeader>
            <CardTitle>Scheduled</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <Truck className="w-8 h-8" />
            <span className="text-2xl font-bold">{metrics.scheduledCollections}</span>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
          <CardHeader>
            <CardTitle>Collected</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <Package className="w-8 h-8" />
            <span className="text-2xl font-bold">{metrics.collectedCollections}</span>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-red-500 to-pink-600 text-white">
          <CardHeader>
            <CardTitle>Cancelled</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <Truck className="w-8 h-8" />
            <span className="text-2xl font-bold">{metrics.cancelledCollections}</span>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-6">
        <Card className="bg-gradient-to-r from-purple-400 to-indigo-500 text-white">
          <CardHeader>
            <CardTitle>Drivers Online</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <Users className="w-8 h-8" />
            <span className="text-2xl font-bold">{metrics.driversOnline}</span>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-teal-400 to-green-500 text-white">
          <CardHeader>
            <CardTitle>Stock Items</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <Package className="w-8 h-8" />
            <span className="text-2xl font-bold">{metrics.stockItems}</span>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white">
          <CardHeader>
            <CardTitle>Active Jobs</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <Sparkles className="w-8 h-8" />
            <span className="text-2xl font-bold">{metrics.activeJobs}</span>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-pink-400 to-red-500 text-white">
          <CardHeader>
            <CardTitle>Dispatch Queue</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <Truck className="w-8 h-8" />
            <span className="text-2xl font-bold">{metrics.dispatchQueue}</span>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-indigo-400 to-purple-500 text-white">
          <CardHeader>
            <CardTitle>Sales Orders</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <Package className="w-8 h-8" />
            <span className="text-2xl font-bold">{metrics.salesOrders}</span>
          </CardContent>
        </Card>
      </div>

      {/* AI Insights */}
      <div className="mt-6">
        <Card className="bg-gray-900 text-white">
          <CardHeader>
            <CardTitle>AI Insights & Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-2">
              <li>ðŸš€ Suggest increasing driver allocation for high SLA pending collections.</li>
              <li>ðŸ“¦ Stock running low for key items, consider reorder.</li>
              <li>ðŸ“Š Production line 2 efficiency dropped 12% â€” reassign ops resources.</li>
              <li>ðŸ›£ï¸ Route optimization suggests merging delivery 12 & 13 to reduce fuel.</li>
              <li>ðŸ’° Sales forecast predicts 15% increase next week.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
