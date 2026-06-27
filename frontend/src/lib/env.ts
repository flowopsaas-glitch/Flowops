/**
 * Centralised access to Vite-injected environment variables.
 *
 * Every module that needs a backend URL, a Socket.IO origin, or an environment
 * marker should import from here rather than reading `import.meta.env.*`
 * directly. This keeps fallbacks consistent and gives us one place to change
 * defaults.
 *
 * See `.env.example` for the full list of supported keys.
 */

const rawApiUrl = String(
  import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    "",
).trim();
const rawEnv = String(import.meta.env.VITE_APP_ENV || "development")
  .trim()
  .toLowerCase();
const rawWs = String(import.meta.env.VITE_WS_ORIGIN || "").trim();
const rawOllama = String(import.meta.env.VITE_OLLAMA_URL || "").trim();
const rawOtel = String(
  import.meta.env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT || "",
).trim();

export const FLOWOPS_ENV = rawEnv || "development";

/**
 * Backend HTTP API base URL, including the `/api/v1` suffix.
 *
 * - Absolute URL via `VITE_API_URL` (e.g. https://api.example.com/api/v1) → used verbatim.
 * - Relative path (e.g. `/api/v1` for same-origin Docker-behind-nginx) → resolved
 *   against the browser's origin at RUNTIME, so calls hit the deployed host
 *   (app.flowop.work) instead of a baked-in localhost. This is the common
 *   production setup and the previous localhost fallback silently broke every
 *   direct `fetch(`${FLOWOPS_API_URL}...`)` caller in prod.
 * - Nothing configured → local dev backend (includes the /api/v1 prefix).
 */
function deriveApiUrl(): string {
  if (rawApiUrl && /^https?:\/\//i.test(rawApiUrl)) {
    return rawApiUrl.replace(/\/+$/, "");
  }
  if (rawApiUrl && rawApiUrl.startsWith("/")) {
    const path = rawApiUrl.replace(/\/+$/, "");
    if (
      typeof window !== "undefined" &&
      window.location?.origin &&
      window.location.origin !== "null"
    ) {
      return window.location.origin + path;
    }
    return path; // SSR / no window — keep relative (still same-origin)
  }
  return "http://localhost:3000/api/v1";
}
export const FLOWOPS_API_URL = deriveApiUrl();

/** Origin without the `/api` (or `/api/v1`) suffix — uploads, PDFs, asset URLs, /admin. */
export const FLOWOPS_HTTP_ORIGIN = FLOWOPS_API_URL.replace(/\/api(\/v\d+)?\/?$/, "");

/** Base URL for Socket.IO — EventsGateway uses the default `/` namespace. */
// When VITE_API_URL is a relative path (e.g. `/api/v1` in Docker-behind-nginx
// deployments), we can't derive the WebSocket origin at build time. Instead,
// fall back to `window.location.origin` at runtime — which is always correct
// for same-origin deployments (e.g. https://app.flowop.work).
function deriveWsOrigin(): string {
  if (rawWs && /^https?:\/\//i.test(rawWs)) {
    return rawWs.replace(/\/+$/, "");
  }
  // If FLOWOPS_HTTP_ORIGIN resolved to a real non-localhost URL, use it.
  if (FLOWOPS_HTTP_ORIGIN && !/localhost/.test(FLOWOPS_HTTP_ORIGIN)) {
    return FLOWOPS_HTTP_ORIGIN;
  }
  // API URL was relative — derive origin from the browser's current URL.
  if (typeof window !== "undefined" && window.location.origin !== "null") {
    return window.location.origin;
  }
  return "http://localhost:3000";
}
export const FLOWOPS_WS_ORIGIN = deriveWsOrigin();

/**
 * Optional Ollama (local LLM) endpoint for the AI copilot dev panel.
 *
 * Empty by default. Consumers MUST treat an empty string as "feature
 * disabled" — never fall back to `http://localhost:11434` at the call
 * site, because that ships a developer's machine URL into production
 * builds.
 */
export const FLOWOPS_OLLAMA_URL =
  rawOllama && /^https?:\/\//i.test(rawOllama)
    ? rawOllama.replace(/\/+$/, "")
    : "";

/**
 * OpenTelemetry OTLP HTTP traces endpoint. Default is the canonical local
 * collector port (`http://localhost:4318/v1/traces`) which matches the
 * `docker-compose.otel.yml` stack at the repo root. Override with
 * `VITE_OTEL_EXPORTER_OTLP_ENDPOINT` in any non-local environment.
 */
export const FLOWOPS_OTEL_TRACES_URL =
  rawOtel && /^https?:\/\//i.test(rawOtel)
    ? rawOtel
    : "http://localhost:4318/v1/traces";

export const IS_PRODUCTION = FLOWOPS_ENV === "production";
