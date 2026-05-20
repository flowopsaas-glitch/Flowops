import axios from "axios";
import { FLOWOPS_API_URL } from "../lib/env";

const ACCESS_TOKEN_KEY = "access_token";
const LOGIN_MODE_KEY = "login_mode";

let memoryToken: string | null = null;
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

// --- 🔓 EXPORTS ---

export function setMemoryToken(token: string | null) {
  memoryToken = token;
}

export function getToken(): string | null {
  if (memoryToken) return memoryToken;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

/** 🛡️ Syncs token to storage and memory to prevent stale state */
export function setToken(token: string | null | undefined) {
  const value = token?.trim();
  if (!value) { clearToken(); return; }
  localStorage.setItem(ACCESS_TOKEN_KEY, value);
  memoryToken = value;
}

export function clearToken() {
  memoryToken = null;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function clearClientSession() {
  clearToken();
  localStorage.removeItem(LOGIN_MODE_KEY);
  localStorage.removeItem("user");
}

/** 🛠️ Queue helper to resume failed requests after refresh */
function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token: string) {
  refreshSubscribers.map((cb) => cb(token));
  refreshSubscribers = [];
}

const api = axios.create({
  baseURL: FLOWOPS_API_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (config.data instanceof FormData) delete config.headers["Content-Type"];
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const { config, response } = err;
    const originalRequest = config;

    if (response?.status === 401 && !originalRequest._retry && !originalRequest.url.includes('/auth/refresh')) {
      if (isRefreshing) {
        // 🚦 Queue this request until refresh is done
        return new Promise((resolve) => {
          subscribeTokenRefresh((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post(`${FLOWOPS_API_URL}/auth/refresh`, {}, { withCredentials: true });
        const newToken = data.accessToken;
        
        setToken(newToken);
        isRefreshing = false;
        onRefreshed(newToken); // 🚀 Resume all queued requests

        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshErr) {
        isRefreshing = false;
        clearClientSession();
        window.location.href = window.location.pathname.startsWith('/driver') ? '/driver/login' : '/login';
        return Promise.reject(refreshErr);
      }
    }
    return Promise.reject(err);
  }
);

export { api };
export default api;
