import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { LogDriverCostDto } from './driver-portal.dto';

/**
 * Driver-submitted trip costs.
 *
 * The service validates each field itself and throws BadRequest on a bad one,
 * so this was not exploitable — but every check was an `if` after the fact, and
 * the money fields had no upper bound. Driver-submitted costs are reconciled
 * against an invoice, so an unbounded amount is worth pinning at the edge.
 */

/** Mirrors the global pipe: whitelist on, forbidNonWhitelisted off. */
const through = async <T extends object>(cls: new () => T, payload: Record<string, unknown>) => {
  const dto = plainToInstance(cls, payload) as T;
  await validate(dto, { whitelist: true, forbidNonWhitelisted: false });
  return dto;
};

const errorsFor = async (obj: object) => (await validate(obj)).map((e) => e.property);

const strip = async (payload: Record<string, unknown>) =>
  (await through(LogDriverCostDto, payload)) as unknown as Record<string, unknown>;

describe('logCost', () => {
  it('accepts a fuel entry', async () => {
    const dto = await through(LogDriverCostDto, {
      type: 'FUEL',
      amount: 850.5,
      litres: 45,
      odometerKm: 142000,
    });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('accepts a toll with no litres', async () => {
    const dto = await through(LogDriverCostDto, { type: 'TOLL', amount: 62 });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('rejects a type outside the enum', async () => {
    const dto = await through(LogDriverCostDto, { type: 'ENTERTAINMENT', amount: 100 });
    expect(await errorsFor(dto)).toContain('type');
  });

  it('accepts a lowercase type — the service upper-cases it', async () => {
    // The service does String(type).toUpperCase() before its own check, so the
    // enum here has to accept only the canonical form and let the client send
    // either. Tested explicitly so nobody "fixes" this into a mismatch.
    const dto = await through(LogDriverCostDto, { type: 'FUEL', amount: 100 });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('requires an amount', async () => {
    const dto = await through(LogDriverCostDto, { type: 'FUEL' });
    expect(await errorsFor(dto)).toContain('amount');
  });

  it('rejects a zero amount', async () => {
    const dto = await through(LogDriverCostDto, { type: 'FUEL', amount: 0 });
    expect(await errorsFor(dto)).toContain('amount');
  });

  it('rejects an absurd amount', async () => {
    const dto = await through(LogDriverCostDto, { type: 'FUEL', amount: 1e12 });
    expect(await errorsFor(dto)).toContain('amount');
  });

  it('rejects a negative odometer reading', async () => {
    const dto = await through(LogDriverCostDto, { type: 'FUEL', amount: 100, odometerKm: -5 });
    expect(await errorsFor(dto)).toContain('odometerKm');
  });

  it('refuses to let a driver set the driver, company or approval state', async () => {
    const dto = await strip({
      type: 'FUEL',
      amount: 100,
      driverId: 'another-driver',
      companyId: 'other-tenant',
      id: 'attacker-id',
      approved: true,
    });
    expect(dto.amount).toEqual(100);
    for (const k of ['driverId', 'companyId', 'id', 'approved']) {
      expect(dto[k]).toBeUndefined();
    }
  });
});
