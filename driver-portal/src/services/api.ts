import axios from 'axios';
import { clearSession, getToken } from './auth';

// nginx proxies /api to the backend; the backend mounts under /api/v1.
const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

export const api = axios.create({ baseURL: API_BASE, withCredentials: false });

// Attach the driver bearer token to every request.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Unwrap the backend's { data, statusCode, message } envelope, and on a 401
// (token expired OR session superseded by a login on another device) end the
// session and bounce to the PIN screen.
api.interceptors.response.use(
  (res) => (res.data && typeof res.data === 'object' && 'data' in res.data ? (res.data as any).data : res.data),
  (error) => {
    if (error?.response?.status === 401) {
      clearSession();
      if (!location.pathname.startsWith('/login')) {
        location.replace('/login?reason=session');
      }
    }
    const message = error?.response?.data?.message || error?.message || 'Network error';
    return Promise.reject(new Error(Array.isArray(message) ? message.join(', ') : message));
  },
);

export default api;
