import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { io, Socket } from 'socket.io-client';
import 'maplibre-gl/dist/maplibre-gl.css';
import { FLOWOPS_WS_ORIGIN } from '../lib/env';

interface DriverTelemetry {
  driverId: number;
  name: string;
  vehicleReg: string;
  lat: number;
  lng: number;
  timestamp: string;
}

export const TrackingMap: React.FC<{ companyId: number }> = ({ companyId }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const markersRef = useRef<Map<number, maplibregl.Marker>>(new Map());
  const [connectionStatus, setConnectionStatus] = useState<string>('Initializing Telemetry Stream...');

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize MapTiler Vector Styles Centered on South Africa (Gauteng Logistics Hub)
    mapRef.current = new maplibregl.Map({
      container: mapContainerRef.current,
      style: `https://maptiler.com`,
      center: [28.0473, -26.2041], // Johannesburg coordinates
      zoom: 10,
    });

    mapRef.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    // Connect securely to your real-time WebSocket infrastructure port
    socketRef.current = io(`${FLOWOPS_WS_ORIGIN}/tracking-dashboard`);

    socketRef.current.on('connect', () => {
      setConnectionStatus('📡 Live Telemetry Stream Connected');
      // Securely authenticate client allocation into the corporate room pool channel
      socketRef.current?.emit('joinCompanyDashboard', { companyId });
    });

    // Handle real-time vehicle coordinate updates off the telemetry loop
    socketRef.current.on('telemetryStreamUpdate', (data: DriverTelemetry) => {
      const { driverId, name, vehicleReg, lat, lng } = data;

      // Update position or drop a fresh marker pin onto the canvas
      if (markersRef.current.has(driverId)) {
        markersRef.current.get(driverId)?.setLngLat([lng, lat]);
      } else {
        // Create custom visual HTML Anchor for moving fleet assets
        const customMarkerElement = document.createElement('div');
        customMarkerElement.className = 'driver-marker-pin';
        customMarkerElement.style.width = '20px';
        customMarkerElement.style.height = '20px';
        customMarkerElement.style.backgroundColor = '#0066cc';
        customMarkerElement.style.borderRadius = '50%';
        customMarkerElement.style.border = '2px solid white';
        customMarkerElement.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';

        const popupLayout = new maplibregl.Popup({ offset: 25 }).setHTML(`
          <div style="font-family: sans-serif; padding: 5px;">
            <b style="color: #0f172a;">${name}</b><br/>
            <small style="color: #64748b;">Reg: ${vehicleReg}</small>
          </div>
        `);

        const newMarker = new maplibregl.Marker({ element: customMarkerElement })
          .setLngLat([lng, lat])
          .setPopup(popupLayout)
          .addTo(mapRef.current!);

        markersRef.current.set(driverId, newMarker);
      }
    });

    return () => {
      socketRef.current?.disconnect();
      mapRef.current?.remove();
      markersRef.current.clear();
    };
  }, [companyId]);

  return (
    <div style={{ width: '100%', height: '500px', position: 'relative', borderRadius: '8px', overflow: 'hidden' }}>
      <div 
        style={{ 
          position: 'absolute', top: '10px', left: '10px', zIndex: 10, 
          background: 'rgba(255,255,255,0.9)', padding: '6px 12px', 
          borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', fontFamily: 'sans-serif',
          color: '#0f172a', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}
      >
        {connectionStatus}
      </div>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

