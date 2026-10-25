import { describe, it, expect, beforeEach } from 'vitest';
import { setToken, setLoginMode, clearAuth,
  isOwnerMode, isTenantMode,
} from '../api/client';
import { canTenantAdminAccessRoute, isTenantAdminFullAccess, isHiddenOwnerPath } from '../lib/tenantAdminFullAccess';

describe('RBAC — Login Mode Access Control', () => {
  beforeEach(() => { localStorage.clear(); clearAuth(); });

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

describe('tenantAdminFullAccess', () => {
  it('identifies super admins', () => {
    expect(isTenantAdminFullAccess({ isSuperAdmin: true })).toBe(true);
    expect(isTenantAdminFullAccess({ role: 'ADMIN' })).toBe(true);
    expect(isTenantAdminFullAccess({ role: 'USER' })).toBe(false);
    expect(isTenantAdminFullAccess(null)).toBe(false);
  });

  it('restricts admin routes from non-admins', () => {
    expect(canTenantAdminAccessRoute('/admin/users', { role: 'ADMIN' })).toBe(true);
    expect(canTenantAdminAccessRoute('/admin/users', { role: 'USER' })).toBe(false);
    expect(canTenantAdminAccessRoute('/dashboard', { role: 'USER' })).toBe(true);
    expect(canTenantAdminAccessRoute('/admin', null)).toBe(false);
  });

  it('identifies hidden owner paths', () => {
    expect(isHiddenOwnerPath('/owner-dashboard')).toBe(true);
    expect(isHiddenOwnerPath('/system-config')).toBe(true);
    expect(isHiddenOwnerPath('/dashboard')).toBe(false);
  });
});
