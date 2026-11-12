import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateSafetyZoneDto, UpdateSafetyZoneDto } from './safety-zone.dto';

/**
 * Safety zones — geofences that warn drivers off hijacking hotspots.
 *
 *     createZone: data: { ...dto, companyId }
 *     updateZone: const { companyId, ...rest } = dto; data: { ...rest, companyId }
 *
 * Both re-assert companyId last, so the tenant-rehoming attack described in the
 * service comment is already closed. What the spread still allowed: a
 * caller-set `id`, and `createdAt` / `updatedAt` written verbatim. On create a
 * client-chosen id collides with an existing row; on update Prisma ignores it,
 * which is worse — it looks harmless and quietly isn't.
 */

/** Mirrors the global pipe: whitelist on, forbidNonWhitelisted off. */
const through = async <T extends object>(cls: new () => T, payload: Record<string, unknown>) => {
  const dto = plainToInstance(cls, payload) as T;
  await validate(dto, { whitelist: true, forbidNonWhitelisted: false });
  return dto;
};

const errorsFor = async (obj: object) => (await validate(obj)).map((e) => e.property);

const strip = async (cls: new () => object, payload: Record<string, unknown>) =>
  (await through(cls, payload)) as unknown as Record<string, unknown>;

describe('create', () => {
  it('accepts a zone', async () => {
    const dto = await through(CreateSafetyZoneDto, {
      name: 'Alexandra',
      description: 'High hijacking area',
      lat: -26.103,
      lng: 28.09,
      radiusM: 1500,
      riskLevel: 'HIGH',
    });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('requires a name, a lat and a lng', async () => {
    const dto = await through(CreateSafetyZoneDto, { name: 'X' });
    expect(await errorsFor(dto).then((e) => e.sort())).toEqual(['lat', 'lng']);
  });

  it('rejects a latitude off the globe', async () => {
    const dto = await through(CreateSafetyZoneDto, { name: 'X', lat: 91, lng: 0 });
    expect(await errorsFor(dto)).toContain('lat');
  });

  it('rejects a radius too small to be a geofence', async () => {
    const dto = await through(CreateSafetyZoneDto, { name: 'X', lat: 0, lng: 0, radiusM: 1 });
    expect(await errorsFor(dto)).toContain('radiusM');
  });

  it('rejects a radius wider than a city', async () => {
    const dto = await through(CreateSafetyZoneDto, {
      name: 'X', lat: 0, lng: 0, radiusM: 5_000_000,
    });
    expect(await errorsFor(dto)).toContain('radiusM');
  });

  it('rejects a risk level outside the enum', async () => {
    const dto = await through(CreateSafetyZoneDto, {
      name: 'X', lat: 0, lng: 0, riskLevel: 'APOCALYPTIC',
    });
    expect(await errorsFor(dto)).toContain('riskLevel');
  });
});

describe('update — the spread that left id and timestamps writable', () => {
  it('accepts a partial update', async () => {
    const dto = await through(UpdateSafetyZoneDto, { riskLevel: 'CRITICAL' });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('refuses to let a caller set id or timestamps', async () => {
    const dto = await strip(UpdateSafetyZoneDto, {
      name: 'Alexandra',
      id: 'attacker-id',
      createdAt: '1999-01-01T00:00:00Z',
      updatedAt: '1999-01-01T00:00:00Z',
    });
    expect(dto.name).toEqual('Alexandra');
    for (const k of ['id', 'createdAt', 'updatedAt']) {
      expect(dto[k]).toBeUndefined();
    }
  });
});
