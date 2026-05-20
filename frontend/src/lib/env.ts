const rawApiUrl = String(import.meta.env.VITE_API_URL || "").trim();
const rawEnv = String(import.meta.env.VITE_APP_ENV || "development")
  .trim()
  .toLowerCase();

export const FLOWOPS_ENV = rawEnv || "development";

export const FLOWOPS_API_URL =
  rawApiUrl && /^https?:\/\//i.test(rawApiUrl)
    ? rawApiUrl.replace(/\/+$/, "")
    : "http://localhost:3000/api"; // 🚀 Changed 127.0.0.1 to localhost to match your browser tab

/** Origin without `/api` — uploads, PDFs, Socket.IO namespace host. */
export const FLOWOPS_HTTP_ORIGIN = FLOWOPS_API_URL.replace(/\/api\/?$/, "");

const rawWs = String(import.meta.env.VITE_WS_ORIGIN || "").trim();

/** Base URL for Socket.IO (Nest `/broadcast` namespace). */
export const FLOWOPS_WS_ORIGIN =
  rawWs && /^https?:\/\//i.test(rawWs)
    ? rawWs.replace(/\/+$/, "")
    : FLOWOPS_HTTP_ORIGIN;

export const IS_PRODUCTION = FLOWOPS_ENV === "production";
