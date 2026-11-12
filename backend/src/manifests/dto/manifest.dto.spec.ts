import 'reflect-metadata'; // must precede class-transformer's decorators
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateManifestDto, UpdateManifestDto, CreateLinehaulDto } from './manifest.dto';

/**
 * The edge of the manifest module.
 *
 * ManifestsService.update() strips `companyId` and then spreads everything
 * else into a Prisma write. With `@Body() body: any` the global ValidationPipe
 * had no metatype, `whitelist: true` had nothing to strip against, and the raw
 * JSON reached that spread — so a caller could set `id`, `createdAt`, and
 * (after migration 20261113090000) `code`, which is now uniquely constrained
 * and generated under an advisory lock.
 *
 * These tests pin that the whitelist actually removes those fields. Passing
 * validation is not the point here; the point is what does NOT survive.
 */

/**
 * Mirrors the global ValidationPipe exactly: `whitelist: true`,
 * `forbidNonWhitelisted: false`.
 *
 * The stripping is done by class-validator's `whitelist` option, which removes
 * any property carrying NO validation decorator — NOT by class-transformer's
 * `excludeExtraneousValues`. That distinction is the whole test: exclude-
 * extraneous strips *undecorated* AND *decorated* properties alike, so using
 * it here made every "field is stripped" assertion pass while also stripping
 * the legitimate fields. Two tests went green for the wrong reason.
 */
const through = async <T extends object>(cls: new () => T, payload: Record<string, unknown>) => {
  const dto = plainToInstance(cls, payload) as T;
  await validate(dto, { whitelist: true, forbidNonWhitelisted: false });
  return dto;
};

/** Type errors on the fields that ARE writable. */
const errorsFor = async (obj: object) => (await validate(obj)).map((e) => e.property);

describe('CreateManifestDto', () => {
  it('accepts a well-formed create', async () => {
    const dto = await through(CreateManifestDto, {
      waybillIds: ['wb-1', 'wb-2'],
      branchId: 'br-1',
      driverId: 'dr-1',
    });
    expect(await errorsFor(dto)).toEqual([]);
    expect(dto.waybillIds).toEqual(['wb-1', 'wb-2']);
  });

  it('rejects an empty waybill list', async () => {
    const dto = await through(CreateManifestDto, { waybillIds: [] });
    expect(await errorsFor(dto)).toContain('waybillIds');
  });

  it('drops fields the service would otherwise spread into the write', async () => {
    // The whole point. These are the ones that matter:
    const dto = await through(CreateManifestDto, {
      waybillIds: ['wb-1'],
      code: 'MAN-00001', // generated + uniquely constrained — must not be settable
      id: 'attacker-id', // would re-point every ManifestWaybill FK
      companyId: 'other-tenant',
      createdAt: '1999-01-01T00:00:00Z',
    }) as unknown as Record<string, unknown>;

    expect(dto.waybillIds).toEqual(['wb-1']);
    for (const stripped of ['code', 'id', 'companyId', 'createdAt']) {
      expect(dto[stripped]).toBeUndefined();
    }
  });
});

describe('UpdateManifestDto', () => {
  it('accepts the fields receiveManifest sets', async () => {
    const dto = await through(UpdateManifestDto, {
      dispatched: true,
      dispatchedAt: '2026-01-01T00:00:00Z',
    });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('accepts branch and driver reassignment', async () => {
    const dto = await through(UpdateManifestDto, { branchId: 'br-2', driverId: 'dr-2' });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('does not let a caller set the manifest code', async () => {
    // Service spreads `rest` into a Prisma write. If `code` survived, a caller
    // could pick a value the generator will hand out later and recreate the
    // collision the unique constraint exists to prevent.
    const dto = await through(UpdateManifestDto, { code: 'MAN-00001' }) as unknown as Record<string, unknown>;
    expect(dto.code).toBeUndefined();
  });

  it('does not let a caller move the row to another tenant or change its identity', async () => {
    const dto = await through(UpdateManifestDto, {
      companyId: 'other-tenant',
      id: 'attacker-id',
      waybills: [{ waybillId: 'wb-x' }],
      tripCostEntries: [],
    }) as unknown as Record<string, unknown>;

    for (const stripped of ['companyId', 'id', 'waybills', 'tripCostEntries']) {
      expect(dto[stripped]).toBeUndefined();
    }
  });

  it('rejects a wrong-typed field rather than coercing it', async () => {
    const dto = await through(UpdateManifestDto, { dispatched: 'yes' });
    expect(await errorsFor(dto)).toContain('dispatched');
  });
});

describe('CreateLinehaulDto', () => {
  it('accepts a well-formed linehaul', async () => {
    const dto = await through(CreateLinehaulDto, {
      waybillIds: ['wb-1'],
      destinationBranchId: 'br-9',
    });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('requires a destination branch', async () => {
    const dto = await through(CreateLinehaulDto, { waybillIds: ['wb-1'] });
    expect(await errorsFor(dto)).toContain('destinationBranchId');
  });
});
