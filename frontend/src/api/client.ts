import axios from 'axios';
import {
  clearSession,
  getAccessToken,
  getLoginMode as sessionGetLoginMode,
  isDriverMode as sessionIsDriverMode,
  isOwnerMode as sessionIsOwnerMode,
  isTenantMode as sessionIsTenantMode,
  setAccessToken,
  setLoginMode as sessionSetLoginMode,
  setMemoryToken as sessionSetMemoryToken,
  type LoginMode,
} from '../lib/session';

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

// ── Token storage (delegates to lib/session.ts; aliases preserved for callers) ─
export const getToken = (): string | null => getAccessToken();
export const setToken = (token: string | null) => setAccessToken(token);
export const setMemoryToken = (token: string | null) => sessionSetMemoryToken(token);

export const getLoginMode = (): string => sessionGetLoginMode();
export const setLoginMode = (mode: string) => {
  // Only persist known modes; ignore anything else so storage stays in sync
  // with the LoginMode type. Unknown values are dropped silently.
  if (mode === 'tenant' || mode === 'owner' || mode === 'driver') {
    sessionSetLoginMode(mode as LoginMode);
  }
};

export const clearAuth = (): void => {
  // `clearAuth` is the atomic logout the rest of the codebase already calls;
  // route it through the canonical cleanup so legacy keys also disappear.
  clearSession();
};
export const clearToken = clearAuth;
export const clearClientSession = clearAuth;

export const isOwnerMode = (): boolean => sessionIsOwnerMode();
export const isTenantMode = (): boolean => sessionIsTenantMode();
export const isDriverMode = (): boolean => sessionIsDriverMode();

// ── Error class (matches old api/axios.ts signature) ──────────
export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

// ── Axios instance ────────────────────────────────────────
const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// Request: attach JWT
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response: unwrap data + silent token refresh on 401 + error normalization
api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config || {};
    const url: string = originalRequest.url || '';
    const isAuthRoute = url.includes('/auth/');

    // Only attempt a silent refresh (and only clear the session on failure)
    // for TENANT sessions hitting a non-auth endpoint. Owner/driver sessions
    // use different tokens/refresh endpoints — refreshing/clearing them here
    // would wipe a valid owner session and bounce them to /login. We also skip
    // the auth routes themselves to avoid a 401->refresh->400 loop on login.
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isAuthRoute &&
      sessionIsTenantMode()
    ) {
      originalRequest._retry = true;
      try {
        const { data } = await axios.post(
          `${API_BASE}/auth/refresh`,
          {},
          { withCredentials: true },
        );
        setMemoryToken(data.accessToken);
        setToken(data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        clearAuth();
        return Promise.reject(new ApiError('Session expired. Please log in again.', 401));
      }
    }

    const message = error.response?.data?.message || 'An infrastructure error occurred during data transmission.';
    return Promise.reject(new ApiError(message, error.response?.status));
  },
);

export { api };
export default api;

// ── Convenience helpers (return unwrapped data) ──────────────────
export const get = <T>(url: string, params?: any) =>
  api.get<T, T>(url, { params });
export const post = <T>(url: string, data?: any) =>
  api.post<T, T>(url, data);
export const put = <T>(url: string, data?: any) =>
  api.put<T, T>(url, data);
export const patch = <T>(url: string, data?: any) =>
  api.patch<T, T>(url, data);
export const del = <T>(url: string) =>
  api.delete<T, T>(url);

// ── Legacy aliases ─────────────────────────────────────────
export const apiGet = get;
export const apiPost = post;
export const apiFetch = async <T>(url: string, opts?: RequestInit): Promise<T> => {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts?.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${url}`, { ...opts, headers });
  if (!res.ok) throw new ApiError(res.statusText, res.status);
  return res.json();
};

export const getApiBaseUrl = () => API_BASE;
