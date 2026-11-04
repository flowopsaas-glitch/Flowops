import { describe, it, expect } from 'vitest';
import {
  buildFullTenantNavPermissions,
  buildRoleDefaultTenantNavPermissions,
  normalizeTenantNavPermissions,
  ALL_TENANT_NAV_PERMISSION_KEYS,
  TENANT_NAV_PERMISSION_LABELS,
  canSignRailHandshake,
  getRailAccessLevel,
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
    expect(p.driverDispatch).toBe(false);
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

describe('transactionLog — matches the roles the API accepts', () => {
  /**
   * The audit trail controller is @Roles(ADMIN, COMPANY_ADMIN, MANAGER,
   * DISPATCH, WAREHOUSE). The nav matrix has to agree in BOTH directions: a
   * role granted the key but rejected by the API gets a visible link that
   * 403s, and a role denied the key but accepted by the API can never reach a
   * page it is entitled to. Neither failure is visible in a unit test of one
   * layer alone, so it is asserted here.
   */
  const API_ROLES = ['ADMIN', 'COMPANY_ADMIN', 'MANAGER', 'DISPATCH', 'WAREHOUSE'];
  const API_DENIED = ['DRIVER', 'VIEWER'];

  it('grants it to every role the API accepts', () => {
    for (const role of API_ROLES) {
      expect(buildRoleDefaultTenantNavPermissions(role).transactionLog, role).toBe(true);
    }
  });

  it('denies it to every role the API rejects', () => {
    for (const role of API_DENIED) {
      expect(buildRoleDefaultTenantNavPermissions(role).transactionLog, role).toBe(false);
    }
  });

  it('is denied to an unknown role rather than defaulting open', () => {
    expect(buildRoleDefaultTenantNavPermissions('SOMETHING_ELSE').transactionLog).toBe(false);
    expect(buildRoleDefaultTenantNavPermissions(undefined).transactionLog).toBe(false);
  });

  it('is a real nav key with a label, so it can be overridden per user', () => {
    expect(ALL_TENANT_NAV_PERMISSION_KEYS).toContain('transactionLog');
    expect(TENANT_NAV_PERMISSION_LABELS.transactionLog).toBe('Transaction Log');
    const normalized = normalizeTenantNavPermissions({ transactionLog: false }, 'MANAGER');
    expect(normalized.transactionLog).toBe(false);
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

describe('rail + railHandshake permission keys', () => {
  it('are registered keys with a label', () => {
    for (const key of ['rail', 'railHandshake'] as const) {
      expect(ALL_TENANT_NAV_PERMISSION_KEYS).toContain(key);
      expect(TENANT_NAV_PERMISSION_LABELS[key]).toBeTruthy();
    }
  });

  it('are granted by the full permission set', () => {
    const full = buildFullTenantNavPermissions();
    expect(full.rail).toBe(true);
    expect(full.railHandshake).toBe(true);
  });

  it.each([
    // role,           rail,  railHandshake
    ['ADMIN', true, true],
    ['COMPANY_ADMIN', true, true],
    ['TENANT_ADMIN', true, true],
    ['MANAGER', true, true],
    ['DISPATCH', true, true],
    ['OPS_CLERK', true, true],
    ['VIEWER', true, true], // visible, read-only (see getRailAccessLevel)
    ['DRIVER', false, false],
    ['WAREHOUSE', false, false],
    ['AGENT', false, false],
    ['USER', false, false],
    ['', false, false],
    ['SOMETHING_ELSE', false, false],
  ])('role %s → rail:%s railHandshake:%s', (role, rail, railHandshake) => {
    const p = buildRoleDefaultTenantNavPermissions(role);
    expect(p.rail).toBe(rail);
    expect(p.railHandshake).toBe(railHandshake);
  });

  it('OPS_CLERK is treated exactly like DISPATCH (the role does not exist on the API yet)', () => {
    expect(buildRoleDefaultTenantNavPermissions('OPS_CLERK')).toEqual(buildRoleDefaultTenantNavPermissions('DISPATCH'));
    expect(buildRoleDefaultTenantNavPermissions(' ops_clerk ')).toEqual(buildRoleDefaultTenantNavPermissions('DISPATCH'));
  });

  it('adding the keys did not change any pre-existing grant', () => {
    // spot-check the roles whose other keys the older tests do not pin
    const viewer = buildRoleDefaultTenantNavPermissions('VIEWER');
    expect(viewer.invoices).toBe(true);
    expect(viewer.shipments).toBe(false);
    const warehouse = buildRoleDefaultTenantNavPermissions('WAREHOUSE');
    expect(warehouse.risksExceptions).toBe(true);
    expect(warehouse.invoices).toBe(false);
  });

  it('an explicit per-user override wins over the role default, both ways', () => {
    expect(normalizeTenantNavPermissions({ rail: true, railHandshake: true }, 'DRIVER').rail).toBe(true);
    expect(normalizeTenantNavPermissions({ rail: false }, 'ADMIN').rail).toBe(false);
    expect(normalizeTenantNavPermissions({ rail: false }, 'ADMIN').railHandshake).toBe(true); // independent keys
  });
});

describe('getRailAccessLevel — visible vs read-only vs hidden', () => {
  it.each([
    ['ADMIN', 'FULL'],
    ['COMPANY_ADMIN', 'FULL'],
    ['MANAGER', 'FULL'],
    ['DISPATCH', 'FULL'],
    ['OPS_CLERK', 'FULL'],
    ['VIEWER', 'READ_ONLY'],
    ['DRIVER', 'NONE'],
    ['WAREHOUSE', 'NONE'],
    [undefined, 'NONE'],
  ])('%s → %s', (role, level) => {
    expect(getRailAccessLevel(role as string | undefined)).toBe(level);
  });

  it('a VIEWER with Rail revoked sees nothing; revoking only one key keeps the other page', () => {
    expect(getRailAccessLevel('VIEWER', { rail: false, railHandshake: false })).toBe('NONE');
    expect(getRailAccessLevel('VIEWER', { rail: false })).toBe('READ_ONLY');
  });

  it('granting Rail to a DRIVER makes it visible but only READ_ONLY — the role still cannot write', () => {
    expect(getRailAccessLevel('DRIVER', { rail: true })).toBe('READ_ONLY');
  });
});

describe('canSignRailHandshake — authorised representatives only', () => {
  it.each([
    ['ADMIN', true], ['COMPANY_ADMIN', true], ['TENANT_ADMIN', true], ['MANAGER', true],
    ['DISPATCH', false], ['OPS_CLERK', false], ['VIEWER', false], ['DRIVER', false], ['WAREHOUSE', false], [undefined, false],
  ])('%s → %s', (role, expected) => {
    expect(canSignRailHandshake(role as string | undefined)).toBe(expected);
  });
});
