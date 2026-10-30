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
    // The HTTP status and the server's machine-readable code travel WITH the
    // error. Dropping them here (as this interceptor used to) made every 4xx
    // look like a network failure to the offline outbox, which then retried a
    // permanently-rejected write forever — and, worse, blocked the rest of the
    // FIFO queue behind it. A driver confirming a superseded gate window has to
    // be told "not confirmed", and that answer only exists in the status/code.
    const err = new Error(Array.isArray(message) ? message.join(', ') : message) as Error & {
      status?: number;
      code?: string;
      activeVersion?: number | null;
      isNetworkError?: boolean;
    };
    err.status = error?.response?.status;
    const data = error?.response?.data;
    if (data && typeof data === 'object') {
      if (typeof (data as any).code === 'string') err.code = (data as any).code;
      if (typeof (data as any).activeVersion === 'number') err.activeVersion = (data as any).activeVersion;
    }
    // No response at all means the request never got an answer: that is the only
    // thing this app may call a network error.
    err.isNetworkError = !error?.response;
    return Promise.reject(err);
  },
);

export default api;
