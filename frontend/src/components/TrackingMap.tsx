import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { io, Socket } from 'socket.io-client';
import { FLOWOPS_WS_ORIGIN } from '../lib/env';
import { getMapCenter } from '../lib/currency';
import OpenStreetMapLayer from "./maps/OpenStreetMapLayer";

// Default center — resolved dynamically per tenant country.

interface DriverTelemetry {
  driverId: number;
  name: string;
  vehicleReg: string;
  lat: number;
  lng: number;
  timestamp: string;
}

// Custom driver marker icon (blue pulse dot)
function createDriverIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 18px; height: 18px;
      background: #3b82f6;
      border-radius: 50%;
      border: 3px solid #fff;
      box-shadow: 0 0 12px rgba(59,130,246,0.6), 0 2px 8px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -12],
  });
}

// Auto-fit map to show all markers
function FitBounds({ markers }: { markers: Map<number, [number, number]> }) {
  const map = useMap();
  useEffect(() => {
    if (markers.size === 0) return;
    const bounds = L.latLngBounds(Array.from(markers.values()).map(([lat, lng]) => [lat, lng]));
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [markers, map]);
  return null;
}

export const TrackingMap: React.FC<{ companyId: number; countryCode?: string }> = ({ companyId, countryCode }) => {
  const socketRef = useRef<Socket | null>(null);
  const mapRegion = getMapCenter(countryCode);
  const [connectionStatus, setConnectionStatus] = useState<string>('Initializing Telemetry Stream...');
  const [drivers, setDrivers] = useState<Map<number, DriverTelemetry>>(new Map());

  useEffect(() => {
    // Connect to real-time WebSocket telemetry
    socketRef.current = io(`${FLOWOPS_WS_ORIGIN}/tracking-dashboard`);

    socketRef.current.on('connect', () => {
      setConnectionStatus('📡 Live Telemetry Stream Connected');
      socketRef.current?.emit('joinCompanyDashboard', { companyId });
    });

    socketRef.current.on('disconnect', () => {
      setConnectionStatus('⚠️ Reconnecting...');
    });

    socketRef.current.on('connect_error', () => {
      setConnectionStatus('📡 Waiting for telemetry...');
    });

    // Handle real-time vehicle coordinate updates
    socketRef.current.on('telemetryStreamUpdate', (data: DriverTelemetry) => {
      setDrivers(prev => {
        const next = new Map(prev);
        next.set(data.driverId, data);
        return next;
      });
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [companyId]);

  const markerPositions = new Map(
    Array.from(drivers.entries()).map(([id, d]) => [id, [d.lat, d.lng] as [number, number]])
  );

  return (
    <div style={{ width: '100%', height: '500px', position: 'relative', borderRadius: '16px', overflow: 'hidden' }}>
      {/* Status Badge */}
      <div
        style={{
          position: 'absolute', top: '12px', left: '12px', zIndex: 1000,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
          padding: '6px 14px', borderRadius: '999px',
          fontSize: '11px', fontWeight: 700, fontFamily: 'system-ui, sans-serif',
          color: connectionStatus.includes('Connected') ? '#34d399' : '#fbbf24',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        {connectionStatus}
      </div>

      <MapContainer
        center={mapRegion.center}
        zoom={mapRegion.zoom}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <OpenStreetMapLayer />
        <FitBounds markers={markerPositions} />

        {Array.from(drivers.entries()).map(([id, driver]) => (
          <Marker key={id} position={[driver.lat, driver.lng]} icon={createDriverIcon()}>
            <Popup>
              <div style={{ fontFamily: 'system-ui', padding: '4px 0' }}>
                <div style={{ fontWeight: 800, fontSize: '13px', color: '#0f172a' }}>
                  {driver.name}
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                  Reg: {driver.vehicleReg}
                </div>
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
                  {driver.lat != null && driver.lng != null
                    ? `${driver.lat.toFixed(5)}, ${driver.lng.toFixed(5)}`
                    : '—'}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};
