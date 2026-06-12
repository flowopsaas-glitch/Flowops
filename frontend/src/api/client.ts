import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { FLOWOPS_API_URL } from '../lib/env';
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

/**
 * Canonical FlowOps HTTP client.
 *
 * Phase 6 follow-up (PR #10): collapsed three competing axios instances
 * (`api/api.ts`, `services/api.ts`, and the original this file) into one
 * module. Both response styles are still supported via two named exports:
 *
 *   `api`    — auto-unwraps `response.data`. Matches the behaviour the
 *              ~45 existing callers were already written against. Backend
 *              wraps payloads as `{ data, ... }`, so `await api.get(url)`
 *              returns that envelope and callers reach into it via
 *              `result.data`.
 *
 *   `rawApi` — returns the standard `AxiosResponse<T>`. Used by callers
 *              that expect axios-shaped responses (e.g. need response
 *              headers, or were originally written against `api/api.ts`
 *              and use `res.data` to peel the *axios* envelope).
 *
 * Both share the SAME refresh queue, request interceptor, error class,
 * and storage backing (`lib/session.ts`). One refresh in flight serves
 * both instances — no duplicate refresh storms.
 */

const API_BASE = FLOWOPS_API_URL;

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
  // Atomic logout — clears the canonical key plus every legacy key.
  clearSession();
};
export const clearToken = clearAuth;
export const clearClientSession = clearAuth;

export const isOwnerMode = (): boolean => sessionIsOwnerMode();
export const isTenantMode = (): boolean => sessionIsTenantMode();
export const isDriverMode = (): boolean => sessionIsDriverMode();

// ── Error class ────────────────────────────────────────────────

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

// ── Refresh-coalescing state (shared across both axios instances) ───────────
//
// When the access token expires, two things can race: a single 401 needs to
// trigger a refresh, but every concurrent in-flight 401 should wait for that
// refresh and retry with the fresh token — not each fire its own refresh
// (token storms exhaust rate limits, and on the backend side hammer
// `/auth/refresh` with stale cookies).
//
// The queue lives at module scope so `api` and `rawApi` share it. The first
// 401 from either instance starts a refresh; every subsequent 401 (whichever
// instance) attaches a callback that resolves with the new token and retries
// the original request.

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token: string) {
  const subs = refreshSubscribers;
  refreshSubscribers = [];
  for (const cb of subs) cb(token);
}

function onRefreshFailed() {
  refreshSubscribers = [];
}

// ── Axios instances ────────────────────────────────────────────

const sharedConfig: AxiosRequestConfig = {
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
};

/** Standard AxiosResponse-shaped client. */
export const rawApi: AxiosInstance = axios.create(sharedConfig);

/** Auto-unwrapping client. `await api.get(url)` returns the response body, not AxiosResponse. */
export const api: AxiosInstance = axios.create(sharedConfig);

// ── Request interceptors (shared logic, attached to both instances) ────────

function attachAuthHeader(config: InternalAxiosRequestConfig) {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // multipart/form-data needs the browser to set its own boundary header.
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
}

rawApi.interceptors.request.use(attachAuthHeader);
api.interceptors.request.use(attachAuthHeader);

// ── Response interceptors ──────────────────────────────────────

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

/**
 * Shared 401 handler. Coalesces concurrent refresh attempts across both
 * instances. Returns a promise that resolves to the *retried* response from
 * the appropriate instance — which is the caller's own instance, so the
 * unwrap-vs-raw shape is preserved end to end.
 */
async function handle401(
  instance: AxiosInstance,
  error: { config: RetryConfig; response?: { status?: number } },
): Promise<unknown> {
  const originalRequest = error.config;

  if (
    error.response?.status !== 401 ||
    originalRequest._retry ||
    String(originalRequest.url ?? '').includes('/auth/refresh')
  ) {
    return Promise.reject(error);
  }

  if (isRefreshing) {
    // Another request is already refreshing. Queue ourselves and resume
    // when the new token lands.
    return new Promise((resolve, reject) => {
      subscribeTokenRefresh((token) => {
        originalRequest._retry = true;
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${token}`;
        }
        instance(originalRequest).then(resolve).catch(reject);
      });
    });
  }

  originalRequest._retry = true;
  isRefreshing = true;

  try {
    // Use the bare axios module (NOT `api` / `rawApi`) so this call doesn't
    // re-enter our own interceptors and recurse.
    const { data } = await axios.post<{ accessToken: string }>(
      `${API_BASE}/auth/refresh`,
      {},
      { withCredentials: true },
    );

    const newToken = data.accessToken;
    setMemoryToken(newToken);
    setToken(newToken);

    isRefreshing = false;
    onRefreshed(newToken);

    if (originalRequest.headers) {
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
    }
    return instance(originalRequest);
  } catch (refreshErr) {
    isRefreshing = false;
    onRefreshFailed();
    clearAuth();
    return Promise.reject(
      new ApiError('Session expired. Please log in again.', 401),
    );
  }
}

// `api` — auto-unwrap response.data (current behaviour for the ~45 callers).
api.interceptors.response.use(
  (response: AxiosResponse) => response.data,
  (error) => {
    return handle401(api, error).catch((finalErr) => {
      if (finalErr instanceof ApiError) return Promise.reject(finalErr);
      const message =
        finalErr?.response?.data?.message ||
        finalErr?.message ||
        'An infrastructure error occurred during data transmission.';
      return Promise.reject(new ApiError(message, finalErr?.response?.status));
    });
  },
);

// `rawApi` — passes the AxiosResponse through unchanged (callers do `.data`).
rawApi.interceptors.response.use(
  (response) => response,
  (error) => handle401(rawApi, error),
);

export default api;

// ── Convenience helpers (return unwrapped data, like `api`) ────────────────
export const get = <T>(url: string, params?: any) => api.get<T, T>(url, { params });
export const post = <T>(url: string, data?: any) => api.post<T, T>(url, data);
export const put = <T>(url: string, data?: any) => api.put<T, T>(url, data);
export const patch = <T>(url: string, data?: any) => api.patch<T, T>(url, data);
export const del = <T>(url: string) => api.delete<T, T>(url);

// ── Legacy aliases ────────────────────────────────────────────────────────
export const apiGet = get;
export const apiPost = post;
export const apiFetch = async <T>(url: string, opts?: RequestInit): Promise<T> => {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((opts?.headers as Record<string, string>) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${url}`, { ...opts, headers });
  if (!res.ok) throw new ApiError(res.statusText, res.status);
  return res.json();
};

export const getApiBaseUrl = () => API_BASE;
