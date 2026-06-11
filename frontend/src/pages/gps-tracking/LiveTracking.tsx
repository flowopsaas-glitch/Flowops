import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { motion } from 'framer-motion';
import { Truck, MapPin, Navigation, Battery, Signal, Clock, Route, AlertTriangle } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Custom driver icon (truck)
const driverIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#3b82f6" stroke="#1e40af" stroke-width="1">
      <path d="M18 18.5a1.5 1.5 0 0 1-1.5-1.5 1.5 1.5 0 0 1 1.5-1.5 1.5 1.5 0 0 1 1.5 1.5 1.5 1.5 0 0 1-1.5 1.5M19.5 9.5l1.5 4h-3l-1.5-4h3M6 18.5a1.5 1.5 0 0 1-1.5-1.5 1.5 1.5 0 0 1 1.5-1.5 1.5 1.5 0 0 1 1.5 1.5 1.5 1.5 0 0 1-1.5 1.5M20 8l3 4v5h-2a2 2 0 0 1-2 2 2 2 0 0 1-2-2H9a2 2 0 0 1-2 2 2 2 0 0 1-2-2H3v-5l3-4V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v5z"/>
    </svg>
  `),
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
});

interface DriverLocation {
  driver: { id: number; name: string; phone: string };
  location: {
    latitude: number;
    longitude: number;
    speed: number;
    heading: number;
    batteryLevel: number;
    signalStrength: number;
    timestamp: string;
  };
}

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

export default function LiveTracking() {
  const [drivers, setDrivers] = useState<DriverLocation[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<DriverLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [center, setCenter] = useState<[number, number]>([-26.2041, 28.0473]); // Johannesburg
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    loadDrivers();
    const interval = setInterval(loadDrivers, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const loadDrivers = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const API_BASE = import.meta.env.VITE_FLOWOPS_API_URL || 'http://localhost:3000/api/v1';
      const response = await fetch(`${API_BASE}/gps-tracking/drivers/locations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      setDrivers(data);
      setLastUpdate(new Date());
      
      if (data.length > 0 && !selectedDriver) {
        setCenter([data[0].location.latitude, data[0].location.longitude]);
      }
    } catch (error) {
      console.error('Failed to load driver locations', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#020617]">
        <motion.div 
          animate={{ rotate: 360 }} 
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      {/* Header */}
      <div className="bg-slate-900/80 backdrop-blur-xl border-b border-white/10 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-blue-400 mb-1">
              <Navigation size={18} />
              <span className="text-xs font-bold uppercase tracking-widest">Live Tracking</span>
            </div>
            <h1 className="text-2xl font-black">Driver Locations</h1>
            <p className="text-xs text-slate-400 mt-1">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-slate-400">Active Drivers</p>
              <p className="text-2xl font-black text-blue-400">{drivers.length}</p>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={loadDrivers}
              className="px-4 py-2 bg-blue-600 rounded-lg text-sm font-bold hover:bg-blue-500 transition"
            >
              Refresh
            </motion.button>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-100px)]">
        {/* Sidebar - Driver List */}
        <div className="w-80 bg-slate-900/50 backdrop-blur-xl border-r border-white/10 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">
              Active Drivers
            </h2>
            <div className="space-y-2">
              {drivers.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Truck className="mx-auto mb-3 opacity-20" size={48} />
                  <p className="text-sm">No drivers online</p>
                  <p className="text-xs mt-1">Drivers will appear here when they start tracking</p>
                </div>
              ) : (
                drivers.map((driver) => (
                  <motion.div
                    key={driver.driver.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setSelectedDriver(driver);
                      setCenter([driver.location.latitude, driver.location.longitude]);
                    }}
                    className={`p-3 rounded-xl cursor-pointer transition-all ${
                      selectedDriver?.driver.id === driver.driver.id
                        ? 'bg-blue-500/20 border border-blue-500/30'
                        : 'bg-slate-800/50 border border-white/5 hover:border-blue-500/20'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-500/10 rounded-lg">
                        <Truck size={16} className="text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{driver.driver.name}</p>
                        <p className="text-xs text-slate-400 truncate">{driver.driver.phone}</p>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div className="flex items-center gap-1 text-slate-400">
                        <Navigation size={10} />
                        <span>{driver.location.speed?.toFixed(0) || 0} km/h</span>
                      </div>
                      <div className="flex items-center gap-1 text-slate-400">
                        <Battery size={10} />
                        <span>{driver.location.batteryLevel || 0}%</span>
                      </div>
                      <div className="flex items-center gap-1 text-slate-400">
                        <Signal size={10} />
                        <span>{driver.location.signalStrength || 0}%</span>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          <MapContainer
            center={center}
            zoom={13}
            className="h-full w-full"
            style={{ background: '#020617' }}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            <MapUpdater center={center} />
            
            {drivers.map((driver) => (
              <Marker
                key={driver.driver.id}
                position={[driver.location.latitude, driver.location.longitude]}
                icon={driverIcon}
                eventHandlers={{
                  click: () => setSelectedDriver(driver),
                }}
              >
                <Popup>
                  <div className="text-slate-900 p-2">
                    <h3 className="font-bold mb-1">{driver.driver.name}</h3>
                    <p className="text-xs text-slate-600">{driver.driver.phone}</p>
                    <div className="mt-2 space-y-1 text-xs">
                      <p>Speed: {driver.location.speed?.toFixed(1) || 0} km/h</p>
                      <p>Battery: {driver.location.batteryLevel || 0}%</p>
                      <p>Updated: {new Date(driver.location.timestamp).toLocaleTimeString()}</p>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* Selected Driver Info Overlay */}
          {selectedDriver && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute bottom-6 left-6 right-6 md:left-auto md:right-6 md:w-96 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-black">{selectedDriver.driver.name}</h3>
                  <p className="text-sm text-slate-400">{selectedDriver.driver.phone}</p>
                </div>
                <button
                  onClick={() => setSelectedDriver(null)}
                  className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition"
                >
                  ×
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-black/40 rounded-xl p-3">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                    <Navigation size={12} />
                    Speed
                  </div>
                  <p className="text-2xl font-black">{selectedDriver.location.speed?.toFixed(0) || 0}</p>
                  <p className="text-xs text-slate-500">km/h</p>
                </div>
                <div className="bg-black/40 rounded-xl p-3">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                    <Battery size={12} />
                    Battery
                  </div>
                  <p className="text-2xl font-black">{selectedDriver.location.batteryLevel || 0}</p>
                  <p className="text-xs text-slate-500">%</p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-slate-400">
                  <MapPin size={14} />
                  <span className="truncate">
                    {selectedDriver.location.latitude.toFixed(6)}, {selectedDriver.location.longitude.toFixed(6)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <Clock size={14} />
                  <span>
                    Last updated: {new Date(selectedDriver.location.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
