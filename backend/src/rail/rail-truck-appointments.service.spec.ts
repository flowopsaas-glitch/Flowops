import { RailTruckAppointmentsService } from './rail-truck-appointments.service';

function makeService(rows: any[] = []) {
  const store = [...rows];
  const prisma: any = {
    terminalTruckAppointment: {
      findFirst: jest.fn(async ({ where }: any) => store.find((r) => r.id === where.id && r.companyId === where.companyId) ?? null),
      findMany: jest.fn(async () => store),
      create: jest.fn(async ({ data }: any) => { const r = { id: 'a1', status: 'BOOKED', arrivedAt: null, loadingAt: null, completedAt: null, ...data }; store.push(r); return r; }),
      update: jest.fn(async ({ where, data }: any) => { const r = store.find((x) => x.id === where.id); Object.assign(r, data); return r; }),
    },
  };
  return { svc: new RailTruckAppointmentsService(prisma), prisma, store };
}

const dto = {
  terminalName: 'Central Terminal', haulierName: 'Haulier Co', vehicleReg: 'ABC 123',
  windowStart: '2026-10-26T08:00:00.000Z', windowEnd: '2026-10-26T09:00:00.000Z',
};

describe('RailTruckAppointmentsService', () => {
  it('rejects a window whose end is not after its start', async () => {
    const { svc } = makeService();
    await expect(svc.book('c1', { ...dto, windowEnd: dto.windowStart })).rejects.toThrow('windowEnd must be after windowStart');
  });

  it('reports overlapping active appointments instead of hiding them', async () => {
    const existing = {
      id: 'x1', companyId: 'c1', terminalName: 'Central Terminal', haulierName: 'Other', vehicleReg: 'ZZ 9',
      status: 'BOOKED', windowStart: new Date('2026-10-26T08:30:00Z'), windowEnd: new Date('2026-10-26T09:30:00Z'),
      arrivedAt: null, loadingAt: null,
    };
    const { svc, prisma } = makeService([existing]);
    prisma.terminalTruckAppointment.findMany.mockImplementation(async ({ where }: any) =>
      where?.status ? [existing] : [existing]);
    const created: any = await svc.book('c1', dto);
    expect(created.conflicts).toHaveLength(1);
  });

  it('enforces the status flow and stamps arrival time', async () => {
    const row = {
      id: 'a1', companyId: 'c1', terminalName: 'T', haulierName: 'H', vehicleReg: 'V', status: 'BOOKED',
      windowStart: new Date('2026-10-26T08:00:00Z'), windowEnd: new Date('2026-10-26T09:00:00Z'),
      arrivedAt: null, loadingAt: null, completedAt: null,
    };
    const { svc } = makeService([row]);
    await expect(svc.transition('c1', 'a1', 'COMPLETED')).rejects.toThrow('Cannot move');
    const arrived: any = await svc.transition('c1', 'a1', 'ARRIVED');
    expect(arrived.arrivedAt).toBeInstanceOf(Date);
  });

  it('computes wait only from recorded timestamps', () => {
    const { svc } = makeService();
    expect(svc.metrics({ windowStart: new Date(), arrivedAt: null, loadingAt: null }).waitMinutes).toBeNull();
    const m = svc.metrics({
      windowStart: new Date('2026-10-26T08:00:00Z'),
      arrivedAt: new Date('2026-10-26T08:10:00Z'),
      loadingAt: new Date('2026-10-26T08:40:00Z'),
    });
    expect(m.waitMinutes).toBe(30);
    expect(m.lateMinutes).toBe(10);
  });

  it('is tenant-scoped: another company cannot transition the appointment', async () => {
    const row = {
      id: 'a1', companyId: 'c1', terminalName: 'T', haulierName: 'H', vehicleReg: 'V', status: 'BOOKED',
      windowStart: new Date(), windowEnd: new Date(), arrivedAt: null, loadingAt: null, completedAt: null,
    };
    const { svc } = makeService([row]);
    await expect(svc.transition('other-company', 'a1', 'ARRIVED')).rejects.toThrow('not found');
  });
});
