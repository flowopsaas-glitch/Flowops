import { 
  apiGet, 
  apiPost, 
  getToken, 
  setToken, 
  clearToken, 
  api, 
  ApiError 
} from "./client";

export {
  apiGet,
  apiPost,
  getToken,
  setToken,
  clearToken,
  api,
  ApiError
};

// Default export if any file needs the whole client
export default api;

// ── Legacy Base44 platform shim ─────────────────────────────────────────
// Not an HTTP client: a tiny page tracker + optional logout hook left over
// from the Base44 prototype. Folded into this barrel by the API-client
// consolidation so all API-surface imports resolve through one module.
type Base44Client = {
  page: string;
  auth?: { logout?: () => Promise<void> };
};

export const base44: Base44Client = {
  page: 'Dashboard',
  auth: {
    async logout() {
      return;
    },
  },
};
