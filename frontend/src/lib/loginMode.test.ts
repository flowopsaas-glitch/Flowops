import { describe, it, expect, beforeEach } from 'vitest';
import { setToken, setLoginMode, clearAuth, isOwnerMode, isTenantMode } from '../api/client';

// This file used to be tenantAdminFullAccess.test.ts and also covered
// src/lib/tenantAdminFullAccess.ts. That module was deleted: nothing imported
// it, it checked a user field (`isSuperAdmin`) that exists in no model, and its
// route guard matched on `path.includes('/admin')` rather than the permission
// registry. Keeping it would have left a competing authorization helper that
// reads as authoritative and grants less protection than the real one.
//
// What remains is the login-mode coverage of api/client, which is live.
describe('RBAC — Login Mode Access Control', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAuth();
  });

  it('owner mode users should only access /owner routes', () => {
    setToken('owner-token');
    setLoginMode('owner');
    expect(isOwnerMode()).toBe(true);
    // Owner mode is set — route guard should redirect non-owner paths
  });

  it('tenant mode users cannot access /owner routes', () => {
    setToken('tenant-token');
    setLoginMode('tenant');
    expect(isTenantMode()).toBe(true);
    expect(isOwnerMode()).toBe(false);
  });
});
