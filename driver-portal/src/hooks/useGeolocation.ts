import { useEffect, useState } from 'react';

export type GeoState = {
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  loading: boolean;
  error: string | null;
};

/**
 * Watches the device GPS while `active`. `intervalMs` throttles how often we
 * surface a new fix to consumers (the browser may emit far more often).
 */
export function useGeolocation(active: boolean, intervalMs = 30000): GeoState {
  const [state, setState] = useState<GeoState>({
    latitude: null, longitude: null, speed: null, loading: true, error: null,
  });

  useEffect(() => {
    if (!active || !('geolocation' in navigator)) {
      setState((s) => ({ ...s, loading: false, error: active ? 'GPS unavailable' : null }));
      return;
    }
    let last = 0;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - last < intervalMs) return;
        last = now;
        setState({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          speed: pos.coords.speed ?? null,
          loading: false,
          error: null,
        });
      },
      (err) => setState((s) => ({ ...s, loading: false, error: err.message })),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active, intervalMs]);

  return state;
}
