import { ForbiddenException } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { UserRole } from '@prisma/client';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { DriverPortalController } from '../driver-portal/driver-portal.controller';
import {
  assertWindowChangeAuthority, canChangeWindow,
  RAIL_WINDOW_CHANGE_ROLES, RAIL_WRITE_ROLES,
} from './rail-roles';
import { RailTruckAppointmentsController } from './rail-truck-appointments.controller';
import { RailTruckWindowChangesController } from './rail-truck-window-changes.controller';

/**
 * Who may move a published truck gate window — pinned down.
 *
 * The product has ONE tenant per deployment, and inside that tenant sit both the
 * terminal-side supervisors and the haulier's own dispatch desk. There is no
 * separate haulier tenant: a haulier OUTSIDE the tenant exists only as the
 * holder of an expiring share link. So "tenant + rail write" cannot be the
 * authority for moving a window — it would let the haulier side re-time the
 * terminal's gate, which is the one thing the terminal operator's rule forbids
 * ("terminal operators are the guide of the whole process").
 *
 * These tests are the negative half of that statement, and they are written
 * against the ROUTE TABLE and the role enum rather than against prose, so the
 * claim cannot drift:
 *
 *   1. an exhaustive walk of `UserRole` proving exactly three roles hold the
 *      permission, and that a role added later defaults to DENIED;
 *   2. the full route inventory of both rail controllers plus the driver portal,
 *      proving that no route reachable by a share-token holder or a driver
 *      session can publish, reschedule, cancel, replan or re-time anything;
 *   3. that every window-moving route requires a subset of the permitted roles,
 *      while read and acknowledge routes stay open to dispatch.
 */

/**
 * The driver-portal controller transitively imports AuthService, which imports
 * `bcrypt`'s native binding. This spec reads route METADATA only — it never
 * authenticates anybody — so the binding is stubbed. (On a workstation where
 * `npm ci` ran without `--ignore-scripts` the real module is present and this
 * stub is simply what jest resolves first; the assertions are identical either
 * way because they inspect decorators, not behaviour.)
 */
jest.mock('bcrypt', () => ({
  hash: jest.fn(), compare: jest.fn(), genSalt: jest.fn(), getRounds: jest.fn(),
}));

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'ALL'];

interface RouteFacts {
  handler: string;
  method: string;
  path: string;
  /** Roles on the handler, falling back to the class-level default. */
  roles: UserRole[] | null;
  isPublic: boolean;
  controller: string;
}

function routesOf(controller: any): RouteFacts[] {
  const basePath: string = Reflect.getMetadata(PATH_METADATA, controller) ?? '';
  const classRoles: UserRole[] | null = Reflect.getMetadata(ROLES_KEY, controller) ?? null;
  const name = controller.name as string;
  return Object.getOwnPropertyNames(controller.prototype)
    .filter((n) => n !== 'constructor')
    .map((n) => ({ handler: n, fn: controller.prototype[n] }))
    .filter(({ fn }) => typeof fn === 'function' && Reflect.getMetadata(PATH_METADATA, fn) !== undefined)
    .map(({ handler, fn }) => ({
      handler,
      method: HTTP_METHODS[Reflect.getMetadata(METHOD_METADATA, fn) as number] ?? 'UNKNOWN',
      path: `/${[basePath, Reflect.getMetadata(PATH_METADATA, fn) as string].filter(Boolean).join('/')}`
        .replace(/\/{2,}/g, '/'),
      roles: (Reflect.getMetadata(ROLES_KEY, fn) as UserRole[] | undefined) ?? classRoles,
      isPublic: Reflect.getMetadata(IS_PUBLIC_KEY, fn) === true,
      controller: name,
    }));
}

const APPOINTMENTS = routesOf(RailTruckAppointmentsController);
const CHANGES = routesOf(RailTruckWindowChangesController);
const PORTAL = routesOf(DriverPortalController);
const ALL = [...APPOINTMENTS, ...CHANGES, ...PORTAL];

/** Routes that MOVE a published window, by path + method. */
const WINDOW_MOVING_ROUTES = [
  'POST /rail/truck-appointments/:id/reschedule',
  'POST /rail/truck-appointments/:id/cancel',
  'POST /rail/truck-appointments/replan-day',
  'PUT /rail/truck-window-changes/gate-policies',
];

const byKey = (r: RouteFacts) => `${r.method} ${r.path}`;

describe('the window-change permission is a named, exhaustive role set', () => {
  it('is held by exactly ADMIN, COMPANY_ADMIN and MANAGER — the terminal-side authority', () => {
    expect(RAIL_WINDOW_CHANGE_ROLES).toEqual([
      UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    ]);
  });

  it('walks EVERY value of the UserRole enum and refuses the rest', () => {
    const permitted: string[] = [];
    const refused: string[] = [];
    for (const role of Object.values(UserRole)) {
      if (canChangeWindow(role)) permitted.push(String(role));
      else refused.push(String(role));
    }
    expect(permitted.sort()).toEqual(['ADMIN', 'COMPANY_ADMIN', 'MANAGER']);
    // Stated explicitly so the PR can quote it: these roles may read the board
    // and confirm a change, but they may not move a window.
    expect(refused.sort()).toEqual([
      'AGENT', 'DISPATCH', 'DRIVER', 'USER', 'VIEWER', 'WAREHOUSE',
    ]);
  });

  it('is narrower than rail write: DISPATCH can write rail data but cannot move a window', () => {
    expect(RAIL_WRITE_ROLES).toContain(UserRole.DISPATCH);
    expect(RAIL_WINDOW_CHANGE_ROLES).not.toContain(UserRole.DISPATCH);
    expect(canChangeWindow(UserRole.DISPATCH)).toBe(false);
    expect(canChangeWindow(UserRole.VIEWER)).toBe(false);
  });

  it('denies a role it has never seen, so a future enum value does not inherit the permission', () => {
    expect(canChangeWindow('OPS_CLERK' as UserRole)).toBe(false);
    expect(canChangeWindow('SUPERUSER' as UserRole)).toBe(false);
    expect(canChangeWindow(null)).toBe(false);
    expect(canChangeWindow(undefined)).toBe(false);
    expect(canChangeWindow('')).toBe(false);
  });

  it('refuses a call with no authenticated tenant user — the credential a share holder would have', () => {
    // A share token authenticates a READ and a CONFIRM. It carries no role and
    // no tenant user, so it cannot reach a window-moving code path at all.
    for (const actor of [null, undefined, {}, { role: null }]) {
      expect(() => assertWindowChangeAuthority(actor as any)).toThrow(ForbiddenException);
    }
    expect(() => assertWindowChangeAuthority(null)).toThrow(/authenticated user of the tenant/);
  });

  it('names the permitted roles in the refusal, so the operator knows who to ask', () => {
    try {
      assertWindowChangeAuthority({ role: UserRole.DISPATCH });
      throw new Error('expected a refusal');
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect((e as Error).message).toContain('ADMIN, COMPANY_ADMIN, MANAGER');
      expect((e as Error).message).toContain('DISPATCH');
      expect((e as Error).message).toMatch(/may read the acknowledgement board and confirm/);
    }
  });
});

describe('no route reachable by a share holder or a driver can move a window', () => {
  it('the ONLY public routes on the appointments controller are the token read and the token confirm', () => {
    const publicRoutes = APPOINTMENTS.filter((r) => r.isPublic).map(byKey).sort();
    expect(publicRoutes).toEqual([
      'GET /rail/truck-appointments/public/:token',
      'POST /rail/truck-appointments/public/:token/ack',
    ]);
  });

  it('the window-changes controller has NO public route at all', () => {
    expect(CHANGES.filter((r) => r.isPublic)).toEqual([]);
    // Every one of its routes therefore sits behind the tenant JWT + RolesGuard.
    expect(CHANGES.length).toBeGreaterThan(0);
    expect(CHANGES.every((r) => Array.isArray(r.roles) && r.roles.length > 0)).toBe(true);
  });

  it('the driver portal exposes exactly two gate-window routes: list and confirm', () => {
    const gate = PORTAL.filter((r) => r.path.includes('gate-windows')).map(byKey).sort();
    expect(gate).toEqual([
      'GET /driver-portal/gate-windows',
      'POST /driver-portal/gate-windows/:changeId/ack',
    ]);
  });

  it('no public or driver-session route can publish, reschedule, cancel, replan or re-time a window', () => {
    const forbiddenVerbs = /reschedule|replan|cancel|gate-policies|window-changes(?!\/:id\/ack)/i;
    const offenders = ALL
      .filter((r) => r.isPublic || r.controller === 'DriverPortalController')
      .filter((r) => r.method !== 'GET' && forbiddenVerbs.test(r.path))
      .map(byKey);
    // The single mutation a driver session may perform is confirming its own
    // window; everything else on this list would be a privilege escalation.
    expect(offenders).toEqual([]);
  });

  it('every window-moving route requires a subset of the permitted roles', () => {
    for (const key of WINDOW_MOVING_ROUTES) {
      const route = ALL.find((r) => byKey(r) === key);
      if (!route) throw new Error(`missing route ${key} in the inventory`);
      // `cancel` is the documented exception at ROUTE level: it stays rail-write
      // because cancelling a truck that is already ARRIVED or LOADING is not a
      // window change. The service enforces the window-change permission on the
      // BOOKED branch, which is the branch that publishes a version.
      if (key.endsWith('/cancel')) {
        expect(route.roles).toEqual(RAIL_WRITE_ROLES);
        continue;
      }
      expect(route.isPublic).toBe(false);
      expect(route.roles).toEqual(RAIL_WINDOW_CHANGE_ROLES);
      expect(route.roles!.every((role) => canChangeWindow(role))).toBe(true);
    }
  });

  it('reading the board and confirming a change stay open to dispatch — the split is about MOVING windows', () => {
    const board = CHANGES.find((r) => byKey(r) === 'GET /rail/truck-window-changes/board')!;
    const ack = CHANGES.find((r) => byKey(r) === 'POST /rail/truck-window-changes/:id/ack')!;
    expect(board.roles).toContain(UserRole.DISPATCH);
    expect(board.roles).toContain(UserRole.VIEWER);
    expect(ack.roles).toContain(UserRole.DISPATCH);
    expect(ack.roles!.some((role) => !canChangeWindow(role))).toBe(true);
  });

  it('acknowledging is the only mutation a token holder can perform, and it cannot target an arbitrary change', () => {
    const tokenAck = APPOINTMENTS.find((r) => byKey(r) === 'POST /rail/truck-appointments/public/:token/ack')!;
    expect(tokenAck.isPublic).toBe(true);
    // The credential is the token in the path; there is no body-supplied tenant,
    // appointment or recipient to spoof.
    expect(tokenAck.path).toContain(':token');
    expect(tokenAck.path).not.toContain(':id');
  });
});
