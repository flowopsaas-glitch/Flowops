import { useState, useEffect, useRef } from 'react';

interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  error: string | null;
  loading: boolean;
}

export function useGeolocation(watch = true, intervalMs = 30000) {
  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    speed: null,
    error: null,
    loading: true,
  });
  
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setState(s => ({ ...s, error: 'Geolocation not supported', loading: false }));
      return;
    }

    const onSuccess = (position: GeolocationPosition) => {
      setState({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        speed: position.coords.speed,
        error: null,
        loading: false,
      });
    };

    const onError = (error: GeolocationPositionError) => {
      setState(s => ({ ...s, error: error.message, loading: false }));
    };

    if (watch) {
      watchIdRef.current = navigator.geolocation.watchPosition(onSuccess, onError, {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 10000,
      });
    } else {
      navigator.geolocation.getCurrentPosition(onSuccess, onError, {
        enableHighAccuracy: true,
        timeout: 10000,
      });
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [watch, intervalMs]);

  return state;
}
