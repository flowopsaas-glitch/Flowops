/**
 * Route-level access control for ALL rail controllers: runs the REAL RolesGuard against each
 * handler's real @Roles metadata for every UserRole. Guards the three-tier model
 * (READ / WRITE / SIGNATORY) so a future edit cannot silently widen a route.
 */
import { ForbiddenException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { RailController } from './rail.controller';
import { RailHandshakeController } from './rail-handshake.controller';
import { RailSlotController } from './rail-slot.controller';
import { RAIL_READ_ROLES, RAIL_SIGNATORY_ROLES, RAIL_WRITE_ROLES } from './rail-roles';

const ALL_ROLES = Object.values(UserRole);
const CONTROLLERS = [RailController, RailHandshakeController, RailSlotController] as const;

/** Signatory-only handlers (formal commitments), by controller. */
const SIGNATORY_HANDLERS: Record<string, string[]> = {
  RailController: [],
  RailHandshakeController: ['signOff', 'resolveDeviation', 'lodgeDispute'],
  RailSlotController: ['submit', 'verifyDoc', 'revokeDoc'],
};

/**
 * POST routes that are nevertheless READ-ONLY: pure calculations that persist nothing and write no
 * audit entry, so a VIEWER may run them. Adding to this list is a deliberate decision.
 */
const READ_ONLY_POSTS: Record<string, string[]> = {
  RailController: [],
  RailHandshakeController: [],
  RailSlotController: ['envelopeCheck'],
};
const isReadOnly = (ctrl: { name: string }, handler: string, method: RequestMethod) =>
  method === RequestMethod.GET || READ_ONLY_POSTS[ctrl.name].includes(handler);

const allows = (proto: any, handler: string, role: UserRole): boolean => {
  const ctx: any = {
    getHandler: () => proto[handler],
    getClass: () => proto.constructor,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  };
  try { return new RolesGuard(new Reflector()).canActivate(ctx); } catch (e) {
    if (e instanceof ForbiddenException) return false;
    throw e;
  }
};

/** Every route handler: [controller, name, httpMethod]. */
const routes = CONTROLLERS.flatMap((ctrl) =>
  Object.getOwnPropertyNames(ctrl.prototype)
    .filter((n) => n !== 'constructor' && Reflect.hasMetadata(METHOD_METADATA, ctrl.prototype[n]))
    .map((n) => [ctrl, n, Reflect.getMetadata(METHOD_METADATA, ctrl.prototype[n]) as RequestMethod] as const),
);

describe('rail controllers — role matrix', () => {
  it('discovers a meaningful number of routes (the matrix is not vacuous)', () => {
    expect(routes.length).toBeGreaterThanOrEqual(45);
  });

  it('every controller uses RolesGuard', () => {
    for (const c of CONTROLLERS) expect(Reflect.getMetadata(GUARDS_METADATA, c)).toContain(RolesGuard);
  });

  it.each(routes.map((r) => [`${r[0].name}.${r[1]}`, r] as const))('%s', (_label, [ctrl, handler, method]) => {
    const signatory = SIGNATORY_HANDLERS[ctrl.name].includes(handler);
    const expected = signatory ? RAIL_SIGNATORY_ROLES : isReadOnly(ctrl, handler, method) ? RAIL_READ_ROLES : RAIL_WRITE_ROLES;
    for (const role of ALL_ROLES) {
      expect({ role, allowed: allows(ctrl.prototype, handler, role) }).toEqual({ role, allowed: expected.includes(role) });
    }
  });

  it('VIEWER can read but can never reach a route that changes anything', () => {
    for (const [ctrl, handler, method] of routes) {
      expect([`${ctrl.name}.${handler}`, allows(ctrl.prototype, handler, UserRole.VIEWER)]).toEqual([`${ctrl.name}.${handler}`, isReadOnly(ctrl, handler, method)]);
    }
  });

  it('DRIVER, WAREHOUSE, AGENT and USER are refused on every route', () => {
    for (const [ctrl, handler] of routes) {
      for (const role of [UserRole.DRIVER, UserRole.WAREHOUSE, UserRole.AGENT, UserRole.USER]) {
        expect(allows(ctrl.prototype, handler, role)).toBe(false);
      }
    }
  });

  it('DISPATCH can work the rail but is never a signatory', () => {
    for (const [ctrl, handler, method] of routes) {
      const signatory = SIGNATORY_HANDLERS[ctrl.name].includes(handler);
      expect(allows(ctrl.prototype, handler, UserRole.DISPATCH)).toBe(!signatory);
      void method;
    }
  });

  it('the handlers named in the exception lists really exist (so the exceptions cannot rot)', () => {
    for (const lists of [SIGNATORY_HANDLERS, READ_ONLY_POSTS]) {
      for (const [name, handlers] of Object.entries(lists)) {
        const ctrl = CONTROLLERS.find((c) => c.name === name)!;
        for (const h of handlers) expect(typeof ctrl.prototype[h]).toBe('function');
      }
    }
  });

  it('the only POST open to VIEWER is the side-effect-free envelope check', () => {
    const openPosts = routes
      .filter(([ctrl, handler, method]) => method === RequestMethod.POST && allows(ctrl.prototype, handler, UserRole.VIEWER))
      .map(([ctrl, handler]) => `${ctrl.name}.${handler}`);
    expect(openPosts).toEqual(['RailSlotController.envelopeCheck']);
  });

  it('role sets nest: signatory ⊂ write ⊂ read', () => {
    for (const r of RAIL_SIGNATORY_ROLES) expect(RAIL_WRITE_ROLES).toContain(r);
    for (const r of RAIL_WRITE_ROLES) expect(RAIL_READ_ROLES).toContain(r);
    expect(RAIL_READ_ROLES).toContain(UserRole.VIEWER);
    expect(RAIL_WRITE_ROLES).not.toContain(UserRole.VIEWER);
  });
});
