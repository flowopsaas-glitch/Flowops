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
 * Backend HTTP API base URL, including the `/api` suffix.
 *
 * In production this should be set to an absolute https URL via
 * `VITE_API_URL`. The `localhost` fallback exists only so that running
 * `npm run dev` against a local backend works without configuration —
 * production builds without `VITE_API_URL` set will still emit this
 * fallback, which is intentionally easy to spot in DevTools.
 */
export const FLOWOPS_API_URL =
  rawApiUrl && /^https?:\/\//i.test(rawApiUrl)
    ? rawApiUrl.replace(/\/+$/, "")
    : "http://localhost:3000/api";

/** Origin without `/api` — uploads, PDFs, asset URLs, /admin, /auth/logout. */
export const FLOWOPS_HTTP_ORIGIN = FLOWOPS_API_URL.replace(/\/api\/?$/, "");

/** Base URL for Socket.IO (Nest `/broadcast`, `/tracking-dashboard`, etc.). */
export const FLOWOPS_WS_ORIGIN =
  rawWs && /^https?:\/\//i.test(rawWs)
    ? rawWs.replace(/\/+$/, "")
    : FLOWOPS_HTTP_ORIGIN;

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
