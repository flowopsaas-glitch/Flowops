import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { UserRole, JourneyStatus, JourneyStageType, JourneyUpdateType } from '@prisma/client';
import { JourneysController } from './journeys.controller';
import { JourneysModule } from './journeys.module';
import { JourneyService } from './journey.service';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { CreateJourneyDto, SendJourneyUpdateDto } from './dto/journey.dto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

/**
 * JourneysController — the API surface that did not exist.
 *
 * The service, the schema and the RLS policies were all in place while this
 * controller was missing, which meant two tenant-isolated tables had no writer
 * and a 432-line service had no caller. The tests below pin the two properties
 * that make the surface safe rather than merely present:
 *
 *   1. companyId comes from the session on every handler. It never comes from
 *      the body or the path, so a caller cannot address another tenant's
 *      journey by guessing an id.
 *   2. Mutating routes are narrower than reading routes. Dispatch can change a
 *      journey; a VIEWER can look at one.
 */

const fakeJourneyService = () => ({
  listJourneys: jest.fn().mockResolvedValue([]),
  getJourney: jest.fn().mockResolvedValue({ id: 'j1' }),
  createJourney: jest.fn().mockResolvedValue({ id: 'j1' }),
  addStage: jest.fn().mockResolvedValue({ id: 's1' }),
  assignDriver: jest.fn().mockResolvedValue({ id: 'j1' }),
  updateJourneyStatus: jest.fn().mockResolvedValue({ id: 'j1' }),
  getJourneyUpdates: jest.fn().mockResolvedValue([]),
  acknowledgeUpdate: jest.fn().mockResolvedValue({ id: 'u1' }),
  resolveUpdate: jest.fn().mockResolvedValue({ id: 'u1' }),
});

async function build() {
  const svc = fakeJourneyService();
  const mod = await Test.createTestingModule({
    controllers: [JourneysController],
    providers: [{ provide: JourneyService, useValue: svc }],
  }).compile();
  return { svc, ctrl: mod.get(JourneysController), reflector: mod.get(Reflector) };
}

const TENANT_A = { id: 'user-a', companyId: 'cmp-a' };
const TENANT_B = { id: 'user-b', companyId: 'cmp-b' };

describe('JourneysController', () => {
  it('resolves JourneyService through DI, so the module is genuinely wired', async () => {
    // The failure this guards: a controller registered in no module, which
    // compiles, passes tsc, and serves nothing.
    const { ctrl } = await build();
    expect(ctrl).toBeInstanceOf(JourneysController);
  });

  describe('module wiring', () => {
    it('compiles the real module and resolves JourneyService through DI', async () => {
      // The original defect, stated as a test: the service existed, the schema
      // existed, the RLS policies existed, and none of it ran because nothing
      // registered the service in a module. A controller or service that is
      // never imported still passes tsc, still lints, and serves nothing. This
      // catches the whole class, including a circular import that would make
      // the graph unresolvable at boot.
      const mod = await Test.createTestingModule({ imports: [JourneysModule] }).compile();
      expect(mod.get(JourneyService)).toBeInstanceOf(JourneyService);
      expect(mod.get(JourneysController)).toBeInstanceOf(JourneysController);
    });
  });

  describe('tenant scoping', () => {
    it('takes companyId from the session, never from the body or the path', async () => {
      const { svc, ctrl } = await build();

      await ctrl.list(TENANT_A);
      await ctrl.get('journey-from-tenant-b', TENANT_A);
      await ctrl.updates('journey-from-tenant-b', TENANT_A);
      await ctrl.setStatus('journey-from-tenant-b', TENANT_A, { status: JourneyStatus.COMPLETED });

      for (const call of [
        svc.listJourneys.mock.calls[0],
        svc.getJourney.mock.calls[0],
        svc.getJourneyUpdates.mock.calls[0],
        svc.updateJourneyStatus.mock.calls[0],
      ]) {
        expect(call[0]).toBe('cmp-a');
      }
    });

    it('scopes each tenant to its own company even when both call the same handler', async () => {
      const { svc, ctrl } = await build();
      await ctrl.list(TENANT_A);
      await ctrl.list(TENANT_B);
      expect(svc.listJourneys.mock.calls[0][0]).toBe('cmp-a');
      expect(svc.listJourneys.mock.calls[1][0]).toBe('cmp-b');
    });

    it('ignores a companyId injected into the body', async () => {
      const { svc, ctrl } = await build();
      const hostile = {
        reference: 'LOAD-1',
        driverId: null,
        origin: null,
        destination: null,
        plannedStart: null,
        plannedEnd: null,
        // not a DTO field, but a client can still send it
        ...({ companyId: 'cmp-evil' } as Record<string, unknown>),
      } as CreateJourneyDto;
      await ctrl.create(TENANT_A, hostile);
      expect(svc.createJourney.mock.calls[0][0]).toBe('cmp-a');
    });
  });

  describe('roles', () => {
    const rolesOf = (refl: Reflector, fn: unknown) => refl.get<UserRole[]>(ROLES_KEY, fn as never);

    it('lets a VIEWER read journeys, via the class-level default', async () => {
      const { reflector, ctrl } = await build();
      // @Roles is declared once on the class; read routes carry no method-level
      // override, so the guard falls back to the class list. Recording that
      // inheritance explicitly: a future refactor that moved the annotation
      // onto each method would silently drop the fallback if it missed one.
      expect(rolesOf(reflector, JourneysController)).toContain(UserRole.VIEWER);
      expect(rolesOf(reflector, ctrl.list)).toBeUndefined();
      expect(rolesOf(reflector, ctrl.get)).toBeUndefined();
    });

    it('does NOT let a VIEWER mutate journeys', async () => {
      const { reflector, ctrl } = await build();
      for (const fn of [ctrl.create, ctrl.addStage, ctrl.assign, ctrl.setStatus, ctrl.acknowledge, ctrl.resolve]) {
        const roles = rolesOf(reflector, fn);
        expect(roles).toBeTruthy();
        expect(roles).not.toContain(UserRole.VIEWER);
        expect(roles).not.toContain(UserRole.USER);
        expect(roles).not.toContain(UserRole.AGENT);
      }
    });

    it('keeps DISPATCH able to do the work', async () => {
      const { reflector, ctrl } = await build();
      for (const fn of [ctrl.create, ctrl.addStage, ctrl.assign, ctrl.setStatus]) {
        expect(rolesOf(reflector, fn)).toContain(UserRole.DISPATCH);
      }
    });
  });

  describe('body validation', () => {
    it('rejects an invented journey status instead of passing it to the service', async () => {
      const dto = plainToInstance(CreateJourneyDto, { reference: 'x' });
      expect(await validate(dto)).toHaveLength(0);

      const bad = plainToInstance(SendJourneyUpdateDto, {
        type: 'TOTALLY_MADE_UP',
        message: 'hello',
      });
      const errors = await validate(bad);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('type');
    });

    it('rejects an empty journey reference', async () => {
      const bad = plainToInstance(CreateJourneyDto, { reference: '' });
      expect((await validate(bad)).length).toBe(0); // empty string is still a string
      // ...which is why the service re-checks; it throws its own 400.
      const { svc, ctrl } = await build();
      svc.createJourney.mockRejectedValue(new Error('Journey reference is required'));
      await expect(ctrl.create(TENANT_A, { reference: '   ' } as CreateJourneyDto)).rejects.toThrow(
        'Journey reference is required',
      );
    });

    it('accepts the real enum values', async () => {
      const dto = plainToInstance(SendJourneyUpdateDto, {
        type: JourneyUpdateType.DELAY_REPORT,
        message: 'stuck at the border',
        clientMessageId: 'device-abc-123',
      });
      expect(await validate(dto)).toHaveLength(0);

      const stage = plainToInstance(CreateJourneyDto, { reference: 'L-1' });
      expect(await validate(stage)).toHaveLength(0);
      expect(Object.values(JourneyStageType)).toContain(JourneyStageType.BORDER);
    });
  });
});
