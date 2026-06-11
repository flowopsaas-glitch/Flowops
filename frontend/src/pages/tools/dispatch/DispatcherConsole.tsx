import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Truck, Package, AlertCircle, RefreshCw } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

export const DispatcherConsole: React.FC = () => {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [manifests, setManifests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('access_token') || localStorage.getItem('accessToken');
      if (!token) throw new Error('Not authenticated');

      const headers = { Authorization: `Bearer ${token}` };
      
      // Use Promise.allSettled to prevent one failure from breaking everything
      const results = await Promise.allSettled([
        axios.get(`${API_URL}/drivers`, { headers }),
        axios.get(`${API_URL}/manifests`, { headers })
      ]);

      const driversData = results[0].status === 'fulfilled' ? (results[0].value.data || []) : [];
      const manifestsData = results[1].status === 'fulfilled' ? (results[1].value.data || []) : [];

      setDrivers(driversData);
      setManifests(manifestsData);
      setError(null);
    } catch (err: any) {
      console.error('Fetch failed:', err);
      setError(err.message || 'Failed to load dispatch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center bg-[#0f172a]" style={{ minHeight: '100%' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading Dispatch Console...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center bg-[#0f172a] p-8" style={{ minHeight: '100%' }}>
        <div className="bg-[#1e293b] p-6 rounded-lg border border-red-500/30 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Error Loading Console</h3>
          <p className="text-slate-300 mb-4">{error}</p>
          <button 
            onClick={fetchData}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center gap-2 mx-auto"
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  // Safe filtering with fallbacks
  const openManifests = manifests.filter((m: any) => m?.status === 'OPEN' || !m?.status);
  const availableDrivers = drivers.filter((d: any) => d?.status === 'AVAILABLE');
  const busyDrivers = drivers.filter((d: any) => d?.status === 'BUSY');

  return (
    <div className="flex flex-col bg-[#0f172a] text-white" style={{ minHeight: '100%' }}>
      {/* Header */}
      <div className="bg-[#1e293b] border-b border-slate-700 p-4 flex justify-between items-center shrink-0">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Truck className="w-5 h-5 text-blue-400" />
          Dispatch Command Center
        </h1>
        <div className="flex gap-3">
          <button onClick={fetchData} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-full text-sm flex items-center gap-2 transition-colors">
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
          <div className="px-3 py-1 bg-green-900/30 text-green-400 rounded-full text-sm flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            {availableDrivers.length} Available Drivers
          </div>
          <div className="px-3 py-1 bg-yellow-900/30 text-yellow-400 rounded-full text-sm flex items-center gap-2">
            <Package className="w-3 h-3" />
            {openManifests.length} Open Manifests
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex" style={{ minHeight: '600px' }}>
        {/* Left Panel: Data Lists */}
        <div className="w-96 bg-[#1e293b] border-r border-slate-700 overflow-y-auto shrink-0">
          <div className="p-4 space-y-6">
            {/* Manifests Section */}
            <div>
              <h2 className="font-semibold mb-3 flex items-center gap-2 text-slate-200">
                <Package className="w-4 h-4 text-blue-400" /> Open Manifests
              </h2>
              <div className="space-y-2">
                {openManifests.map((manifest: any, idx: number) => (
                  <div key={manifest.id || idx} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-blue-500/50 transition-colors cursor-pointer">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-slate-200">{manifest.manifestNumber || `MAN-${manifest.id || idx}`}</div>
                        <div className="text-xs text-slate-400 mt-1">{manifest.destination || 'Unknown Destination'}</div>
                      </div>
                      <span className="text-xs bg-slate-700 px-2 py-1 rounded text-slate-300">
                        {manifest.waybillCount || 0} WB
                      </span>
                    </div>
                  </div>
                ))}
                {openManifests.length === 0 && (
                  <div className="text-center text-slate-500 py-8 text-sm">No open manifests</div>
                )}
              </div>
            </div>

            {/* Drivers Section */}
            <div>
              <h2 className="font-semibold mb-3 flex items-center gap-2 text-slate-200">
                <Truck className="w-4 h-4 text-blue-400" /> Available Drivers
              </h2>
              <div className="space-y-2">
                {availableDrivers.map((driver: any, idx: number) => (
                  <div key={driver.id || idx} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium text-slate-200">{driver.name || `Driver #${driver.id || idx}`}</div>
                        <div className="text-xs text-slate-400">{driver.phone || 'No phone'}</div>
                      </div>
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    </div>
                  </div>
                ))}
                {availableDrivers.length === 0 && (
                  <div className="text-center text-slate-500 py-8 text-sm">No available drivers</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel: Map Placeholder */}
        <div className="flex-1 relative bg-slate-900 flex items-center justify-center">
          <div className="text-center text-slate-500">
            <Truck className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium">Live Fleet Map</p>
            <p className="text-sm mt-2">Map integration coming next</p>
          </div>
          
          {/* Stats Overlay */}
          <div className="absolute top-4 right-4 bg-[#1e293b]/90 backdrop-blur-sm p-4 rounded-lg border border-slate-700 shadow-xl">
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-3 font-semibold">Fleet Status</div>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">{availableDrivers.length}</div>
                <div className="text-xs text-slate-400 mt-1">Available</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-400">{busyDrivers.length}</div>
                <div className="text-xs text-slate-400 mt-1">On Route</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
