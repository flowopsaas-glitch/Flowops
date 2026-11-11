import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ShipmentsService } from './shipments.service';

/**
 * SHIPMENTS — the movement record tying a waybill to a driver.
 *
 * This module is the best-hardened one audited so far: an explicit field
 * allowlist, tenant checks on both references, and the shared compliance policy
 * applied to dispatch. That is worth locking in with tests, because it had none
 * and all of it is easy to undo by accident.
 *
 * The one thing actually wrong was `recalculateRisk` accepting a body with no
 * waybillId.
 */

const COMPANY = 'co-1';
const VICTIM = 'co-2';

const matches = (row: any, where: any) =>
  Object.entries(where ?? {}).every(([k, v]) => (v === undefined ? true : row[k] === v));

function makeHarness() {
  const shipments: any[] = [];
  const waybills: any[] = [];
  const drivers: any[] = [];
  let seq = 0;

  const shipment = {
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `sh-${++seq}`, status: 'PENDING', ...data };
      shipments.push(row);
      return { ...row };
    }),
    findMany: jest.fn(async ({ where }: any) => shipments.filter((s) => matches(s, where))),
    findFirst: jest.fn(async ({ where }: any) => shipments.find((s) => matches(s, where)) ?? null),
    update: jest.fn(async ({ where, data }: any) => {
      const s = shipments.find((x) => x.id === where.id);
      if (!s) throw new Error('not found');
      Object.assign(s, data);
      return { ...s };
    }),
  };

  const waybill = {
    findFirst: jest.fn(async ({ where }: any) => waybills.find((w) => matches(w, where)) ?? null),
    update: jest.fn(async ({ where, data }: any) => {
      const w = waybills.find((x) => x.id === where.id);
      if (!w) throw new Error('not found');
      Object.assign(w, data);
      return { ...w };
    }),
  };

  const driver = {
    findFirst: jest.fn(async ({ where }: any) => drivers.find((d) => matches(d, where)) ?? null),
  };

  const prisma: any = { shipment, waybill, driver, __shipments: shipments, __waybills: waybills, __drivers: drivers };
  const gateway: any = { emitShipmentUpdate: jest.fn(), emitRiskScoreUpdated: jest.fn() };
  const compliance: any = { assertDispatchable: jest.fn(async () => undefined) };

  return { prisma, gateway, compliance, svc: new ShipmentsService(prisma, gateway, compliance) };
}

const seedWaybill = (h: any, id: string, companyId: string, over: any = {}) => {
  const row = {
    id, companyId, trackingNumber: `TRK-${id}`, codAmount: 0, attemptCount: 0,
    recipientLat: -26.2, recipientLng: 28.0, status: 'PENDING', returnToSender: false,
    createdAt: new Date(), riskScore: 0, riskLevel: 'LOW', riskNotes: '', ...over,
  };
  h.prisma.__waybills.push(row);
  return row;
};

const seedDriver = (h: any, id: string, companyId: string, over: any = {}) => {
  const row = {
    id, companyId, currentKm: 1000, nextServiceKm: 20000,
    nextServiceDate: new Date(Date.now() + 30 * 86_400_000), ...over,
  };
  h.prisma.__drivers.push(row);
  return row;
};

describe('ShipmentsService — tenant scoping on the references', () => {
  it('forces the caller’s company onto a new shipment', async () => {
    const h = makeHarness();
    seedWaybill(h, 'wb-1', COMPANY);

    const s = await h.svc.create(COMPANY, { waybillId: 'wb-1' });

    expect(s.companyId).toEqual(COMPANY);
  });

  it('refuses a waybill belonging to another tenant', async () => {
    const h = makeHarness();
    seedWaybill(h, 'wb-1', VICTIM);

    await expect(h.svc.create(COMPANY, { waybillId: 'wb-1' })).rejects.toThrow(BadRequestException);
    expect(h.prisma.__shipments).toHaveLength(0);
  });

  it('refuses a driver belonging to another tenant', async () => {
    const h = makeHarness();
    seedWaybill(h, 'wb-1', COMPANY);
    seedDriver(h, 'dr-1', VICTIM);

    await expect(h.svc.create(COMPANY, { waybillId: 'wb-1', driverId: 'dr-1' })).rejects.toThrow(
      BadRequestException,
    );
    expect(h.prisma.__shipments).toHaveLength(0);
  });

  it('cannot update another tenant’s shipment', async () => {
    const h = makeHarness();
    h.prisma.__shipments.push({ id: 'sh-1', companyId: VICTIM, status: 'PENDING', driverId: null });

    await expect(h.svc.update('sh-1', COMPANY, { status: 'DELIVERED' })).rejects.toThrow(NotFoundException);
    expect(h.prisma.__shipments[0].status).toEqual('PENDING');
  });

  it('cannot read risk for another tenant’s waybill', async () => {
    const h = makeHarness();
    seedWaybill(h, 'wb-1', VICTIM);
    await expect(h.svc.getRisk('wb-1', COMPANY)).rejects.toThrow(NotFoundException);
  });
});

describe('ShipmentsService — what an update is allowed to write', () => {
  it('writes allowlisted fields', async () => {
    const h = makeHarness();
    seedWaybill(h, 'wb-1', COMPANY);
    h.prisma.__shipments.push({ id: 'sh-1', companyId: COMPANY, status: 'PENDING', driverId: null });

    const out = await h.svc.update('sh-1', COMPANY, { status: 'IN_TRANSIT', driverId: null });

    expect(out.status).toEqual('IN_TRANSIT');
  });

  it('drops fields outside the allowlist', async () => {
    const h = makeHarness();
    h.prisma.__shipments.push({ id: 'sh-1', companyId: COMPANY, status: 'PENDING', driverId: null });

    await h.svc.update('sh-1', COMPANY, {
      status: 'IN_TRANSIT', companyId: VICTIM, id: 'sh-999', createdAt: new Date(0),
    } as any);

    const row = h.prisma.__shipments[0];
    expect(row.companyId).toEqual(COMPANY);
    expect(row.id).toEqual('sh-1');
  });

  it('applies the compliance check when the driver actually changes', async () => {
    const h = makeHarness();
    seedDriver(h, 'dr-2', COMPANY);
    h.prisma.__shipments.push({ id: 'sh-1', companyId: COMPANY, status: 'PENDING', driverId: 'dr-1' });

    await h.svc.update('sh-1', COMPANY, { driverId: 'dr-2' });

    expect(h.compliance.assertDispatchable).toHaveBeenCalledWith('dr-2', COMPANY);
  });

  it('does not treat re-setting the same driver as a new dispatch', async () => {
    const h = makeHarness();
    seedDriver(h, 'dr-1', COMPANY);
    h.prisma.__shipments.push({ id: 'sh-1', companyId: COMPANY, status: 'PENDING', driverId: 'dr-1' });

    await h.svc.update('sh-1', COMPANY, { driverId: 'dr-1' });

    expect(h.compliance.assertDispatchable).not.toHaveBeenCalled();
  });
});

describe('ShipmentsService — recalculateRisk', () => {
  it('refuses to run with no waybillId', async () => {
    // FAILED BEFORE: `dto.waybillId` undefined makes Prisma drop the `id`
    // condition entirely, so `findFirst({ id: undefined, companyId })` returns
    // the company's FIRST waybill and the "not found" guard waves it through.
    // The caller then scores a waybill nobody named. Note the fake here skips
    // undefined terms for the same reason Prisma does — otherwise this test
    // would pass against the broken code.
    const h = makeHarness();
    seedWaybill(h, 'wb-1', COMPANY, { riskScore: 0.1, riskLevel: 'LOW' });
    seedWaybill(h, 'wb-2', COMPANY, { riskScore: 0.9, riskLevel: 'CRITICAL' });

    await expect(h.svc.recalculateRisk(COMPANY, {})).rejects.toThrow(BadRequestException);

    // Nothing was scored on our behalf.
    expect(h.prisma.__waybills[0].riskScore).toEqual(0.1);
    expect(h.prisma.__waybills[1].riskScore).toEqual(0.9);
  });

  it('refuses to score another tenant’s waybill', async () => {
    const h = makeHarness();
    seedWaybill(h, 'wb-1', VICTIM);
    await expect(h.svc.recalculateRisk(COMPANY, { waybillId: 'wb-1' })).rejects.toThrow(NotFoundException);
  });

  it('scores the named waybill and returns it with the rating token stripped', async () => {
    const h = makeHarness();
    seedWaybill(h, 'wb-1', COMPANY, { codAmount: 9000, attemptCount: 3, returnToSender: true });

    const out: any = await h.svc.recalculateRisk(COMPANY, { waybillId: 'wb-1' });

    expect(out.riskLevel).toEqual('CRITICAL');
    expect(h.prisma.__waybills[0].riskScore).toBeGreaterThan(0.7);
    expect(out.ratingToken).toBeUndefined();
  });
});
