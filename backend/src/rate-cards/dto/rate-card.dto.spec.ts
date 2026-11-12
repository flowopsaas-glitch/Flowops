import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CalculateRateDto, CreateRateCardDto, UpdateRateCardDto } from './rate-card.dto';

/**
 * Rate cards.
 *
 * The service already allowlists with `pickAllowed(dto, RATE_CARD_FIELDS)`, so
 * this module was not mass-assignable. The gap was unbounded numbers in a
 * pricing function.
 *
 * `calculate`'s weight guard was fixed in the service after a real bug: an
 * undefined weight reached Prisma as `lte: undefined`, which Prisma drops —
 * turning the filter into "every active card" and pricing the job off whichever
 * row came back first. These tests are the second lock on that door.
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
  it('accepts a card', async () => {
    const dto = await through(CreateRateCardDto, {
      name: 'JHB → DBN 0-500kg',
      fromZone: 'JHB',
      toZone: 'DBN',
      minWeight: 0,
      maxWeight: 500,
      basePrice: 450,
      pricePerKg: 3.5,
    });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('requires a name and a base price', async () => {
    const dto = await through(CreateRateCardDto, { fromZone: 'JHB' });
    expect(await errorsFor(dto).then((e) => e.sort())).toEqual(['basePrice', 'name']);
  });

  it('rejects a negative price per kg', async () => {
    const dto = await through(CreateRateCardDto, { name: 'X', basePrice: 10, pricePerKg: -1 });
    expect(await errorsFor(dto)).toContain('pricePerKg');
  });

  it('strips id, companyId and timestamps', async () => {
    // pickAllowed already excludes these; this asserts the edge agrees.
    const dto = await strip(CreateRateCardDto, {
      name: 'X',
      basePrice: 1,
      id: 'attacker',
      companyId: 'other-tenant',
      createdAt: '1999-01-01T00:00:00Z',
    });
    for (const k of ['id', 'companyId', 'createdAt']) {
      expect(dto[k]).toBeUndefined();
    }
  });
});

describe('calculate — the weight that widened the query', () => {
  it('accepts a weight', async () => {
    const dto = await through(CalculateRateDto, { weight: 250, fromZone: 'JHB', toZone: 'DBN' });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('requires a weight', async () => {
    // An omitted weight is the exact case that used to return "every active
    // card" and price the job off cards[0].
    const dto = await through(CalculateRateDto, { fromZone: 'JHB' });
    expect(await errorsFor(dto)).toContain('weight');
  });

  it('rejects a negative weight', async () => {
    const dto = await through(CalculateRateDto, { weight: -5 });
    expect(await errorsFor(dto)).toContain('weight');
  });

  it('rejects a weight beyond any real consignment', async () => {
    const dto = await through(CalculateRateDto, { weight: 1e9 });
    expect(await errorsFor(dto)).toContain('weight');
  });

  it('rejects a non-numeric weight', async () => {
    const dto = await through(CalculateRateDto, { weight: 'heavy' });
    expect(await errorsFor(dto)).toContain('weight');
  });
});

describe('update', () => {
  it('accepts a partial update', async () => {
    const dto = await through(UpdateRateCardDto, { basePrice: 500 });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('rejects an absurd base price', async () => {
    const dto = await through(UpdateRateCardDto, { basePrice: 1e15 });
    expect(await errorsFor(dto)).toContain('basePrice');
  });
});
