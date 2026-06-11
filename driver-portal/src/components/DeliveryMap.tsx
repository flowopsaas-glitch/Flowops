import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Icon } from 'leaflet';

// Fix Leaflet default marker icon
const customIcon = new Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSIjM2I4MmY2IiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiPjxwYXRoIGQ9Ik0yMCAxMGMwIDYtOCAxMi04IDEyczgtNiA4LTEyLTQtOC04LTggOCA0IDggOHoiLz48Y2lyY2xlIGN4PSIxMiIgY3k9IjEwIiByPSIzIiBmaWxsPSJ3aGl0ZSIvPjwvc3ZnPg==',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32]
});

interface MapViewProps {
  lat: number;
  lng: number;
}

function MapView({ lat, lng }: MapViewProps) {
  const map = useMap();
  map.setView([lat, lng], 13);
  return null;
}

interface DeliveryMapProps {
  deliveries: any[];
  userLocation: { lat: number; lng: number } | null;
  darkMode: boolean;
}

export default function DeliveryMap({ deliveries, userLocation, darkMode }: DeliveryMapProps) {
  if (!userLocation) {
    return (
      <div className={`h-64 flex items-center justify-center ${darkMode ? 'bg-white/5' : 'bg-gray-100'} rounded-2xl`}>
        <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Loading map...</p>
      </div>
    );
  }

  return (
    <MapContainer
      center={[userLocation.lat, userLocation.lng]}
      zoom={13}
      className={`h-80 w-full rounded-2xl z-0 ${darkMode ? 'grayscale-[20%]' : ''}`}
      style={{ filter: darkMode ? 'invert(90%) hue-rotate(180deg)' : 'none' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapView lat={userLocation.lat} lng={userLocation.lng} />
      
      {/* User location marker */}
      <Marker position={[userLocation.lat, userLocation.lng]} icon={customIcon}>
        <Popup>You are here</Popup>
      </Marker>

      {/* Delivery markers */}
      {deliveries.map((delivery) => {
        // Mock coordinates for demo (in production, use actual delivery coordinates)
        const lat = userLocation.lat + (Math.random() - 0.5) * 0.1;
        const lng = userLocation.lng + (Math.random() - 0.5) * 0.1;
        
        return (
          <Marker key={delivery.id} position={[lat, lng]} icon={customIcon}>
            <Popup>
              <div className="p-2">
                <strong>{delivery.waybillNumber}</strong><br />
                {delivery.receiverName || 'Recipient'}<br />
                {delivery.status}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
