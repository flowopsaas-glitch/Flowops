import React, { useEffect, useState } from 'react';
import { MapPin, Truck, Navigation, Activity, Clock, TrendingUp } from 'lucide-react';
import { fleetMapApi, DriverLocation, FleetStats } from '../api/fleetMapApi';
import FlowOpsMap from '../components/FlowOpsMap';

export default function FleetMap() {
  const [drivers, setDrivers] = useState<DriverLocation[]>([]);
  const [stats, setStats] = useState<FleetStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [driversData, statsData] = await Promise.all([
        fleetMapApi.getDriverLocations(),
        fleetMapApi.getFleetStats(),
      ]);
      setDrivers(driversData);
      setStats(statsData);
    } catch (error) {
      console.error('Failed to load fleet data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Truck className="text-blue-600" />
          Fleet Map
        </h1>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Activity className="w-4 h-4 text-green-500" />
          <span>Live Updates</span>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Truck className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Active Drivers</p>
                <p className="text-2xl font-bold">{stats.activeDrivers}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Navigation className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Avg Speed</p>
                <p className="text-2xl font-bold">{stats.averageSpeed} km/h</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <MapPin className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Distance</p>
                <p className="text-2xl font-bold">{stats.totalDistance} km</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <Clock className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Idle Time</p>
                <p className="text-2xl font-bold">{stats.idleTime} min</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Map */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <FlowOpsMap
          mode="fleet"
          drivers={drivers}
          enableWebSocket={true}
          height="600px"
        />
      </div>
    </div>
  );
}
