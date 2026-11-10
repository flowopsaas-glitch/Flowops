import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { UserRole } from '@prisma/client';
import { RAIL_READ_ROLES, RAIL_WRITE_ROLES, RAIL_SIGNATORY_ROLES, RAIL_WINDOW_CHANGE_ROLES } from './rail-roles';

/**
 * The frontend names roles as raw strings; the backend has them as a Prisma
 * enum. Nothing links the two, so a role can be invented on one side and
 * silently never match on the other.
 *
 * That has already happened. `frontend/src/lib/tenantUserPermissions.ts`
 * lists SUPER_ADMIN, ULTIMATE_OWNER, TENANT_ADMIN and OPS_CLERK in its rail
 * write set. None of them is a value of `enum UserRole`, so none can ever be
 * issued by the API. OPS_CLERK is a deliberate deferral - adding it needs
 * `ALTER TYPE ... ADD VALUE`, which the zero-migration wave excluded - and
 * rail-roles.ts says so. The other three are simply phantoms.
 *
 * Phantom roles fail closed, so this is NOT a security hole: no one is
 * granted a permission they should not have. It is a drift hazard. Someone
 * reading that list would reasonably conclude the platform has a SUPER_ADMIN
 * role, and build on it.
 *
 * These tests do not fix the drift by inventing the roles - that is a schema
 * decision for the owner. They make the drift visible and stop it growing.
 */

const FRONTEND_PERMS = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'frontend',
  'src',
  'lib',
  'tenantUserPermissions.ts',
);

const REAL_ROLES = new Set<string>(Object.values(UserRole));

/** Pull the string literals out of a `new Set([...])` in the frontend file. */
function rolesInFrontendSet(setName: string): string[] {
  const src = fs.readFileSync(FRONTEND_PERMS, 'utf8');
  const re = new RegExp(`const ${setName} = new Set\\(\\[([\\s\\S]*?)\\]\\)`, 'm');
  const m = src.match(re);
  if (!m) throw new Error(`could not find ${setName} in tenantUserPermissions.ts`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

describe('rail roles: backend sets use only real enum values', () => {
  it('every backend role list is a subset of the UserRole enum', () => {
    const lists = {
      RAIL_READ_ROLES,
      RAIL_WRITE_ROLES,
      RAIL_SIGNATORY_ROLES,
      RAIL_WINDOW_CHANGE_ROLES,
    };
    for (const list of Object.values(lists)) {
      for (const role of list) {
        expect(REAL_ROLES.has(role as string)).toBe(true);
      }
      expect(list.length).toBeGreaterThan(0);
    }
  });

  it('signatory is strictly narrower than write, which is narrower than read', () => {
    // A signatory is an authorised representative making a formal commitment.
    // Dispatch may write rail data but must not sign on the tenant's behalf.
    for (const r of RAIL_SIGNATORY_ROLES) {
      expect(RAIL_WRITE_ROLES).toContain(r);
    }
    for (const r of RAIL_WRITE_ROLES) {
      expect(RAIL_READ_ROLES).toContain(r);
    }
    expect(RAIL_SIGNATORY_ROLES).not.toContain(UserRole.DISPATCH as any);
    expect(RAIL_WRITE_ROLES).toContain(UserRole.DISPATCH);
  });

  it('VIEWER can read rail but never write, sign or move a window', () => {
    expect(RAIL_READ_ROLES).toContain(UserRole.VIEWER);
    expect(RAIL_WRITE_ROLES).not.toContain(UserRole.VIEWER as any);
    expect(RAIL_SIGNATORY_ROLES).not.toContain(UserRole.VIEWER as any);
    expect(RAIL_WINDOW_CHANGE_ROLES).not.toContain(UserRole.VIEWER as any);
  });

  it('window-change authority is not simply rail write', () => {
    // A dispatcher on the haulier side may write rail data but must not
    // re-time the terminal's gate. If these two sets are ever made equal,
    // that rule has been lost.
    expect(RAIL_WINDOW_CHANGE_ROLES).not.toContain(UserRole.DISPATCH);
    expect(RAIL_WRITE_ROLES).toContain(UserRole.DISPATCH);
  });
});

describe('rail roles: frontend does not invent roles', () => {
  it('every role named in the frontend rail write set is a real UserRole', () => {
    const named = rolesInFrontendSet('RAIL_WRITE_ROLES');
    const phantoms = named.filter((r) => !REAL_ROLES.has(r));

    // Documented, deliberate deferral vs. accidental invention. Both fail the
    // build today; the message says which is which so the fix is obvious.
    expect({
      phantoms,
      note:
        phantoms.length === 0
          ? 'all frontend-named roles exist in enum UserRole'
          : 'these are named in the frontend but cannot be issued by the API. ' +
            'Either add them to enum UserRole (schema migration) or remove them.',
    }).toEqual({
      phantoms: [],
      note: 'all frontend-named roles exist in enum UserRole',
    });
  });

  it('every role named in the frontend rail signatory set is a real UserRole', () => {
    const named = rolesInFrontendSet('RAIL_SIGNATORY_ROLES');
    const phantoms = named.filter((r) => !REAL_ROLES.has(r));
    expect(phantoms).toEqual([]);
  });
});
