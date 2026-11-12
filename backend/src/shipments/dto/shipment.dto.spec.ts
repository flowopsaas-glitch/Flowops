import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateShipmentDto, RecalculateRiskDto, UpdateShipmentDto } from './shipment.dto';

/**
 * Shipments.
 *
 * `create` and `update` already funnel input through
 * `pickAllowed(dto, SHIPMENT_FIELDS)` and `update` is tenant-scoped before it
 * writes, so this was not a mass-assignment hole. What it was: coordinates with
 * no range (a shipment could be placed at 900, 900), a `status` with no
 * membership check (a Prisma enum violation surfaces as a 500, not a 400), and
 * dates accepted as free text.
 *
 * `recalculateRisk` reads only `waybillId`. Left untyped, an empty body made
 * that `undefined`, and Prisma drops an undefined filter — so
 * `findFirst({ id: undefined, companyId })` returned the company's FIRST waybill
 * and the risk score was written to whatever row that happened to be.
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
  it('accepts a shipment', async () => {
    const dto = await through(CreateShipmentDto, {
      waybillId: 'wb-1',
      status: 'PENDING',
      driverId: 'drv-1',
      currentLat: -26.2041,
      currentLng: 28.0473,
    });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('requires a waybill', async () => {
    const dto = await through(CreateShipmentDto, { status: 'PENDING' });
    expect(await errorsFor(dto)).toContain('waybillId');
  });

  it('rejects a status outside the enum, which would be a Prisma 500', async () => {
    const dto = await through(CreateShipmentDto, { waybillId: 'wb-1', status: 'VAPORISED' });
    expect(await errorsFor(dto)).toContain('status');
  });

  it('rejects a latitude off the globe', async () => {
    const dto = await through(CreateShipmentDto, { waybillId: 'wb-1', currentLat: 900 });
    expect(await errorsFor(dto)).toContain('currentLat');
  });

  it('rejects a longitude off the globe', async () => {
    const dto = await through(CreateShipmentDto, { waybillId: 'wb-1', currentLng: -900 });
    expect(await errorsFor(dto)).toContain('currentLng');
  });

  it('rejects a malformed delivery date', async () => {
    const dto = await through(CreateShipmentDto, {
      waybillId: 'wb-1',
      estimatedDelivery: 'sometime next week',
    });
    expect(await errorsFor(dto)).toContain('estimatedDelivery');
  });

  it('strips id, companyId and timestamps', async () => {
    const dto = await strip(CreateShipmentDto, {
      waybillId: 'wb-1',
      id: 'attacker',
      companyId: 'other-tenant',
      createdAt: '1999-01-01T00:00:00Z',
    });
    for (const k of ['id', 'companyId', 'createdAt']) {
      expect(dto[k]).toBeUndefined();
    }
  });
});

describe('update', () => {
  it('accepts a driver reassignment without restating the waybill', async () => {
    // A PATCH that only reassigns a driver must not have to resend waybillId.
    const dto = await through(UpdateShipmentDto, { driverId: 'drv-2' });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('rejects an unknown status', async () => {
    const dto = await through(UpdateShipmentDto, { status: 'LOST' });
    expect(await errorsFor(dto)).toContain('status');
  });
});

describe('recalculateRisk — the empty body that hit the wrong waybill', () => {
  it('requires a waybill id', async () => {
    // {} used to leave waybillId undefined, and Prisma drops an undefined
    // filter — so the query matched the company's FIRST waybill.
    const dto = await through(RecalculateRiskDto, {});
    expect(await errorsFor(dto)).toContain('waybillId');
  });

  it('accepts a waybill id', async () => {
    const dto = await through(RecalculateRiskDto, { waybillId: 'wb-1' });
    expect(await errorsFor(dto)).toEqual([]);
  });
});
