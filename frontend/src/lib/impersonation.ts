// Owner "view-as-tenant" impersonation helpers.
//
// When an owner impersonates a tenant we back up the owner's own session, then
// swap in the short-lived tenant token so the whole app behaves exactly as that
// tenant. Exiting restores the owner session. The backup lives under its own
// key so a normal logout/clearSession still wipes everything.

import {
  getAccessToken,
  getLoginMode,
  setAccessToken,
  setLoginMode,
  type LoginMode,
} from "./session";

const BACKUP_KEY = "flowops.impersonation";

type ImpersonationBackup = {
  ownerToken: string;
  ownerMode: string;
  tenantName: string;
  startedAt: string;
};

function safeGet(): ImpersonationBackup | null {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    return raw ? (JSON.parse(raw) as ImpersonationBackup) : null;
  } catch {
    return null;
  }
}

/** Back up the owner session and switch into the tenant token. */
export function startImpersonation(tenantToken: string, tenantName: string) {
  const ownerToken = getAccessToken();
  if (!ownerToken) return;
  const backup: ImpersonationBackup = {
    ownerToken,
    ownerMode: getLoginMode() || "owner",
    tenantName,
    startedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
  } catch {
    /* ignore quota */
  }
  setAccessToken(tenantToken);
  setLoginMode("tenant");
}

export function isImpersonating(): boolean {
  return safeGet() !== null;
}

export function impersonatedTenantName(): string | null {
  return safeGet()?.tenantName ?? null;
}

/** Restore the owner session and clear the impersonation backup. */
export function exitImpersonation() {
  const backup = safeGet();
  try {
    localStorage.removeItem(BACKUP_KEY);
  } catch {
    /* ignore */
  }
  if (backup) {
    setAccessToken(backup.ownerToken);
    setLoginMode(((backup.ownerMode || "owner") as LoginMode));
  }
}
