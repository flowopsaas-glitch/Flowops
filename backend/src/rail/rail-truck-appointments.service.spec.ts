import { RailTruckAppointmentsService } from './rail-truck-appointments.service';

function makeService(rows: any[] = []) {
  const store = [...rows];
  const prisma: any = {
    company: { findUnique: jest.fn(async () => ({ terminalGateCutoffHours: 2 })) },
    terminalTruckAppointment: {
      findFirst: jest.fn(async ({ where }: any) =>
        where.shareToken
          ? store.find((r) => r.shareToken === where.shareToken) ?? null
          : store.find((r) => r.id === where.id && r.companyId === where.companyId) ?? null),
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

describe('window-change governance', () => {
  const soon = () => new Date(Date.now() + 60 * 60_000); // inside the 2h cut-off
  const row = () => ({
    id: 'a1', companyId: 'c1', terminalName: 'T', haulierName: 'H', vehicleReg: 'V', status: 'BOOKED',
    windowStart: soon(), windowEnd: new Date(soon().getTime() + 3600_000),
    arrivedAt: null, loadingAt: null, completedAt: null, note: null as string | null, shareToken: null as string | null,
  });

  it('blocks a reschedule inside the cut-off without force + reason', async () => {
    const { svc } = makeService([row()]);
    const start = new Date(Date.now() + 3 * 3600_000).toISOString();
    const end = new Date(Date.now() + 4 * 3600_000).toISOString();
    await expect(svc.reschedule('c1', 'a1', { windowStart: start, windowEnd: end })).rejects.toThrow('cut-off');
  });

  it('allows a forced change inside the cut-off and records the reason', async () => {
    const { svc, store } = makeService([row()]);
    const start = new Date(Date.now() + 3 * 3600_000).toISOString();
    const end = new Date(Date.now() + 4 * 3600_000).toISOString();
    const res: any = await svc.reschedule('c1', 'a1', { windowStart: start, windowEnd: end, force: true, note: 'Train ETA slipped' });
    expect(res.forced).toBe(true);
    expect(store[0].note).toContain('forced change inside cut-off');
    expect(store[0].note).toContain('Train ETA slipped');
  });

  it('blocks cancelling a BOOKED window inside the cut-off without force', async () => {
    const { svc } = makeService([row()]);
    await expect(svc.transition('c1', 'a1', 'CANCELLED')).rejects.toThrow('cut-off');
    const ok: any = await svc.transition('c1', 'a1', 'CANCELLED', { force: true, note: 'Haulier cancelled by phone' });
    expect(ok.status).toBe('CANCELLED');
  });
});

describe('counterparty share link', () => {
  it('issues a token and the shared view exposes no tenant internals', async () => {
    const r = {
      id: 'a1', companyId: 'c1', terminalName: 'T', haulierName: 'H', vehicleReg: 'V', driverName: 'D',
      purpose: 'DELIVERY', status: 'BOOKED', windowStart: new Date(), windowEnd: new Date(),
      arrivedAt: null, loadingAt: null, completedAt: null, note: 'internal note', bookedBy: 'ops@x',
      shareToken: null as string | null,
    };
    const { svc } = makeService([r as any]);
    const link = await svc.createShareLink('c1', 'a1');
    expect(link.path).toBe(`/gate/${link.token}`);
    const view: any = await svc.getShared(link.token);
    expect(view.vehicleReg).toBe('V');
    expect(view.companyId).toBeUndefined();
    expect(view.note).toBeUndefined();
    expect(view.bookedBy).toBeUndefined();
    expect(view.driverName).toBeUndefined();
    await svc.revokeShareLink('c1', 'a1');
    await expect(svc.getShared(link.token)).rejects.toThrow('not found');
  });
});

describe('day replan', () => {
  it('shifts only BOOKED appointments at that terminal on that day', async () => {
    const mk = (id: string, status: string, start: string, terminal = 'Central Terminal') => ({
      id, companyId: 'c1', terminalName: terminal, haulierName: 'H', vehicleReg: id, status,
      windowStart: new Date(start), windowEnd: new Date(new Date(start).getTime() + 3600_000),
      arrivedAt: null, loadingAt: null, completedAt: null, note: null as string | null, shareToken: null as string | null,
    });
    const rows = [
      mk('a', 'BOOKED', '2026-10-26T08:00:00Z'),
      mk('b', 'ARRIVED', '2026-10-26T08:00:00Z'),
      mk('c', 'BOOKED', '2026-10-27T08:00:00Z'),
      mk('d', 'BOOKED', '2026-10-26T09:00:00Z', 'Other Yard'),
    ];
    const { svc, prisma, store } = makeService(rows as any);
    prisma.terminalTruckAppointment.findMany.mockImplementation(async ({ where }: any) => {
      if (where?.status === 'BOOKED' && where?.windowStart) {
        return rows.filter((r) => r.status === 'BOOKED' && r.terminalName === 'Central Terminal' &&
          r.windowStart >= where.windowStart.gte && r.windowStart < where.windowStart.lt);
      }
      return [];
    });
    const res: any = await svc.shiftDay('c1', { terminalName: 'Central Terminal', date: '2026-10-26', shiftMinutes: 120, reason: 'Train late' });
    expect(res.shifted).toBe(1);
    expect((store[0] as any).windowStart.toISOString()).toBe('2026-10-26T10:00:00.000Z');
    expect((store[0] as any).note).toContain('replanned +120m');
    expect((store[1] as any).windowStart.toISOString()).toBe('2026-10-26T08:00:00.000Z');
  });
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
