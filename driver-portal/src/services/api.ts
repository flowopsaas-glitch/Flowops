import axios from 'axios';
import { clearSession, getToken, silentRefresh } from './auth';

// nginx proxies /api to the backend; the backend mounts under /api/v1.
const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

export const api = axios.create({ baseURL: API_BASE, withCredentials: false });

// Attach the driver bearer token to every request.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Unwrap the backend's { data, statusCode, message } envelope.
// On a 401: attempt a silent token refresh first (token may have expired naturally
// after 4h). If refresh succeeds, replay the original request transparently.
// Only if refresh also fails (session superseded on another device, or refresh
// token expired) do we clear the session and bounce to the PIN screen.
api.interceptors.response.use(
  (res) =>
    res.data && typeof res.data === 'object' && 'data' in res.data
      ? (res.data as any).data
      : res.data,
  async (error) => {
    const originalRequest = error.config || {};

    if (error?.response?.status === 401 && !originalRequest._driverRetry) {
      originalRequest._driverRetry = true;
      try {
        const newToken = await silentRefresh();
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch {
        // Refresh failed — session is truly expired or superseded
        clearSession();
        if (!location.pathname.startsWith('/login')) {
          location.replace('/login?reason=session');
        }
      }
    }

    const message =
      error?.response?.data?.message || error?.message || 'Network error';
    return Promise.reject(
      new Error(Array.isArray(message) ? message.join(', ') : message),
    );
  },
);

export default api;
