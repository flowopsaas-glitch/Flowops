import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AddCarrierRateDto, CreateCarrierDto, UpdateCarrierDto } from './carrier.dto';

/**
 * `update` was the hole in this module:
 *
 *     const { id, companyId, rates, ...data } = dto ?? {};
 *     prisma.carrier.update({ where: { id }, data });
 *
 * Three keys stripped, every other one written. `createdAt`, `updatedAt`, and
 * any column added to `Carrier` later were all caller-settable.
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

describe('carrier update — the three-key destructure', () => {
  it('accepts a legitimate rename', async () => {
    const dto = await through(UpdateCarrierDto, { name: 'Maersk SA' });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('refuses to let a caller set timestamps, id or companyId', async () => {
    // The destructure only removed id, companyId and rates. Everything else
    // reached Prisma — including both timestamps.
    const dto = await strip(UpdateCarrierDto, {
      name: 'Maersk SA',
      id: 'attacker-id',
      companyId: 'other-tenant',
      createdAt: '1999-01-01T00:00:00Z',
      updatedAt: '1999-01-01T00:00:00Z',
      rates: [{ id: 'injected-rate' }],
    });
    expect(dto.name).toEqual('Maersk SA');
    for (const k of ['id', 'companyId', 'createdAt', 'updatedAt', 'rates']) {
      expect(dto[k]).toBeUndefined();
    }
  });

  it('rejects a carrier type outside the enum', async () => {
    const dto = await through(UpdateCarrierDto, { type: 'PIGEON_POST' });
    expect(await errorsFor(dto)).toContain('type');
  });
});

describe('carrier create', () => {
  it('requires a name', async () => {
    const dto = await through(CreateCarrierDto, { type: 'AIRLINE' });
    expect(await errorsFor(dto)).toContain('name');
  });

  it('rejects a malformed contact email', async () => {
    const dto = await through(CreateCarrierDto, { name: 'Emirates', contactEmail: 'nope' });
    expect(await errorsFor(dto)).toContain('contactEmail');
  });
});

describe('carrier rates — money has to be a number', () => {
  it('accepts a rate', async () => {
    const dto = await through(AddCarrierRateDto, { buyRate: 1450.5, lane: 'CNSHA → ZADUR', mode: 'OCEAN' });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('rejects a non-numeric rate', async () => {
    // The service's toRate() would turn this into a BadRequestException too,
    // but only after the request had already been accepted.
    const dto = await through(AddCarrierRateDto, { buyRate: 'negotiable' });
    expect(await errorsFor(dto)).toContain('buyRate');
  });

  it('rejects a negative rate', async () => {
    const dto = await through(AddCarrierRateDto, { buyRate: -100 });
    expect(await errorsFor(dto)).toContain('buyRate');
  });

  it('rejects an absurd rate', async () => {
    const dto = await through(AddCarrierRateDto, { buyRate: 1e15 });
    expect(await errorsFor(dto)).toContain('buyRate');
  });
});
