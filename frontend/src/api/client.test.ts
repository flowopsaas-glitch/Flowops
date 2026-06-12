import { describe, it, expect, beforeEach } from 'vitest';
import {
  getToken,
  setToken,
  setMemoryToken,
  getLoginMode,
  setLoginMode,
  clearAuth,
  clearToken,
  clearClientSession,
  isOwnerMode,
  isTenantMode,
  isDriverMode,
  getApiBaseUrl,
  ApiError,
} from '../api/client';

describe('Token Management', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAuth();
  });

  it('returns null when no token set', () => {
    expect(getToken()).toBeNull();
  });

  it('stores token in localStorage under the canonical key', () => {
    setToken('test-jwt');
    expect(getToken()).toBe('test-jwt');
    // Canonical key from lib/session.ts. The legacy `access_token` key is
    // removed on write so it must NOT be set.
    expect(localStorage.getItem('flowops.access_token')).toBe('test-jwt');
    expect(localStorage.getItem('access_token')).toBeNull();
  });

  it('removes token on null', () => {
    setToken('test-jwt');
    setToken(null);
    expect(getToken()).toBeNull();
  });

  it('memory token takes priority', () => {
    setToken('local-token');
    setMemoryToken('memory-token');
    expect(getToken()).toBe('memory-token');
  });

  it('falls back to localStorage when memory null', () => {
    setToken('local-token');
    setMemoryToken(null);
    expect(getToken()).toBe('local-token');
  });
});

describe('Login Mode', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAuth();
  });

  it('defaults to tenant', () => {
    expect(getLoginMode()).toBe('tenant');
    expect(isTenantMode()).toBe(true);
  });

  it('persists mode change', () => {
    setLoginMode('owner');
    expect(getLoginMode()).toBe('owner');
    expect(isOwnerMode()).toBe(true);
  });

  it('detects driver mode', () => {
    setLoginMode('driver');
    expect(isDriverMode()).toBe(true);
    expect(isOwnerMode()).toBe(false);
  });
});

describe('clearAuth', () => {
  beforeEach(() => { localStorage.clear(); });

  it('clears all state', () => {
    setToken('token');
    setMemoryToken('mem');
    setLoginMode('owner');
    clearAuth();
    expect(getToken()).toBeNull();
    expect(getLoginMode()).toBe('tenant');
  });

  it('clearToken and clearClientSession are aliases', () => {
    setToken('t');
    clearToken();
    expect(getToken()).toBeNull();
    setToken('t2');
    clearClientSession();
    expect(getToken()).toBeNull();
  });
});

describe('ApiError', () => {
  it('has message and status', () => {
    const e = new ApiError('Not found', 404);
    expect(e.message).toBe('Not found');
    expect(e.status).toBe(404);
    expect(e).toBeInstanceOf(Error);
  });

  it('status optional', () => {
    const e = new ApiError('Fail');
    expect(e.status).toBeUndefined();
  });
});

describe('getApiBaseUrl', () => {
  it('returns non-empty string', () => {
    expect(typeof getApiBaseUrl()).toBe('string');
    expect(getApiBaseUrl().length).toBeGreaterThan(0);
  });
});
