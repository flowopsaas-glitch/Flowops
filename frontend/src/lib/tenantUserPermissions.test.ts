import { describe, it, expect } from 'vitest';
import {
  buildFullTenantNavPermissions,
  buildRoleDefaultTenantNavPermissions,
  normalizeTenantNavPermissions,
  ALL_TENANT_NAV_PERMISSION_KEYS,
} from './tenantUserPermissions';

describe('buildFullTenantNavPermissions', () => {
  it('grants every nav key', () => {
    const full = buildFullTenantNavPermissions();
    for (const key of ALL_TENANT_NAV_PERMISSION_KEYS) {
      expect(full[key]).toBe(true);
    }
  });
});

describe('buildRoleDefaultTenantNavPermissions', () => {
  it('gives admin-type roles full access', () => {
    for (const role of ['ADMIN', 'COMPANY_ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN', 'ULTIMATE_OWNER']) {
      const p = buildRoleDefaultTenantNavPermissions(role);
      expect(p.settings).toBe(true);
      expect(p.usersRoles).toBe(true);
      expect(p.invoices).toBe(true);
    }
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(buildRoleDefaultTenantNavPermissions('  admin ')).toEqual(
      buildRoleDefaultTenantNavPermissions('ADMIN'),
    );
  });

  it('MANAGER sees billing but not user admin or settings', () => {
    const p = buildRoleDefaultTenantNavPermissions('MANAGER');
    expect(p.invoices).toBe(true);
    expect(p.creditControl).toBe(true);
    expect(p.usersRoles).toBe(false);
    expect(p.settings).toBe(false);
  });

  it('WAREHOUSE clerk sees ops/POD but no finance, collections or dispatch', () => {
    const p = buildRoleDefaultTenantNavPermissions('WAREHOUSE');
    expect(p.podDeliveries).toBe(true);
    expect(p.waybillInbox).toBe(true);
    expect(p.risksExceptions).toBe(true);
    expect(p.collections).toBe(false);
    expect(p.driverDispatch).toBe(false);
    expect(p.invoices).toBe(false);
    expect(p.settings).toBe(false);
  });

  it('DISPATCH sees ops + collections but no finance/billing', () => {
    const p = buildRoleDefaultTenantNavPermissions('DISPATCH');
    expect(p.driverDispatch).toBe(true);
    expect(p.collections).toBe(true);
    expect(p.invoices).toBe(false);
    expect(p.rateCards).toBe(false);
    expect(p.usersRoles).toBe(false);
  });

  it('DRIVER gets a focused field set', () => {
    const p = buildRoleDefaultTenantNavPermissions('DRIVER');
    expect(p.podDeliveries).toBe(true);
    expect(p.driverDispatch).toBe(true);
    expect(p.invoices).toBe(false);
    expect(p.usersRoles).toBe(false);
  });

  it('unknown / empty role falls back to the restricted default set', () => {
    const p = buildRoleDefaultTenantNavPermissions('SOMETHING_ELSE');
    expect(p.dashboard).toBe(true);
    expect(p.collections).toBe(false);
    expect(p.invoices).toBe(false);
    expect(p.usersRoles).toBe(false);
    expect(p.settings).toBe(false);
    // same as passing no role at all
    expect(buildRoleDefaultTenantNavPermissions()).toEqual(p);
  });
});

describe('normalizeTenantNavPermissions', () => {
  it('returns the role default when incoming is not an object', () => {
    const base = buildRoleDefaultTenantNavPermissions('MANAGER');
    expect(normalizeTenantNavPermissions(null, 'MANAGER')).toEqual(base);
    expect(normalizeTenantNavPermissions('nope', 'MANAGER')).toEqual(base);
    expect(normalizeTenantNavPermissions(42, 'MANAGER')).toEqual(base);
  });

  it('applies explicit boolean overrides on top of the role default', () => {
    // MANAGER defaults settings:false — an explicit grant should win.
    const p = normalizeTenantNavPermissions({ settings: true }, 'MANAGER');
    expect(p.settings).toBe(true);
    // unrelated keys keep the role default
    expect(p.usersRoles).toBe(false);
  });

  it('respects an explicit revocation (false) over a permissive default', () => {
    const p = normalizeTenantNavPermissions({ invoices: false }, 'ADMIN');
    expect(p.invoices).toBe(false);
    expect(p.settings).toBe(true);
  });

  it('ignores non-boolean values in the incoming object', () => {
    const base = buildRoleDefaultTenantNavPermissions('WAREHOUSE');
    const p = normalizeTenantNavPermissions({ collections: 'yes', invoices: 1 }, 'WAREHOUSE');
    expect(p.collections).toBe(base.collections);
    expect(p.invoices).toBe(base.invoices);
  });
});
