import { describe, it, expect, beforeEach } from 'vitest';
import {
  getToken, setToken, setMemoryToken,
  getLoginMode, setLoginMode, clearAuth,
  isOwnerMode, isTenantMode, isDriverMode,
} from '../api/client';

describe('Auth Flow Integration', () => {
  beforeEach(() => { localStorage.clear(); clearAuth(); });

  it('tenant login/logout cycle', () => {
    setToken('tenant-jwt');
    setLoginMode('tenant');
    expect(getToken()).toBe('tenant-jwt');
    expect(isTenantMode()).toBe(true);
    clearAuth();
    expect(getToken()).toBeNull();
  });

  it('owner login/logout cycle', () => {
    setToken('owner-jwt');
    setLoginMode('owner');
    expect(isOwnerMode()).toBe(true);
    clearAuth();
    expect(getToken()).toBeNull();
  });

  it('driver uses memory token only', () => {
    setMemoryToken('driver-jwt');
    setLoginMode('driver');
    expect(getToken()).toBe('driver-jwt');
    expect(isDriverMode()).toBe(true);
    expect(localStorage.getItem('access_token')).toBeNull();
    clearAuth();
    expect(getToken()).toBeNull();
  });

  it('token refresh keeps mode', () => {
    setToken('old-jwt');
    setLoginMode('owner');
    setToken('new-jwt');
    expect(getToken()).toBe('new-jwt');
    expect(isOwnerMode()).toBe(true);
  });

  it('session survives memory loss (page refresh)', () => {
    setToken('persistent-jwt');
    setLoginMode('tenant');
    setMemoryToken(null);
    expect(getToken()).toBe('persistent-jwt');
    expect(getLoginMode()).toBe('tenant');
  });
});
