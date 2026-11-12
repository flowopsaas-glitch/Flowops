import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateCommercialConfigDto } from './commercial-config.dto';

/**
 * Commercial cost-model configuration.
 *
 * The service wraps this in `withCompanyId`, which strips companyId / id /
 * createdAt / updatedAt and pins the tenant, so scoping is handled. What was
 * not: every number here feeds margin and forecast maths, and none had a bound.
 * A negative `targetMarginPct` or a `fuelCostPerKm` of 1e300 does not fail — it
 * quietly produces a nonsense profitability dashboard, which is the more
 * dangerous outcome.
 */

/** Mirrors the global pipe: whitelist on, forbidNonWhitelisted off. */
const through = async <T extends object>(cls: new () => T, payload: Record<string, unknown>) => {
  const dto = plainToInstance(cls, payload) as T;
  await validate(dto, { whitelist: true, forbidNonWhitelisted: false });
  return dto;
};

const errorsFor = async (obj: object) => (await validate(obj)).map((e) => e.property);

const strip = async (payload: Record<string, unknown>) =>
  (await through(UpdateCommercialConfigDto, payload)) as unknown as Record<string, unknown>;

describe('updateConfig', () => {
  it('accepts a realistic cost model', async () => {
    const dto = await through(UpdateCommercialConfigDto, {
      fuelCostPerKm: 2.5,
      driverHourlyCost: 45,
      vehicleCostPerKm: 1.8,
      overheadPerDelivery: 15,
      avgDeliveryMinutes: 25,
      avgKmPerDelivery: 12,
      targetMarginPct: 35,
      minMarginPct: 15,
      forecastMonths: 3,
    });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('accepts a partial update', async () => {
    const dto = await through(UpdateCommercialConfigDto, { targetMarginPct: 40 });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('rejects an absurd per-km cost', async () => {
    const dto = await through(UpdateCommercialConfigDto, { fuelCostPerKm: 1e300 });
    expect(await errorsFor(dto)).toContain('fuelCostPerKm');
  });

  it('rejects a negative driver hourly cost', async () => {
    const dto = await through(UpdateCommercialConfigDto, { driverHourlyCost: -45 });
    expect(await errorsFor(dto)).toContain('driverHourlyCost');
  });

  it('allows a negative margin — a loss-making job is a real input', async () => {
    // Deliberately not @Min(0): a negative margin is a legitimate thing to
    // model, and refusing it would make the tool unable to describe a loss.
    const dto = await through(UpdateCommercialConfigDto, { targetMarginPct: -10 });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('rejects a forecast horizon beyond any planning cycle', async () => {
    const dto = await through(UpdateCommercialConfigDto, { forecastMonths: 5000 });
    expect(await errorsFor(dto)).toContain('forecastMonths');
  });

  it('rejects a non-integer forecast horizon', async () => {
    const dto = await through(UpdateCommercialConfigDto, { forecastMonths: 3.5 });
    expect(await errorsFor(dto)).toContain('forecastMonths');
  });

  it('refuses to let a caller set id, companyId or timestamps', async () => {
    const dto = await strip({
      targetMarginPct: 40,
      id: 'attacker-id',
      companyId: 'other-tenant',
      createdAt: '1999-01-01T00:00:00Z',
      updatedAt: '1999-01-01T00:00:00Z',
    });
    expect(dto.targetMarginPct).toEqual(40);
    for (const k of ['id', 'companyId', 'createdAt', 'updatedAt']) {
      expect(dto[k]).toBeUndefined();
    }
  });
});
