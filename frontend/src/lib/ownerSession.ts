import type { OwnerLoginResponse, OwnerUser } from './ownerApi';
import {
  clearSession,
  getAccessToken,
  getStoredUser,
  isOwnerMode,
  setAccessToken,
  setLoginMode,
  setStoredUser,
} from './session';

/**
 * Owner-session helpers now delegate to lib/session.ts. Previously this
 * module stored its own `flowops.owner.accessToken` / `flowops.owner.user`
 * keys in parallel to `api/owner.ts`'s `flowops_owner_token` /
 * `flowops_owner_profile` and to the standard access token. Three storage
 * layouts for the same session — anything that wrote to one didn't update
 * the others.
 *
 * Centralising on `lib/session.ts` collapses that to a single canonical
 * slot keyed by login mode. The exports here remain so existing call sites
 * keep working; they just route through the central module.
 */

export function setOwnerSession(session: OwnerLoginResponse) {
  setAccessToken(session.accessToken);
  setLoginMode('owner');
  setStoredUser(session.user);
}

export function clearOwnerSession() {
  clearSession();
}

export function getOwnerAccessToken(): string | null {
  return isOwnerMode() ? getAccessToken() : null;
}

export function getOwnerUser(): OwnerUser | null {
  return isOwnerMode() ? getStoredUser<OwnerUser>() : null;
}

export function hasOwnerSession(): boolean {
  return isOwnerMode() && Boolean(getAccessToken());
}
