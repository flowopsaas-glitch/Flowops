import axios from 'axios';
import {
  clearSession,
  getAccessToken,
  getRefreshToken as sessionGetRefreshToken,
  setRefreshToken as sessionSetRefreshToken,
  getLoginMode as sessionGetLoginMode,
  isDriverMode as sessionIsDriverMode,
  isOwnerMode as sessionIsOwnerMode,
  isTenantMode as sessionIsTenantMode,
  setAccessToken,
  setLoginMode as sessionSetLoginMode,
  setMemoryToken as sessionSetMemoryToken,
  type LoginMode,
} from '../lib/session';

// Single base-URL resolution for all API traffic: lib/env is the documented
// source of truth (27 modules already import it). Split-brain resolution
// (this file vs lib/env) meant the same app could hit two different hosts.
import { FLOWOPS_API_URL as API_BASE } from '../lib/env';

// ── Token storage (delegates to lib/session.ts; aliases preserved for callers) ─
export const getToken = (): string | null => getAccessToken();
export const setToken = (token: string | null) => setAccessToken(token);
export const setMemoryToken = (token: string | null) => sessionSetMemoryToken(token);
export const getRefreshToken = (): string | null => sessionGetRefreshToken();
export const setRefreshToken = (token: string | null) => sessionSetRefreshToken(token);

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

// ── Network resilience config ─────────────────────────────
// Our users are couriers/dispatchers on mobile data in low-signal areas, so
// the client MUST survive a weak or flaky connection instead of failing hard.
//   • REQUEST_TIMEOUT_MS — give up on a stalled request (never hang forever).
//   • MAX_RETRIES / RETRY_BASE_DELAY_MS — retry transient network + timeout
//     failures (and 502/503/504 from a briefly-unavailable server) with
//     exponential backoff, so a momentary signal dip recovers automatically.
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 600;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A failure is transient (worth retrying) when the request never got a real
 * answer — no response (network drop / DNS / connection refused), a timeout
 * (ECONNABORTED), or the server briefly returned 502/503/504. A 4xx (bad
 * request, 401, 404, validation) is NOT transient and must not be retried.
 */
type AxiosLikeError = {
  code?: string;
  message?: string;
  response?: { status?: number };
};

function isTransient(error: unknown): boolean {
  const e = error as AxiosLikeError | null;
  if (e?.code === 'ECONNABORTED') return true;            // axios timeout
  if (e?.message === 'Network Error') return true;         // no response
  if (!e?.response) return true;                           // never reached server
  const s = e.response.status;
  return s === 502 || s === 503 || s === 504;
}

// ── Shared-refresh queue ──────────────────────────────────────────────────
// Concurrent 401s must share ONE refresh call. Parallel refreshes can race a
// rotating refresh token and kill the whole session (each response invalidates
// the other's token) — the failure mode drivers hit on flaky mobile data.
let isRefreshing = false;
let refreshSubscribers: Array<{
  onSuccess: (token: string) => void;
  onError: (err: unknown) => void;
}> = [];
const flushRefreshQueue = (token: string | null, err?: unknown): void => {
  const subs = refreshSubscribers;
  refreshSubscribers = [];
  isRefreshing = false;
  for (const sub of subs) {
    if (token) sub.onSuccess(token);
    else sub.onError(err);
  }
};

// ── Axios instance ────────────────────────────────────────
const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
  // Never hang forever on a weak connection — fail cleanly after 30s so the
  // retry logic (and, ultimately, a readable error) can take over.
  timeout: REQUEST_TIMEOUT_MS,
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
      const storedRefresh = sessionGetRefreshToken();
      // No refresh token to present → can't silently refresh; end the session.
      if (!storedRefresh) {
        clearAuth();
        return Promise.reject(new ApiError('Session expired. Please log in again.', 401));
      }
      // A refresh is already in flight — queue behind it instead of firing a
      // parallel one (see shared-refresh queue above).
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshSubscribers.push({
            onSuccess: (token) => {
              originalRequest.headers = originalRequest.headers || {};
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(api(originalRequest));
            },
            onError: (err) => reject(err),
          });
        });
      }
      isRefreshing = true;
      try {
        const resp = await axios.post(
          `${API_BASE}/auth/refresh`,
          { refreshToken: storedRefresh },
          { withCredentials: true, timeout: REQUEST_TIMEOUT_MS },
        );
        // Unwrap the TransformInterceptor envelope: { data: { access_token, refresh_token }, ... }
        const body = resp.data?.data ?? resp.data ?? {};
        const newAccess = body.access_token ?? body.accessToken;
        const newRefresh = body.refresh_token ?? body.refreshToken;
        if (!newAccess) throw new Error('No access token in refresh response');
        if (newRefresh) sessionSetRefreshToken(newRefresh);
        setMemoryToken(newAccess);
        setToken(newAccess);
        flushRefreshQueue(newAccess);
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;
        return api(originalRequest);
      } catch {
        flushRefreshQueue(null, new ApiError('Session expired. Please log in again.', 401));
        clearAuth();
        return Promise.reject(new ApiError('Session expired. Please log in again.', 401));
      }
    }

    // ── Auto-retry transient network failures ──────────────────────────────
    // A weak/dropped connection or a briefly-unavailable server (502/503/504)
    // is retried up to MAX_RETRIES with exponential backoff, so login and every
    // other request survive a momentary signal dip instead of failing outright.
    // 4xx responses (invalid credentials, validation, 401/404) are NOT retried.
    if (isTransient(error)) {
      originalRequest._retryCount = (originalRequest._retryCount ?? 0) + 1;
      if (originalRequest._retryCount <= MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * 2 ** (originalRequest._retryCount - 1); // 0.6s, 1.2s, 2.4s
        await sleep(delay);
        return api(originalRequest);
      }
    }

    // ── Readable, honest error message ─────────────────────────────────────
    // If the request never reached the server (no response after retries), the
    // problem is the user's connection — say so plainly instead of the old,
    // confusing "infrastructure error during data transmission".
    let message: string;
    if (error.response?.data?.message) {
      message = error.response.data.message;                    // real server error
    } else if (isTransient(error)) {
      message =
        'Can’t reach FlowOps — please check your internet connection and try again.';
    } else {
      message = 'Something went wrong. Please try again.';
    }
    return Promise.reject(new ApiError(message, error.response?.status));
  },
);

export { api };
export default api;

// ── Convenience helpers (return unwrapped data) ──────────────────
export const get = <T>(url: string, params?: Record<string, unknown>) =>
  api.get<T, T>(url, { params });
export const post = <T>(url: string, data?: unknown) =>
  api.post<T, T>(url, data);
export const put = <T>(url: string, data?: unknown) =>
  api.put<T, T>(url, data);
export const patch = <T>(url: string, data?: unknown) =>
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
  // Bound this raw fetch with the same 30s ceiling as the axios client so it
  // can't hang forever on a weak connection.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${url}`, { ...opts, headers, signal: controller.signal });
    if (!res.ok) throw new ApiError(res.statusText, res.status);
    return res.json();
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new ApiError('Can’t reach FlowOps — please check your internet connection and try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

export const getApiBaseUrl = () => API_BASE;
