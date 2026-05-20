import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

// ── Token storage ───────────────────────────────────────────
const TOKEN_KEY = 'access_token';
const MODE_KEY = 'flowops_login_mode';
let memoryToken: string | null = null;

export const getToken = () => memoryToken || localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string | null) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};
export const setMemoryToken = (token: string | null) => { memoryToken = token; };
export const getLoginMode = () => localStorage.getItem(MODE_KEY) || 'tenant';
export const setLoginMode = (mode: string) => localStorage.setItem(MODE_KEY, mode);
export const clearAuth = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(MODE_KEY);
  memoryToken = null;
};
export const clearToken = clearAuth;
export const clearClientSession = clearAuth;

// Login mode helpers
export const isOwnerMode = () => getLoginMode() === 'owner';
export const isTenantMode = () => getLoginMode() === 'tenant';
export const isDriverMode = () => getLoginMode() === 'driver';

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
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
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
