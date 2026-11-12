import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateAddressDto, UpdateAddressDto } from './logistics-ops.dto';

/**
 * Address-book bodies.
 *
 * The service already runs these through `withCompanyId`, which strips
 * companyId / id / createdAt / updatedAt and pins the tenant, so the
 * tenant-scoping property is handled. What is left is shape: coordinates with
 * no range, a `type` with no membership check, and unbounded text.
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

describe('createAddress', () => {
  it('accepts an address', async () => {
    const dto = await through(CreateAddressDto, {
      label: 'Takealot JHB',
      name: 'Takealot',
      address: '10 Warehouse Rd',
      city: 'Johannesburg',
      type: 'SENDER',
      lat: -26.1,
      lng: 28.05,
    });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('requires a label, name and address', async () => {
    const dto = await through(CreateAddressDto, { label: 'X' });
    expect(await errorsFor(dto).then((e) => e.sort())).toEqual(['address', 'name']);
  });

  it('rejects an address type outside the allowed set', async () => {
    const dto = await through(CreateAddressDto, {
      label: 'X', name: 'Y', address: 'Z', type: 'BOTH_PLUS',
    });
    expect(await errorsFor(dto)).toContain('type');
  });

  it('rejects a latitude off the globe', async () => {
    const dto = await through(CreateAddressDto, {
      label: 'X', name: 'Y', address: 'Z', lat: 900,
    });
    expect(await errorsFor(dto)).toContain('lat');
  });

  it('rejects a malformed email', async () => {
    const dto = await through(CreateAddressDto, {
      label: 'X', name: 'Y', address: 'Z', email: 'nope',
    });
    expect(await errorsFor(dto)).toContain('email');
  });

  it('refuses to let a caller set id, companyId or usage counters', async () => {
    // usageCount and lastUsedAt drive the smart-suggestion ranking, so a
    // caller must not be able to inflate their own address to the top.
    const dto = await strip(CreateAddressDto, {
      label: 'X', name: 'Y', address: 'Z',
      id: 'attacker-id',
      companyId: 'other-tenant',
      usageCount: 999999,
      createdAt: '1999-01-01T00:00:00Z',
    });
    for (const k of ['id', 'companyId', 'usageCount', 'createdAt']) {
      expect(dto[k]).toBeUndefined();
    }
  });
});

describe('updateAddress', () => {
  it('accepts a partial update', async () => {
    const dto = await through(UpdateAddressDto, { label: 'Renamed' });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('rejects an unknown type', async () => {
    const dto = await through(UpdateAddressDto, { type: 'SOMETIMES' });
    expect(await errorsFor(dto)).toContain('type');
  });

  it('refuses to let a caller set id or companyId', async () => {
    const dto = await strip(UpdateAddressDto, {
      label: 'Renamed', id: 'attacker', companyId: 'other-tenant',
    });
    expect(dto.label).toEqual('Renamed');
    expect(dto.id).toBeUndefined();
    expect(dto.companyId).toBeUndefined();
  });
});
