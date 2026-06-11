import React from 'react';
import { TrendingUp, TrendingDown, Package, Truck, AlertTriangle, DollarSign } from 'lucide-react';

interface KpiCardWidgetProps {
  metric: string;
  value: number | string;
  label: string;
  trend?: number;
}

const icons: Record<string, any> = {
  totalWaybills: Package,
  deliveredToday: Package,
  inTransit: Truck,
  pending: Package,
  exceptions: AlertTriangle,
  revenue: DollarSign,
  otdPercent: TrendingUp,
  activeManifests: Truck,
};

const colors: Record<string, string> = {
  totalWaybills: 'bg-blue-500',
  deliveredToday: 'bg-green-500',
  inTransit: 'bg-yellow-500',
  pending: 'bg-gray-500',
  exceptions: 'bg-red-500',
  revenue: 'bg-purple-500',
  otdPercent: 'bg-indigo-500',
  activeManifests: 'bg-cyan-500',
};

export const KpiCardWidget: React.FC<KpiCardWidgetProps> = ({ metric, value, label, trend }) => {
  const Icon = icons[metric] || Package;
  const color = colors[metric] || 'bg-blue-500';

  return (
    <div className="bg-white rounded-lg shadow p-6 h-full flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <div className={`${color} p-3 rounded-lg`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center text-sm ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {trend >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span className="ml-1">{Math.abs(trend)}%</span>
          </div>
        )}
      </div>
      <div className="mt-4">
        <div className="text-3xl font-bold text-gray-900">
          {metric === 'revenue' ? `R${Number(value).toLocaleString()}` : value}
        </div>
        <div className="text-sm text-gray-600 mt-1">{label}</div>
      </div>
    </div>
  );
};
