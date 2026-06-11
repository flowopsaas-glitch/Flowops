import { useEffect, useRef, useState, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, CircleMarker } from "react-leaflet";
import L from "leaflet";
import { io, Socket } from "socket.io-client";
import "leaflet/dist/leaflet.css";
// Clustering disabled for now - using simple markers

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// ============================================
// TYPES
// ============================================
export type MapMode = "fleet" | "tracking" | "live";

export interface DriverLocation {
  id: number;
  name: string;
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
  status?: string;
  vehicle?: string;
  lastUpdate?: string;
}

export interface RoutePoint {
  lat: number;
  lng: number;
  label?: string;
  type?: "origin" | "destination" | "waypoint";
}

export interface FlowOpsMapProps {
  mode: MapMode;
  drivers?: DriverLocation[];
  route?: RoutePoint[];
  center?: [number, number];
  zoom?: number;
  enableWebSocket?: boolean;
  companyId?: number;
  waybillNumber?: string;
  height?: string;
  showControls?: boolean;
}

// ============================================
// CUSTOM MARKER ICONS
// ============================================
const createDriverIcon = (heading: number = 0, status: string = "active") => {
  const colors = {
    active: "#3b82f6",
    idle: "#f59e0b",
    offline: "#6b7280",
    delivering: "#10b981",
  };
  const color = colors[status as keyof typeof colors] || colors.active;

  return L.divIcon({
    className: "driver-marker",
    html: `
      <div style="
        width: 44px;
        height: 44px;
        background: linear-gradient(135deg, ${color} 0%, ${color}dd 100%);
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 4px 12px ${color}80;
        display: flex;
        align-items: center;
        justify-content: center;
        transform: rotate(${heading}deg);
        transition: transform 0.5s ease;
      ">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
          <path d="M18 18.5c-1.5 0-2.77-.77-3.5-1.94l-4.42-2.45c-.26.28-.58.5-.94.64L9 15v2c0 .55-.45 1-1 1s-1-.45-1-1v-2l-.14-.07c-.97-.47-1.64-1.45-1.64-2.58 0-.68.25-1.31.66-1.79L4.5 9.5C3.67 9.5 3 8.83 3 8s.67-1.5 1.5-1.5S6 7.17 6 8c0 .28-.08.54-.21.76l1.47 1.11c.47-.29 1.03-.47 1.63-.47.83 0 1.58.34 2.12.88l4.42 2.45c.73-1.17 2-1.94 3.5-1.94 2.21 0 4 1.79 4 4s-1.79 4-4 4z"/>
        </svg>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
};

const createPointIcon = (type: "origin" | "destination" | "waypoint") => {
  const configs = {
    origin: { color: "#3b82f6", icon: "📦", label: "Origin" },
    destination: { color: "#10b981", icon: "📍", label: "Destination" },
    waypoint: { color: "#f59e0b", icon: "⚑", label: "Waypoint" },
  };
  const config = configs[type];

  return L.divIcon({
    className: "point-marker",
    html: `
      <div style="
        width: 40px;
        height: 40px;
        background: linear-gradient(135deg, ${config.color} 0%, ${config.color}dd 100%);
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 4px 12px ${config.color}80;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        animation: pulse 2s infinite;
      ">
        ${config.icon}
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
};

// ============================================
// MAP CONTROLS
// ============================================
function MapBoundsController({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length >= 2) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    } else if (points.length === 1) {
      map.setView(points[0], 13);
    }
  }, [points, map]);
  return null;
}

function MapClickHandler({ onLocationSelect }: { onLocationSelect?: (lat: number, lng: number) => void }) {
  const map = useMap();
  useEffect(() => {
    if (onLocationSelect) {
      map.on("click", (e: any) => {
        onLocationSelect(e.latlng.lat, e.latlng.lng);
      });
    }
  }, [map, onLocationSelect]);
  return null;
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function FlowOpsMap({
  mode,
  drivers = [],
  route = [],
  center = [-29.0, 24.0], // South Africa default
  zoom = 6,
  enableWebSocket = false,
  companyId,
  waybillNumber,
  height = "500px",
  showControls = true,
}: FlowOpsMapProps) {
  const [liveDrivers, setLiveDrivers] = useState<DriverLocation[]>(drivers);
  const socketRef = useRef<Socket | null>(null);

  // WebSocket connection for live updates
  useEffect(() => {
    if (!enableWebSocket) return;

    const SOCKET_URL = import.meta.env.VITE_FLOWOPS_API_URL?.replace('/api/v1', '') || 'http://localhost:3000';
    
    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('🔗 FlowOpsMap connected to WebSocket');
      if (companyId) {
        socket.emit('joinCompanyRoom', { companyId });
      }
      if (waybillNumber) {
        socket.emit('joinPublicTracking', { waybillNumber });
      }
    });

    socket.on('driver-location-updated', (data: any) => {
      console.log('📍 Live driver update:', data);
      setLiveDrivers(prev => {
        const existing = prev.findIndex(d => d.id === data.driverId);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = {
            ...updated[existing],
            lat: data.latitude,
            lng: data.longitude,
            speed: data.speed,
            heading: data.heading,
            lastUpdate: new Date().toISOString(),
          };
          return updated;
        } else {
          return [...prev, {
            id: data.driverId,
            name: data.driverName || 'Driver',
            lat: data.latitude,
            lng: data.longitude,
            speed: data.speed,
            heading: data.heading,
            lastUpdate: new Date().toISOString(),
          }];
        }
      });
    });

    socket.on('disconnect', () => {
      console.log('❌ FlowOpsMap disconnected');
    });

    return () => {
      socket.disconnect();
    };
  }, [enableWebSocket, companyId, waybillNumber]);

  // Update drivers when prop changes
  useEffect(() => {
    if (drivers.length > 0) setLiveDrivers(drivers);
  }, [drivers]);

  // Calculate all points for bounds
  const allPoints = useMemo(() => {
    const points: [number, number][] = [];
    liveDrivers.forEach(d => points.push([d.lat, d.lng]));
    route.forEach(r => points.push([r.lat, r.lng]));
    return points;
  }, [liveDrivers, route]);

  // Route line
  const routeLine = useMemo(() => {
    if (route.length < 2) return null;
    return route.map(r => [r.lat, r.lng] as [number, number]);
  }, [route]);

  return (
    <div className="relative rounded-2xl overflow-hidden shadow-2xl border-2 border-white bg-gray-100">
      {/* Mode indicator */}
      {showControls && (
        <div className="absolute top-4 left-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg flex items-center gap-2">
          <div className="relative">
            <div className={`w-3 h-3 rounded-full ${enableWebSocket ? 'bg-red-500' : 'bg-gray-400'}`}></div>
            {enableWebSocket && (
              <div className="absolute inset-0 w-3 h-3 bg-red-500 rounded-full animate-ping"></div>
            )}
          </div>
          <span className="text-sm font-bold text-gray-800 uppercase">
            {mode === 'fleet' && '🚚 Fleet View'}
            {mode === 'tracking' && '📦 Tracking'}
            {mode === 'live' && '🔴 Live'}
          </span>
        </div>
      )}

      {/* Stats overlay for fleet mode */}
      {mode === 'fleet' && showControls && (
        <div className="absolute top-4 right-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-xl px-4 py-3 shadow-lg">
          <div className="text-xs text-gray-600 uppercase tracking-wide">Active Drivers</div>
          <div className="text-2xl font-bold text-blue-600">{liveDrivers.length}</div>
        </div>
      )}

      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={true}
        style={{ height, width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {allPoints.length > 0 && <MapBoundsController points={allPoints} />}

        {/* Route line */}
        {routeLine && (
          <Polyline
            positions={routeLine}
            pathOptions={{
              color: '#3b82f6',
              weight: 4,
              opacity: 0.8,
              dashArray: mode === 'tracking' ? '10, 10' : undefined,
            }}
          />
        )}

        {/* Route points (origin/destination/waypoints) */}
        {route.map((point, idx) => (
          <Marker
            key={idx}
            position={[point.lat, point.lng]}
            icon={createPointIcon(point.type || 'waypoint')}
          >
            <Popup>
              <div className="text-center">
                <div className="font-bold text-gray-900">{point.label || point.type}</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Drivers - with clustering for fleet mode */}
        {/* Render all drivers (clustering disabled for now) */}
        {liveDrivers.map(driver => (
            <Marker
              key={driver.id}
              position={[driver.lat, driver.lng]}
              icon={createDriverIcon(driver.heading, driver.status)}
            >
              <Popup>
                <div className="text-center min-w-[150px]">
                  <div className="font-bold text-blue-600">🚚 {driver.name}</div>
                  {driver.vehicle && <div className="text-sm text-gray-600">{driver.vehicle}</div>}
                  {driver.speed !== undefined && (
                    <div className="text-sm mt-1">
                      Speed: <span className="font-semibold">{Math.round(driver.speed)} km/h</span>
                    </div>
                  )}
                  {driver.lastUpdate && (
                    <div className="text-xs text-gray-500 mt-1">
                      Updated: {new Date(driver.lastUpdate).toLocaleTimeString()}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          ))
        }
      </MapContainer>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }
        .leaflet-container {
          font-family: inherit;
        }
        .driver-marker, .point-marker {
          background: transparent !important;
          border: none !important;
        }
      `}</style>
    </div>
  );
}
