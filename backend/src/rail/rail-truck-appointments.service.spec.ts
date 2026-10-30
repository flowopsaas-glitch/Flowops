import { RailTruckAppointmentsService } from './rail-truck-appointments.service';

/**
 * Terminal truck appointments: booking, the status flow, the counterparty share
 * link and the measured wait figures.
 *
 * WINDOW CHANGES ARE TESTED ELSEWHERE. Moving or cancelling a published window
 * is a versioned event owned by RailTruckWindowChangesService, so the cut-off
 * governance, supersede, acknowledgement and escalation behaviour lives in
 * rail-truck-window-changes.service.spec.ts. What is asserted here is that this
 * service no longer moves windows itself, and that the surfaces it does own
 * (booking with a resolved driver, the share link's expiry, tenant scoping)
 * behave honestly.
 */
function makeService(rows: any[] = [], drivers: any[] = []) {
  const store = [...rows];
  const changes: any[] = [];
  const prisma: any = {
    company: { findUnique: jest.fn(async () => ({ terminalGateCutoffHours: 2 })) },
    driver: {
      findFirst: jest.fn(async ({ where }: any) =>
        drivers.find((d) => d.id === where.id && d.companyId === where.companyId && d.isActive !== false) ?? null),
    },
    terminalTruckAppointment: {
      findFirst: jest.fn(async ({ where }: any) =>
        where.shareToken
          ? store.find((r) => r.shareToken === where.shareToken) ?? null
          : store.find((r) => r.id === where.id && r.companyId === where.companyId) ?? null),
      findMany: jest.fn(async () => store),
      create: jest.fn(async ({ data }: any) => {
        const r = {
          id: 'a1', status: 'BOOKED', windowVersion: 1, arrivedAt: null, loadingAt: null,
          completedAt: null, driverId: null, shareToken: null, shareTokenExpiresAt: null, ...data,
        };
        store.push(r);
        return r;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const r = store.find((x) => x.id === where.id);
        Object.assign(r, data);
        return r;
      }),
    },
    terminalTruckWindowChange: {
      findFirst: jest.fn(async ({ where }: any) =>
        changes.find((c) => c.appointmentId === where.appointmentId && (!where.status || c.status === where.status)) ?? null),
      findMany: jest.fn(async () => changes),
    },
  };
  return { svc: new RailTruckAppointmentsService(prisma), prisma, store, changes };
}

const dto = {
  terminalName: 'Central Terminal', haulierName: 'Haulier Co', vehicleReg: 'ABC 123',
  windowStart: '2026-10-26T08:00:00.000Z', windowEnd: '2026-10-26T09:00:00.000Z',
};

const row = (over: any = {}) => ({
  id: 'a1', companyId: 'c1', terminalName: 'T', haulierName: 'H', vehicleReg: 'V', status: 'BOOKED',
  windowStart: new Date('2026-10-26T08:00:00Z'), windowEnd: new Date('2026-10-26T09:00:00Z'),
  windowVersion: 1, arrivedAt: null, loadingAt: null, completedAt: null,
  note: null as string | null, shareToken: null as string | null,
  shareTokenIssuedAt: null as Date | null, shareTokenExpiresAt: null as Date | null,
  driverId: null as string | null, driverName: null as string | null, ...over,
});

describe('RailTruckAppointmentsService', () => {
  it('rejects a window whose end is not after its start', async () => {
    const { svc } = makeService();
    await expect(svc.book('c1', { ...dto, windowEnd: dto.windowStart })).rejects.toThrow('windowEnd must be after windowStart');
  });

  it('reports overlapping active appointments instead of hiding them', async () => {
    const existing = row({ id: 'x1', terminalName: 'Central Terminal', haulierName: 'Other', vehicleReg: 'ZZ 9' });
    const { svc, prisma } = makeService([existing]);
    prisma.terminalTruckAppointment.findMany.mockResolvedValue([existing]);
    const created: any = await svc.book('c1', dto);
    expect(created.conflicts).toHaveLength(1);
  });

  it('enforces the status flow and stamps arrival time', async () => {
    const { svc } = makeService([row()]);
    await expect(svc.transition('c1', 'a1', 'COMPLETED')).rejects.toThrow('Cannot move');
    const arrived: any = await svc.transition('c1', 'a1', 'ARRIVED');
    expect(arrived.arrivedAt).toBeInstanceOf(Date);
  });

  it('computes wait only from recorded timestamps — absent data is null, never 0', () => {
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

  it('is tenant-scoped: another company cannot read or transition the appointment', async () => {
    const { svc } = makeService([row()]);
    await expect(svc.transition('other-company', 'a1', 'ARRIVED')).rejects.toThrow('not found');
    await expect(svc.getOne('other-company', 'a1')).rejects.toThrow('not found');
  });

  // A window move is no longer this service's business. These assertions pin
  // that fact: if someone re-adds an in-place reschedule here, a window could
  // move without becoming a versioned, acknowledged event.
  it('exposes no in-place window-mutation method (window changes go through the change service)', () => {
    const { svc } = makeService();
    expect(typeof (svc as any).reschedule).toBe('undefined');
    expect(typeof (svc as any).shiftDay).toBe('undefined');
  });
});

describe('booking with a resolved driver', () => {
  const driver = { id: 'd1', name: 'Thabo M', companyId: 'c1', isActive: true };

  it('resolves driverId against the calling tenant and stores the LOOKED-UP name, not the typed one', async () => {
    const { svc, store } = makeService([], [driver]);
    const created: any = await svc.book('c1', { ...dto, driverId: 'd1', driverName: 'whoever typed this' });
    expect(created.driverId).toBe('d1');
    // A name the system looked up is a fact; a name somebody typed is a claim.
    expect(store[0].driverName).toBe('Thabo M');
  });

  it('rejects a driver id from another tenant rather than linking it', async () => {
    const foreign = { id: 'd9', name: 'Other Co Driver', companyId: 'OTHER', isActive: true };
    const { svc } = makeService([], [foreign]);
    await expect(svc.book('c1', { ...dto, driverId: 'd9' })).rejects.toThrow('not an active driver in your company');
  });

  it('rejects an inactive driver', async () => {
    const inactive = { id: 'd2', name: 'Left', companyId: 'c1', isActive: false };
    const { svc, prisma } = makeService([], [inactive]);
    prisma.driver.findFirst.mockResolvedValue(null);
    await expect(svc.book('c1', { ...dto, driverId: 'd2' })).rejects.toThrow('not an active driver');
  });

  it('books with no driver at all — driverId stays null so the loop can say DRIVER NOT ASSIGNED', async () => {
    const { svc } = makeService();
    const created: any = await svc.book('c1', dto);
    expect(created.driverId).toBeNull();
  });

  it('assignDriver attaches a driver after booking and re-scopes to the tenant', async () => {
    const { svc, store } = makeService([row()], [{ id: 'd1', name: 'Thabo M', companyId: 'c1', isActive: true }]);
    const updated: any = await svc.assignDriver('c1', 'a1', 'd1');
    expect(updated.driverId).toBe('d1');
    expect(store[0].driverName).toBe('Thabo M');
    await expect(svc.assignDriver('other', 'a1', 'd1')).rejects.toThrow('not found');
  });
});

describe('counterparty share link', () => {
  it('issues an EXPIRING token and the shared view exposes no tenant internals', async () => {
    const { svc } = makeService([row({ note: 'internal note', bookedBy: 'ops@x', driverName: 'D' })]);
    const link = await svc.createShareLink('c1', 'a1');
    expect(link.path).toBe(`/gate/${link.token}`);
    // The expiry is what makes this link safe to mutate behind: without it a
    // token in an old email is an immortal unauthenticated credential.
    expect(link.expiresAt).toBeTruthy();
    const issued = Date.parse(link.expiresAt);
    expect(issued).toBeGreaterThan(Date.now());
    expect(issued - Date.now()).toBeLessThanOrEqual(8 * 24 * 3600_000);

    const view: any = await svc.getShared(link.token);
    expect(view.vehicleReg).toBe('V');
    expect(view.companyId).toBeUndefined();
    expect(view.note).toBeUndefined();
    expect(view.bookedBy).toBeUndefined();
    expect(view.driverName).toBeUndefined();
    expect(view.link.canAcknowledge).toBe(true);
    expect(view.link.noExpiryOnRecord).toBe(false);

    await svc.revokeShareLink('c1', 'a1');
    await expect(svc.getShared(link.token)).rejects.toThrow('not found');
  });

  it('refuses an EXPIRED token on read, with a message that says what to do', async () => {
    const past = new Date(Date.now() - 1000);
    const { svc } = makeService([row({ shareToken: 'tok-expired-000000', shareTokenExpiresAt: past })]);
    await expect(svc.getShared('tok-expired-000000')).rejects.toThrow('expired');
  });

  it('a LEGACY token with no expiry still READS but reports that it cannot acknowledge', async () => {
    // Breaking links already sitting in a haulier's inbox would be worse than
    // the risk it closes — so legacy tokens read, and the response says plainly
    // that confirming needs a re-issued link.
    const { svc } = makeService([row({ shareToken: 'tok-legacy-000000', shareTokenIssuedAt: new Date(), shareTokenExpiresAt: null })]);
    const view: any = await svc.getShared('tok-legacy-000000');
    expect(view.vehicleReg).toBe('V');
    expect(view.link.canAcknowledge).toBe(false);
    expect(view.link.noExpiryOnRecord).toBe(true);
    expect(view.link.expiresAt).toBeNull();
  });

  it('refuses a token that is too short to be unguessable', async () => {
    const { svc } = makeService();
    await expect(svc.getShared('short')).rejects.toThrow('not found');
  });

  it('surfaces the ACTIVE window change on the shared view so the counterparty sees old → new', async () => {
    const { svc, changes } = makeService([row({ shareToken: 'tok-valid-00000000', shareTokenExpiresAt: new Date(Date.now() + 86_400_000) })]);
    changes.push({
      id: 'ch1', appointmentId: 'a1', companyId: 'c1', version: 2, status: 'ACTIVE',
      changeKind: 'RESCHEDULED', changedAt: new Date('2026-10-20T06:00:00Z'), reason: 'Train ETA slipped',
      previousWindowStart: new Date('2026-10-26T08:00:00Z'), previousWindowEnd: new Date('2026-10-26T09:00:00Z'),
      newWindowStart: new Date('2026-10-26T12:00:00Z'), newWindowEnd: new Date('2026-10-26T13:00:00Z'),
      recipients: [
        { recipientType: 'HAULIER', ackState: 'UNACKED', ackedAt: null },
        { recipientType: 'DRIVER', ackState: 'UNACKED', ackedAt: null },
      ],
    });
    const view: any = await svc.getShared('tok-valid-00000000');
    expect(view.change.version).toBe(2);
    expect(view.change.reason).toBe('Train ETA slipped');
    expect(view.change.previousWindowText).toContain('08:00');
    expect(view.change.newWindowText).toContain('12:00');
    expect(view.change.acknowledged).toBe(false);
  });

  it('a CANCELLED change exposes no new window — the view must not render a time that does not exist', async () => {
    const { svc, changes } = makeService([row({ shareToken: 'tok-cancel-0000000', shareTokenExpiresAt: new Date(Date.now() + 86_400_000) })]);
    changes.push({
      id: 'ch2', appointmentId: 'a1', companyId: 'c1', version: 1, status: 'ACTIVE',
      changeKind: 'CANCELLED', changedAt: new Date(), reason: 'Terminal closed',
      previousWindowStart: new Date('2026-10-26T08:00:00Z'), previousWindowEnd: new Date('2026-10-26T09:00:00Z'),
      newWindowStart: null, newWindowEnd: null,
      recipients: [{ recipientType: 'HAULIER', ackState: 'UNACKED', ackedAt: null }],
    });
    const view: any = await svc.getShared('tok-cancel-0000000');
    expect(view.change.changeKind).toBe('CANCELLED');
    expect(view.change.newWindow).toBeNull();
    expect(view.change.newWindowText).toBeNull();
  });
});

describe('list surfaces the pending window change without a second round trip', () => {
  it('reports the ACTIVE version and how many reachable recipients have not acknowledged', async () => {
    const { svc, prisma, changes } = makeService([row()]);
    changes.push({
      id: 'ch1', appointmentId: 'a1', version: 3, status: 'ACTIVE', changeKind: 'RESCHEDULED', changedAt: new Date(),
      recipients: [
        { ackState: 'ACKNOWLEDGED', deliveryState: 'DELIVERED' },
        { ackState: 'UNACKED', deliveryState: 'SENT' },
        // Unreachable recipients are not counted as "owing" an ack — nobody can
        // confirm a notification that was never deliverable.
        { ackState: 'UNACKED', deliveryState: 'UNAVAILABLE' },
      ],
    });
    prisma.terminalTruckWindowChange.findMany.mockResolvedValue(changes);
    const rows: any = await svc.list('c1');
    expect(rows[0].pendingWindowChange).toEqual({ id: 'ch1', version: 3, unacked: 1 });
  });

  it('an appointment with no change reports null, not a zero version', async () => {
    const { svc, prisma } = makeService([row()]);
    prisma.terminalTruckWindowChange.findMany.mockResolvedValue([]);
    const rows: any = await svc.list('c1');
    expect(rows[0].pendingWindowChange).toBeNull();
  });
});

describe('the share token is a capability, so it never leaves in a row', () => {
  /**
   * `GET /rail/truck-appointments` is served to every rail READ role, VIEWER
   * included, and a share token in that payload is not a display field: it is a
   * bearer credential that reads the appointment with no login
   * (`GET public/:token`) and acknowledges a window change with no login
   * (`POST public/:token/ack`). A read-only user who could copy it out of a list
   * response could confirm a change the role model says they may not — so the
   * token is asserted ABSENT from every row-shaped response, and the link's
   * STATE (which is what the terminal actually needs) is asserted present.
   */
  const linked = (over: any = {}) =>
    row({
      shareToken: 'tok_live_0123456789abcdef',
      shareTokenIssuedAt: new Date('2026-10-28T06:00:00Z'),
      shareTokenExpiresAt: new Date('2026-11-04T06:00:00Z'),
      ...over,
    });
  const NOW = new Date('2026-10-29T00:00:00Z');

  it('list() reports a valid link without handing over the credential', async () => {
    const { svc, store } = makeService([linked()]);

    const rows: any = await svc.list('c1', undefined, NOW);

    expect(rows).toHaveLength(1);
    expect(Object.prototype.hasOwnProperty.call(rows[0], 'shareToken')).toBe(false);
    expect(JSON.stringify(rows[0])).not.toContain('tok_live_0123456789abcdef');
    // The terminal still sees everything it needs to govern the link.
    expect(rows[0].shareLink).toMatchObject({
      state: 'VALID',
      legacy: false,
      canAcknowledge: true,
      issuedAt: '2026-10-28T06:00:00.000Z',
      expiresAt: '2026-11-04T06:00:00.000Z',
    });
    // Redaction is a view concern: the stored record keeps its token, so the
    // link still works for the haulier holding it.
    expect(store[0].shareToken).toBe('tok_live_0123456789abcdef');
  });

  it('list() still flags a legacy link as legacy — the warning is the point, the token is not', async () => {
    const { svc } = makeService([linked({ shareToken: 'tok_legacy_0123456789', shareTokenExpiresAt: null })]);

    const rows: any = await svc.list('c1', undefined, NOW);

    expect(Object.prototype.hasOwnProperty.call(rows[0], 'shareToken')).toBe(false);
    expect(rows[0].shareLink.legacy).toBe(true);
    expect(rows[0].shareLink.canAcknowledge).toBe(false);
    expect(rows[0].shareLink.warning).toContain('LEGACY LINK');
  });

  it('getOne() carries no token, so no controller can spread one into a response', async () => {
    const { svc } = makeService([linked()]);

    const one: any = await svc.getOne('c1', 'a1');

    expect(Object.prototype.hasOwnProperty.call(one, 'shareToken')).toBe(false);
    expect(one.id).toBe('a1');
    expect(one.status).toBe('BOOKED');
  });

  it('a status transition response carries no token', async () => {
    const { svc } = makeService([linked()]);

    const arrived: any = await svc.transition('c1', 'a1', 'ARRIVED');

    expect(Object.prototype.hasOwnProperty.call(arrived, 'shareToken')).toBe(false);
    expect(arrived.arrivedAt).toBeInstanceOf(Date);
  });

  it('assigning a driver response carries no token', async () => {
    const { svc } = makeService([linked()], [{ id: 'd1', name: 'Driver One', companyId: 'c1', isActive: true }]);

    const updated: any = await svc.assignDriver('c1', 'a1', 'd1');

    expect(Object.prototype.hasOwnProperty.call(updated, 'shareToken')).toBe(false);
    expect(updated.driverId).toBe('d1');
    expect(updated.driverName).toBe('Driver One');
  });

  it('booking carries no token key at all', async () => {
    const { svc } = makeService();

    const created: any = await svc.book('c1', dto);

    expect(Object.prototype.hasOwnProperty.call(created, 'shareToken')).toBe(false);
    expect(created.shareLink).toBeUndefined();
  });

  it('createShareLink is the one response that returns a token, and revoke clears the record', async () => {
    const { svc, store } = makeService([row()]);

    const issued: any = await svc.createShareLink('c1', 'a1');

    expect(typeof issued.token).toBe('string');
    expect(issued.token.length).toBeGreaterThanOrEqual(24);
    expect(issued.path).toBe(`/gate/${issued.token}`);
    expect(new Date(issued.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(store[0].shareToken).toBe(issued.token);

    await svc.revokeShareLink('c1', 'a1');
    expect(store[0].shareToken).toBeNull();
    expect(store[0].shareTokenExpiresAt).toBeNull();

    // A revoked link reads as ABSENT — the counterparty has no view at all.
    const rows: any = await svc.list('c1', undefined, NOW);
    expect(rows[0].shareLink.state).toBe('ABSENT');
    expect(Object.prototype.hasOwnProperty.call(rows[0], 'shareToken')).toBe(false);
  });
});
