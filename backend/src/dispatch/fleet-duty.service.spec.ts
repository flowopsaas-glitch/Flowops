import { ConflictException, NotFoundException } from '@nestjs/common';
import { FleetDutyService } from './fleet-duty.service';

function makeHarness(data: {
  drivers?: any[];
  duties?: any[];
  shipments?: any[];
} = {}) {
  const tx = {
    driverDuty: { updateMany: jest.fn(async () => ({ count: 1 })) },
  };
  const prisma = {
    driver: { findMany: jest.fn(async () => data.drivers ?? []) },
    driverDuty: {
      findMany: jest.fn(async () => data.duties ?? []),
      findFirst: jest.fn(async ({ where }: any) =>
        (data.duties ?? []).find((d) => d.id === where.id && d.companyId === where.companyId) ?? null,
      ),
    },
    shipment: { findMany: jest.fn(async () => data.shipments ?? []) },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const outbox = { enqueue: jest.fn(async () => 'evt') };
  const audit = { record: jest.fn(async () => 'audit') };
  const svc = new FleetDutyService(prisma as any, outbox as any, audit as any);
  return { svc, prisma, tx, outbox, audit };
}

const NOW = new Date('2026-10-12T18:00:00Z');

describe('FleetDutyService.getBoard — the roster', () => {
  it('merges duty, craft, vehicle and loads into one sorted board', async () => {
    const { svc } = makeHarness({
      drivers: [
        { id: 'd1', name: 'Kabelo', phone: '071', vehicleReg: 'OLD-1' },
        { id: 'd2', name: 'Zanele', phone: '072', vehicleReg: null },
      ],
      duties: [
        { id: 'duty-1', companyId: 'co-1', driverId: 'd1', status: 'ACTIVE', mode: 'TRUCK', vehicleReg: 'GP 42', startedAt: new Date('2026-10-12T10:00:00Z') },
      ],
      shipments: [
        { driverId: 'd1', status: 'IN_TRANSIT', updatedAt: NOW, waybill: { podDeliveredAt: null } },
        { driverId: 'd1', status: 'IN_TRANSIT', updatedAt: NOW, waybill: { podDeliveredAt: null } },
        { driverId: 'd1', status: 'DELIVERED', updatedAt: NOW, waybill: { podDeliveredAt: new Date('2026-10-12T09:00:00Z') } },
        { driverId: 'd2', status: 'DELIVERED', updatedAt: NOW, waybill: { podDeliveredAt: new Date('2026-10-11T09:00:00Z') } },
      ],
    });
    const board = await svc.getBoard('co-1', NOW);
    expect(board.summary.onDuty).toBe(1);
    expect(board.summary.openLoads).toBe(2);
    expect(board.summary.deliveredToday).toBe(1); // d2's delivery was yesterday

    const kabelo = board.roster.find((r: any) => r.driverId === 'd1')!;
    expect(kabelo.state).toBe('ON_DUTY');
    expect(kabelo.vehicleReg).toBe('GP 42'); // duty reg wins
    expect(kabelo.hoursOnDuty).toBe(8);
    expect(kabelo.fatigue).toBe('WARN');
    expect(kabelo.openLoads).toBe(2);
    // duty-first sorting: Kabelo above off-duty Zanele
    expect(board.roster[0].driverId).toBe('d1');
  });
});

describe('FleetDutyService.forceEndDuty — the control-room override', () => {
  it('closes a stuck duty, emits the event and audits the override', async () => {
    const { svc, tx, outbox, audit } = makeHarness({
      duties: [{ id: 'duty-1', companyId: 'co-1', driverId: 'd1', status: 'ACTIVE', mode: 'TRUCK', startedAt: new Date() }],
    });
    const res = await svc.forceEndDuty('co-1', 'duty-1', { userId: 'u1', name: 'Dispatch' }, 'phone died');
    expect(res.ok).toBe(true);
    expect(tx.driverDuty.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'duty-1', companyId: 'co-1', status: 'ACTIVE' },
    }));
    expect(outbox.enqueue).toHaveBeenCalledWith(expect.anything(), 'co-1', 'driver.duty.force_ended', expect.objectContaining({ dutyId: 'duty-1', by: 'Dispatch' }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'driver.duty.force_ended' }));
  });

  it('refuses to force-end a duty that already ended', async () => {
    const { svc } = makeHarness({
      duties: [{ id: 'duty-1', companyId: 'co-1', driverId: 'd1', status: 'COMPLETED', endedAt: new Date() }],
    });
    await expect(svc.forceEndDuty('co-1', 'duty-1', { userId: 'u1' })).rejects.toThrow(ConflictException);
  });

  it('404s for another tenant\'s duty (not found, not a leak)', async () => {
    const { svc } = makeHarness({ duties: [] });
    await expect(svc.forceEndDuty('co-1', 'duty-x', {})).rejects.toThrow(NotFoundException);
  });

  it('CAS: a second force-end loses cleanly', async () => {
    const { svc, tx } = makeHarness({
      duties: [{ id: 'duty-1', companyId: 'co-1', driverId: 'd1', status: 'ACTIVE', mode: 'BAKKIE', startedAt: new Date() }],
    });
    (tx.driverDuty.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await svc.forceEndDuty('co-1', 'duty-1', { userId: 'u1' });
    await expect(svc.forceEndDuty('co-1', 'duty-1', { userId: 'u2' })).rejects.toThrow('already ended');
  });
});
