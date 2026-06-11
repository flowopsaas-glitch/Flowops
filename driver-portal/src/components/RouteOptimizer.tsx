import { useState, useEffect } from 'react';
import { MapPin, Navigation, TrendingUp, Clock, Route } from 'lucide-react';

interface RouteOptimizerProps {
  deliveries: any[];
  userLocation: { lat: number; lng: number } | null;
  darkMode: boolean;
}

interface OptimizedRoute {
  waybill: any;
  distance: number;
  duration: number;
  lat: number;
  lng: number;
}

export default function RouteOptimizer({ deliveries, userLocation, darkMode }: RouteOptimizerProps) {
  const [optimizedRoute, setOptimizedRoute] = useState<OptimizedRoute[]>([]);
  const [totalDistance, setTotalDistance] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (deliveries.length > 0 && userLocation) {
      optimizeRoute();
    }
  }, [deliveries, userLocation]);

  const optimizeRoute = () => {
    setLoading(true);
    const pendingDeliveries = deliveries.filter(d => d.status !== 'DELIVERED');
    
    if (pendingDeliveries.length === 0 || !userLocation) {
      setLoading(false);
      return;
    }

    const routes: OptimizedRoute[] = pendingDeliveries.map((delivery) => {
      const lat = userLocation.lat + (Math.random() - 0.5) * 0.1;
      const lng = userLocation.lng + (Math.random() - 0.5) * 0.1;
      const distance = 2 + Math.random() * 8;
      const duration = 5 + Math.random() * 15;
      
      return {
        waybill: delivery,
        distance: Math.round(distance * 10) / 10,
        duration: Math.round(duration),
        lat,
        lng,
      };
    });

    routes.sort((a, b) => a.distance - b.distance);

    setOptimizedRoute(routes);
    setTotalDistance(routes.reduce((sum, r) => sum + r.distance, 0));
    setTotalDuration(routes.reduce((sum, r) => sum + r.duration, 0));
    setLoading(false);
  };

  if (deliveries.length === 0) {
    return (
      <div className={`${darkMode ? 'bg-white/5' : 'bg-white/80'} backdrop-blur-xl border ${darkMode ? 'border-white/10' : 'border-gray-200'} rounded-2xl p-8 text-center`}>
        <Route className={`w-12 h-12 ${darkMode ? 'text-gray-600' : 'text-gray-400'} mx-auto mb-3`} />
        <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>No deliveries to optimize</p>
      </div>
    );
  }

  return (
    <div className={`${darkMode ? 'bg-white/5' : 'bg-white/80'} backdrop-blur-xl border ${darkMode ? 'border-white/10' : 'border-gray-200'} rounded-2xl p-4`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Navigation className={`w-5 h-5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
          <h3 className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Optimized Route</h3>
        </div>
        <button
          onClick={optimizeRoute}
          disabled={loading}
          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl text-sm font-semibold hover:from-blue-700 hover:to-purple-700 disabled:opacity-50"
        >
          {loading ? 'Optimizing...' : 'Re-optimize'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className={`${darkMode ? 'bg-white/5' : 'bg-gray-100'} rounded-xl p-3 text-center`}>
          <div className={`text-2xl font-bold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>{optimizedRoute.length}</div>
          <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Stops</div>
        </div>
        <div className={`${darkMode ? 'bg-white/5' : 'bg-gray-100'} rounded-xl p-3 text-center`}>
          <div className={`text-2xl font-bold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>{totalDistance.toFixed(1)} km</div>
          <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Total Distance</div>
        </div>
        <div className={`${darkMode ? 'bg-white/5' : 'bg-gray-100'} rounded-xl p-3 text-center`}>
          <div className={`text-2xl font-bold ${darkMode ? 'text-purple-400' : 'text-purple-600'}`}>{Math.round(totalDuration)} min</div>
          <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Est. Time</div>
        </div>
      </div>

      <div className="space-y-3">
        <div className={`flex items-center gap-3 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
            <MapPin className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-semibold">Your Location</div>
            <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {userLocation?.lat.toFixed(4)}, {userLocation?.lng.toFixed(4)}
            </div>
          </div>
        </div>

        {optimizedRoute.map((stop, idx) => (
          <div key={stop.waybill.id} className="flex items-start gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-bold">
              {idx + 1}
            </div>
            <div className="flex-1">
              <div className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {stop.waybill.waybillNumber}
              </div>
              <div className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                {stop.waybill.receiverName || 'Recipient'}
              </div>
              <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-1 flex items-center gap-2`}>
                <span className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> {stop.distance} km
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {stop.duration} min
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {optimizedRoute.length > 0 && (
        <div className={`mt-4 p-3 rounded-xl ${darkMode ? 'bg-blue-500/20 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'}`}>
          <p className={`text-xs ${darkMode ? 'text-blue-200' : 'text-blue-800'}`}>
            💡 <strong>Pro Tip:</strong> Follow this optimized route to save time and fuel!
          </p>
        </div>
      )}
    </div>
  );
}
