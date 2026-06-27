/**
 * Centralised browser-storage layer for the FlowOps frontend session.
 *
 * Before this module landed, the codebase wrote auth state to **23 distinct**
 * `localStorage` keys (`access_token`, `accessToken`, `token`, `jwt`,
 * `flowops_owner_token`, `flowops.owner.accessToken`, ...). Logout in one
 * place would not clear the others, refreshes were inconsistent, and there
 * was no way to know which key the next reader would pick.
 *
 * This module collapses the world to **three canonical keys**:
 *
 *   flowops.access_token   — bearer JWT for API calls
 *   flowops.login_mode     — "tenant" | "owner" | "driver"
 *   flowops.user           — JSON-serialised user record (cached for fast boot)
 *
 * Every consumer in `frontend/src/` that touches auth state should import
 * from here. Direct `localStorage.getItem("token")` or
 * `localStorage.setItem("flowops_owner_token", ...)` calls outside this
 * module are a regression — flag them in review.
 *
 * Read-through migration: getters check the canonical key first, then fall
 * back to the legacy keys; on the first hit they copy to canonical and
 * remove every legacy key. So existing browsers with stale storage migrate
 * transparently on the first read, then the legacy keys never come back.
 */

export type LoginMode = "tenant" | "owner" | "driver";

const ACCESS_TOKEN_KEY = "flowops.access_token";
const REFRESH_TOKEN_KEY = "flowops.refresh_token";
const LOGIN_MODE_KEY = "flowops.login_mode";
const USER_KEY = "flowops.user";

/** Legacy keys we migrate FROM on read. Anything found here gets copied into the canonical key and the legacy entry removed. */
const LEGACY_TOKEN_KEYS = [
  "access_token",
  "accessToken",
  "token",
  "jwt",
  "authToken",
  "flowops_token",
  "flowops_owner_token",
  "flowops.owner.accessToken",
  "flowops_owner_access_token",
  "ownerAccessToken",
  "driverToken",
] as const;

const LEGACY_MODE_KEYS = ["login_mode", "flowops_login_mode"] as const;

const LEGACY_USER_KEYS = [
  "user",
  "flowops_user",
  "flowops.owner.user",
  "flowops_owner_profile",
  "driverInfo",
] as const;

/** Boolean / JSON-blob keys we just remove on `clearSession()` because nothing should be reading them anyway. */
const LEGACY_AUX_KEYS = ["isLoggedIn", "session", "auth"] as const;

/**
 * Memory-resident copy of the access token. Set by API clients during silent
 * refresh so the next request can use the new token before it round-trips
 * through localStorage. Also lets driver mode keep the token in memory only
 * if a deployment chooses to.
 */
let memoryToken: string | null = null;

function safeRead(key: string): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {
    /* private mode / quota exceeded — silently degrade */
  }
}

function safeRemove(key: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function removeAllLegacyTokenKeys(): void {
  for (const key of LEGACY_TOKEN_KEYS) safeRemove(key);
}

function removeAllLegacyModeKeys(): void {
  for (const key of LEGACY_MODE_KEYS) safeRemove(key);
}

function removeAllLegacyUserKeys(): void {
  for (const key of LEGACY_USER_KEYS) safeRemove(key);
}

function isLoginMode(value: string | null | undefined): value is LoginMode {
  return value === "tenant" || value === "owner" || value === "driver";
}

// ─────────────────────────────────────────────────────────────────────────
// Access token
// ─────────────────────────────────────────────────────────────────────────

export function getAccessToken(): string | null {
  if (memoryToken) return memoryToken;

  const canonical = safeRead(ACCESS_TOKEN_KEY);
  if (canonical) return canonical;

  for (const key of LEGACY_TOKEN_KEYS) {
    const value = safeRead(key);
    if (value) {
      // Sticky migration: write canonical, remove legacy.
      safeWrite(ACCESS_TOKEN_KEY, value);
      removeAllLegacyTokenKeys();
      return value;
    }
  }

  return null;
}

export function setAccessToken(token: string | null | undefined): void {
  const trimmed = (token ?? "").trim();
  if (!trimmed) {
    clearAccessToken();
    return;
  }
  safeWrite(ACCESS_TOKEN_KEY, trimmed);
  memoryToken = trimmed;
  removeAllLegacyTokenKeys();
}

export function clearAccessToken(): void {
  memoryToken = null;
  safeRemove(ACCESS_TOKEN_KEY);
  removeAllLegacyTokenKeys();
}

/**
 * Memory-only token setter. Used by API clients during silent refresh so the
 * in-flight request can use the fresh token without a localStorage round
 * trip. Pass `null` to clear the in-memory cache while leaving localStorage
 * intact.
 */
export function setMemoryToken(token: string | null): void {
  memoryToken = token;
}

// ─────────────────────────────────────────────────────────────────────────
// Refresh token
//
// Persisted so the API client can perform a silent token refresh (the backend
// /auth/refresh endpoint rotates and returns a new pair). Used by tenant and
// SSO sessions alike — both are issued real RefreshToken rows server-side.
// ─────────────────────────────────────────────────────────────────────────

export function getRefreshToken(): string | null {
  return safeRead(REFRESH_TOKEN_KEY);
}

export function setRefreshToken(token: string | null | undefined): void {
  const trimmed = (token ?? "").trim();
  if (!trimmed) {
    clearRefreshToken();
    return;
  }
  safeWrite(REFRESH_TOKEN_KEY, trimmed);
}

export function clearRefreshToken(): void {
  safeRemove(REFRESH_TOKEN_KEY);
}

// ─────────────────────────────────────────────────────────────────────────
// Login mode
// ─────────────────────────────────────────────────────────────────────────

const DEFAULT_LOGIN_MODE: LoginMode = "tenant";

export function getLoginMode(): LoginMode {
  const canonical = safeRead(LOGIN_MODE_KEY);
  if (isLoginMode(canonical)) return canonical;

  for (const key of LEGACY_MODE_KEYS) {
    const value = safeRead(key);
    if (isLoginMode(value)) {
      safeWrite(LOGIN_MODE_KEY, value);
      removeAllLegacyModeKeys();
      return value;
    }
  }

  return DEFAULT_LOGIN_MODE;
}

export function setLoginMode(mode: LoginMode): void {
  safeWrite(LOGIN_MODE_KEY, mode);
  removeAllLegacyModeKeys();
}

export function clearLoginMode(): void {
  safeRemove(LOGIN_MODE_KEY);
  removeAllLegacyModeKeys();
}

export const isTenantMode = (): boolean => getLoginMode() === "tenant";
export const isOwnerMode = (): boolean => getLoginMode() === "owner";
export const isDriverMode = (): boolean => getLoginMode() === "driver";

// ─────────────────────────────────────────────────────────────────────────
// Cached user record
// ─────────────────────────────────────────────────────────────────────────

export function getStoredUser<T = unknown>(): T | null {
  const tryParse = (raw: string | null): T | null => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  };

  const canonical = tryParse(safeRead(USER_KEY));
  if (canonical) return canonical;

  for (const key of LEGACY_USER_KEYS) {
    const raw = safeRead(key);
    const parsed = tryParse(raw);
    if (parsed) {
      // Migrate the raw JSON string verbatim so a subsequent JSON.parse
      // round trip doesn't change shape.
      if (raw) safeWrite(USER_KEY, raw);
      removeAllLegacyUserKeys();
      return parsed;
    }
  }

  return null;
}

export function setStoredUser<T>(user: T): void {
  try {
    safeWrite(USER_KEY, JSON.stringify(user));
  } catch {
    /* circular structure or similar — drop */
  }
  removeAllLegacyUserKeys();
}

export function clearStoredUser(): void {
  safeRemove(USER_KEY);
  removeAllLegacyUserKeys();
}

// ─────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────

/** Atomic logout: clear the access token, login mode, cached user, and any leftover legacy aux keys. */
export function clearSession(): void {
  clearAccessToken();
  clearRefreshToken();
  clearLoginMode();
  clearStoredUser();
  for (const key of LEGACY_AUX_KEYS) safeRemove(key);
}

/** Cheap predicate the route guards / boot logic can use without round-tripping JSON. */
export function hasSession(): boolean {
  return Boolean(getAccessToken());
}

/** Test-only helper. Resets the in-memory cache without touching storage; storage cleanup is the test's responsibility. */
export function __resetMemoryTokenForTests(): void {
  memoryToken = null;
}
