import { TruckWindowAckSource, TruckWindowChangeKind, UserRole } from '@prisma/client';
import type { RailActor } from './rail-audit';
import { RailTruckWindowChangesService } from './rail-truck-window-changes.service';

/**
 * The terminal truck window-change closed loop.
 *
 * Everything the operator's rule demands is asserted here against an in-memory
 * database double: a window change is a versioned event, the previous version is
 * visibly SUPERSEDED and never overwritten, only one version is ACTIVE at a
 * time, both the haulier organisation and the assigned driver are addressed (or
 * their absence is stated), delivery states only ever claim what was observed,
 * acknowledgement is per recipient and idempotent, escalation moves on the
 * clock, and the KPIs report n and a denominator rather than a flattering
 * number.
 *
 * The double implements the slice of Prisma this service actually uses
 * (`where` equality / in / gte-lte / insensitive equals / relation `some`,
 * `include`, `orderBy`, `take`, `updateMany`, `aggregate._max`, composite
 * `upsert`) and applies the same column defaults the schema declares, so a
 * missing default here cannot hide a real bug.
 */

// ── In-memory database double ────────────────────────────────────────────────

type Row = Record<string, any>;

interface Db {
  appointments: Row[];
  changes: Row[];
  recipients: Row[];
  policies: Row[];
  drivers: Row[];
  outbox: Row[];
}

function makeDb(): Db {
  return { appointments: [], changes: [], recipients: [], policies: [], drivers: [], outbox: [] };
}

function relationRows(db: Db, key: string, row: Row): Row[] {
  if (key === 'recipients') return db.recipients.filter((r) => r.changeId === row.id);
  if (key === 'appointment') return db.appointments.filter((a) => a.id === row.appointmentId);
  if (key === 'driver') return db.drivers.filter((d) => d.id === row.driverId);
  return [];
}

function looseEqual(a: any, b: any): boolean {
  if (a instanceof Date || b instanceof Date) return new Date(a).getTime() === new Date(b).getTime();
  return a === b;
}

function compareScalar(value: any, cond: any): boolean {
  const t = (v: any) => (v instanceof Date ? v.getTime() : v);
  const x = t(value);
  if ('equals' in cond) {
    const expected = cond.equals;
    if (cond.mode === 'insensitive' && typeof x === 'string' && typeof expected === 'string') {
      if (x.toLowerCase() !== expected.toLowerCase()) return false;
    } else if (!looseEqual(value, expected)) return false;
  }
  if ('gte' in cond && !(x >= t(cond.gte))) return false;
  if ('gt' in cond && !(x > t(cond.gt))) return false;
  if ('lte' in cond && !(x <= t(cond.lte))) return false;
  if ('lt' in cond && !(x < t(cond.lt))) return false;
  if ('not' in cond && looseEqual(value, cond.not)) return false;
  return true;
}

const SCALAR_OPS = ['equals', 'gte', 'gt', 'lte', 'lt', 'not'];

/** Match the subset of Prisma's `where` syntax the service actually uses. */
function matches(row: Row, where: any, db: Db): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries<any>(where)) {
    if (cond === undefined) continue;
    if (cond === null) {
      if (row[key] !== null && row[key] !== undefined) return false;
      continue;
    }
    if (typeof cond === 'object' && !Array.isArray(cond) && !(cond instanceof Date)) {
      if ('in' in cond) {
        if (!cond.in.includes(row[key])) return false;
        continue;
      }
      if ('some' in cond) {
        if (!relationRows(db, key, row).some((r) => matches(r, cond.some, db))) return false;
        continue;
      }
      if (SCALAR_OPS.some((op) => op in cond)) {
        if (!compareScalar(row[key], cond)) return false;
        continue;
      }
      // Otherwise a nested relation-object filter.
      const related = relationRows(db, key, row);
      if (!related.length || !related.some((r) => matches(r, cond, db))) return false;
      continue;
    }
    if (!looseEqual(row[key], cond)) return false;
  }
  return true;
}

function applyOrder(rows: Row[], orderBy: any): Row[] {
  if (!orderBy) return rows;
  const entries = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const entry of entries) {
      for (const [field, dir] of Object.entries<any>(entry)) {
        const av = a[field] instanceof Date ? (a[field] as Date).getTime() : a[field];
        const bv = b[field] instanceof Date ? (b[field] as Date).getTime() : b[field];
        if (av === bv) continue;
        return dir === 'desc' ? -(av > bv ? 1 : -1) : (av > bv ? 1 : -1);
      }
    }
    return 0;
  });
}

/** Attach the relations the service asks for via `include`. */
function withIncludes(row: Row, include: any, db: Db): Row {
  if (!include || !row) return row;
  const out: Row = { ...row };
  if (include.recipients) out.recipients = db.recipients.filter((r) => r.changeId === row.id);
  if (include.appointment) out.appointment = db.appointments.find((a) => a.id === row.appointmentId) ?? null;
  if (include.driver) out.driver = db.drivers.find((d) => d.id === row.driverId) ?? null;
  return out;
}

/** Column defaults the schema declares, so a fresh row looks like Postgres'. */
const DEFAULTS: Record<string, Row> = {
  recipients: {
    escalation: 'NONE', ackState: 'UNACKED', deliveryState: 'QUEUED', deliveryChannels: [],
    deliveryDetail: [], deliveryReason: null, dispatchedAt: null, deliveredAt: null,
    ackedAt: null, ackDeviceAt: null, ackSource: null, ackedByLabel: null, ackIdempotencyKey: null,
    reminderSentAt: null, escalatedAt: null, driverId: null,
  },
  changes: {
    status: 'ACTIVE', activeAppointmentId: null, supersededAt: null, supersededById: null,
    idempotencyKey: null, reason: null, newWindowStart: null, newWindowEnd: null,
    changedById: null, changedByEmail: null, changedByRole: null, forced: false,
    insideCutoff: false, windowAlreadyClosed: false,
  },
};

/**
 * A real Prisma write is a round trip: it cannot mutate the object the caller
 * is holding before the caller's next statement runs. The double yields to the
 * microtask queue for the same reason — otherwise `refreshEscalation`'s audit
 * entry would be built after the row it describes had already been rewritten,
 * and the test would assert on an artefact of the mock.
 */
const roundTrip = () => Promise.resolve();

function table(db: Db, key: keyof Db, idPrefix: string, seq: { n: number }) {
  const rows = () => db[key] as Row[];
  const defaults = DEFAULTS[key as string] ?? {};
  const build = (data: Row) => ({
    id: data.id ?? `${idPrefix}${(seq.n += 1)}`,
    createdAt: new Date(), updatedAt: new Date(), ...defaults, ...data,
  });
  return {
    findFirst: jest.fn(async ({ where, orderBy, include }: any = {}) => {
      const found = applyOrder(rows().filter((r) => matches(r, where, db)), orderBy)[0];
      return found ? withIncludes(found, include, db) : null;
    }),
    findMany: jest.fn(async ({ where, orderBy, include, take }: any = {}) => {
      let out = applyOrder(rows().filter((r) => matches(r, where, db)), orderBy);
      if (typeof take === 'number') out = out.slice(0, take);
      return out.map((r) => withIncludes(r, include, db));
    }),
    create: jest.fn(async ({ data }: any) => {
      await roundTrip();
      const row = build(data);
      rows().push(row);
      return row;
    }),
    createMany: jest.fn(async ({ data }: any) => {
      await roundTrip();
      for (const d of data) rows().push(build(d));
      return { count: data.length };
    }),
    update: jest.fn(async ({ where, data }: any) => {
      await roundTrip();
      const row = rows().find((r) => matches(r, where, db));
      if (!row) throw Object.assign(new Error('Record to update does not exist.'), { code: 'P2025' });
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      await roundTrip();
      const hit = rows().filter((r) => matches(r, where, db));
      for (const row of hit) Object.assign(row, data, { updatedAt: new Date() });
      return { count: hit.length };
    }),
    upsert: jest.fn(async ({ where, create, update }: any) => {
      await roundTrip();
      const composite = where?.companyId_terminalName;
      const existing = rows().find((r) => (composite
        ? r.companyId === composite.companyId && r.terminalName === composite.terminalName
        : matches(r, where, db)));
      if (existing) { Object.assign(existing, update, { updatedAt: new Date() }); return existing; }
      const row = build(create);
      rows().push(row);
      return row;
    }),
    aggregate: jest.fn(async ({ where, _max }: any = {}) => {
      const hit = rows().filter((r) => matches(r, where, db));
      const out: Row = {};
      for (const field of Object.keys(_max ?? {})) {
        out[field] = hit.length ? hit.reduce((m, r) => (r[field] > m ? r[field] : m), hit[0][field]) : null;
      }
      return { _max: out };
    }),
  };
}

interface Harness {
  svc: RailTruckWindowChangesService;
  db: Db;
  prisma: any;
  /** The tx client `withTenant` hands the callback — asserted against directly. */
  tx: any;
  gateway: any;
  push: any;
  notifications: any;
  outbox: any;
  audit: any;
  audits: Row[];
}

function makeHarness(over: {
  cutoffHours?: number;
  pushEnabled?: boolean;
  pushSubscriptions?: number;
  pushAccepted?: number;
  socketReceipts?: number;
  socketConnected?: number;
} = {}): Harness {
  const db = makeDb();
  const seq = { n: 0 };
  const audits: Row[] = [];

  const tx: any = {
    company: { findUnique: jest.fn(async () => ({ terminalGateCutoffHours: over.cutoffHours ?? 2 })) },
    driver: table(db, 'drivers', 'd', seq),
    terminalTruckAppointment: table(db, 'appointments', 'a', seq),
    terminalTruckWindowChange: table(db, 'changes', 'ch', seq),
    terminalTruckWindowRecipient: table(db, 'recipients', 'rc', seq),
    terminalGatePolicy: table(db, 'policies', 'gp', seq),
    outboxEvent: {
      create: jest.fn(async ({ data }: any) => {
        await roundTrip();
        const row = { id: `ob${(seq.n += 1)}`, ...data };
        db.outbox.push(row);
        return row;
      }),
    },
  };
  const prisma: any = {
    ...tx,
    // withTenant opens the RLS context and hands the callback a tx client; the
    // double hands back the same tables, which is what the real tx client is.
    withTenant: jest.fn(async (_companyId: string, fn: (t: any) => Promise<any>) => fn(tx)),
  };

  const gateway = {
    emitToCompany: jest.fn(),
    emitToCompanyWithReceipt: jest.fn(async () => ({
      dispatched: true,
      connectedClients: over.socketConnected ?? 0,
      receipts: over.socketReceipts ?? 0,
    })),
  };
  const push = {
    enabled: over.pushEnabled ?? false,
    wakeDriver: jest.fn(async () => ({
      enabled: over.pushEnabled ?? false,
      subscriptions: over.pushSubscriptions ?? 0,
      accepted: over.pushAccepted ?? 0,
      failed: 0,
      pruned: 0,
    })),
  };
  const notifications = { broadcast: jest.fn(async () => ({ id: 'n1' })) };
  const outbox = {
    // The real OutboxService writes through the passed client; the double
    // records the event name so tests can assert the webhook rail was used.
    enqueue: jest.fn(async (writer: any, companyId: string, event: string, payload: any) => {
      await writer.outboxEvent.create({ data: { companyId, event, payload: JSON.stringify(payload) } });
      return 'ob1';
    }),
  };
  const audit = {
    record: jest.fn(async (entry: any) => {
      audits.push(entry);
      return `log${audits.length}`;
    }),
  };

  const svc = new RailTruckWindowChangesService(
    prisma, audit as any, gateway as any, push as any, notifications as any, outbox as any,
  );
  return { svc, db, prisma, tx, gateway, push, notifications, outbox, audit, audits };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * The actor used throughout: a MANAGER, i.e. somebody who holds the dedicated
 * window-change permission. A dispatcher is deliberately NOT the default here —
 * moving a published gate window is terminal-side authority, and the suite has
 * its own cases proving a DISPATCH user is refused.
 */
const ACTOR: RailActor = { id: 'u1', email: 'ops@terminal.co.za', name: 'Ops', role: UserRole.MANAGER };
/** A haulier-side dispatcher: may read and confirm, may NOT move a window. */
const DISPATCHER: RailActor = { id: 'u2', email: 'dispatch@haulier.co.za', name: 'Dispatch', role: UserRole.DISPATCH };

const hours = (h: number) => new Date(Date.now() + h * 3600_000);
const minutes = (m: number) => new Date(Date.now() + m * 60_000);

/** A BOOKED window three hours out — outside the default 2h cut-off. */
function appointment(over: Row = {}): Row {
  const start = hours(3);
  return {
    id: 'a1', companyId: 'c1', terminalName: 'Central Terminal', haulierName: 'Haulier Co',
    vehicleReg: 'ABC 123', driverName: null, driverId: null, purpose: 'DELIVERY',
    windowStart: start, windowEnd: new Date(start.getTime() + 3600_000),
    windowVersion: 1, status: 'BOOKED', arrivedAt: null, loadingAt: null, completedAt: null,
    note: null, shareToken: null, shareTokenIssuedAt: null, shareTokenExpiresAt: null,
    createdAt: new Date(), updatedAt: new Date(), ...over,
  };
}

/** Publish a plain reschedule three hours out; returns the change view. */
function publish(h: Harness, over: Record<string, any> = {}) {
  return h.svc.publishWindowChange({
    companyId: 'c1', appointmentId: 'a1', kind: TruckWindowChangeKind.RESCHEDULED,
    newWindowStart: hours(5), newWindowEnd: hours(6), actor: ACTOR, ...over,
  });
}

// ── Authority + tenant isolation ─────────────────────────────────────────────

describe('authority and tenant isolation', () => {
  // ── The dedicated window-change permission ────────────────────────────────
  //
  // FlowOps has ONE tenant per deployment, and inside it sit both the
  // terminal-side supervisors and the haulier's dispatch desk. "Has rail write"
  // is therefore not a sufficient authority to move a published gate window —
  // it would let the haulier side re-time the terminal's gate. These cases pin
  // the split down: who may move a window, who may only confirm one, and who
  // gets nothing at all.

  it('a DISPATCH user (haulier-side desk) may NOT publish a window change — 403, audited, nothing written', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment());
    await expect(publish(h, { actor: DISPATCHER })).rejects.toThrow(/window-change permission/);
    expect(h.db.changes).toHaveLength(0);
    expect(h.db.recipients).toHaveLength(0);
    // Not announced to anybody: a refused change is not a change.
    expect(h.gateway.emitToCompanyWithReceipt).not.toHaveBeenCalled();
    expect(h.push.wakeDriver).not.toHaveBeenCalled();
    // The attempt is evidence in its own right.
    const refusal = h.audits.find((a) => a.action === 'truck_window.change_rejected');
    expect(refusal?.metadata).toMatchObject({ code: 'AUTHORITY_DENIED', attemptedRole: 'DISPATCH' });
    expect(refusal?.actorId).toBe('u2');
  });

  it('a VIEWER may NOT publish a window change', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment());
    await expect(publish(h, { actor: { id: 'u3', email: 'v@haulier.co.za', name: 'V', role: UserRole.VIEWER } }))
      .rejects.toThrow(/window-change permission/);
    expect(h.db.changes).toHaveLength(0);
  });

  it('a DRIVER-role tenant user may NOT publish a window change', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment());
    await expect(publish(h, { actor: { id: 'u4', email: 'd@haulier.co.za', name: 'D', role: UserRole.DRIVER } }))
      .rejects.toThrow(/window-change permission/);
    expect(h.db.changes).toHaveLength(0);
  });

  it('a call with NO authenticated tenant user — what a share-token holder would have to be — may NOT publish', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment());
    await expect(publish(h, { actor: null })).rejects.toThrow(/authenticated user of the tenant/);
    expect(h.db.changes).toHaveLength(0);
    // Audited as a system refusal: there is no actor id to attribute it to, and
    // inventing one would be worse than leaving it null.
    const refusal = h.audits.find((a) => a.action === 'truck_window.change_rejected');
    expect(refusal?.metadata).toMatchObject({ code: 'AUTHORITY_DENIED', attemptedRole: null });
    expect(refusal?.actorId ?? null).toBeNull();
  });

  it('authority is checked BEFORE the appointment is read, so a refused caller learns nothing about existence', async () => {
    const h = makeHarness();
    // No appointment in this tenant at all: a DISPATCH caller still gets the
    // authority refusal, not a 404 that would confirm or deny the record.
    await expect(publish(h, { actor: DISPATCHER })).rejects.toThrow(/window-change permission/);
    await expect(publish(h, { appointmentId: 'nope', actor: DISPATCHER })).rejects.toThrow(/window-change permission/);
  });

  it('the same DISPATCH user MAY acknowledge a change on behalf of the haulier organisation', async () => {
    const h = makeHarness();
    const row = appointment({ shareToken: 'tok-dispatch-ack-01', shareTokenExpiresAt: hours(24) });
    h.db.appointments.push(row);
    const change = await publish(h);
    // publish() itself moved the window (that is what it is for); what must not
    // move is the window as it stands when the dispatcher confirms it.
    const windowBefore = { start: h.db.appointments[0].windowStart, end: h.db.appointments[0].windowEnd, version: h.db.appointments[0].windowVersion };
    const res = await h.svc.acknowledge({
      companyId: 'c1', changeId: change.id, source: TruckWindowAckSource.TENANT_USER, actorLabel: DISPATCHER.email,
    });
    expect(res.recipient.ack.state).toBe('ACKNOWLEDGED');
    expect(res.recipient.recipientType).toBe('HAULIER');
    // Confirming is not moving: the window itself is untouched.
    expect(h.db.appointments[0].windowStart).toEqual(windowBefore.start);
    expect(h.db.appointments[0].windowEnd).toEqual(windowBefore.end);
    expect(h.db.appointments[0].windowVersion).toBe(windowBefore.version);
  });

  it('a day replan by a DISPATCH user is refused outright — 403, not a 200 with every truck skipped', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment({ windowStart: new Date('2099-01-02T08:00:00Z'), windowEnd: new Date('2099-01-02T10:00:00Z') }));
    await expect(
      h.svc.replanDay('c1', { terminalName: 'Central Terminal', date: '2099-01-02', shiftMinutes: 30, reason: 'yard congestion' }, DISPATCHER),
    ).rejects.toThrow(/window-change permission/);
    expect(h.db.changes).toHaveLength(0);
    // The window that would have moved did not.
    expect(h.db.appointments[0].windowStart).toEqual(new Date('2099-01-02T08:00:00Z'));
    expect(h.audits.some((a) => a.action === 'truck_window.change_rejected'
      && a.metadata.code === 'AUTHORITY_DENIED'
      && a.metadata.date === '2099-01-02')).toBe(true);
  });

  it('acknowledgement thresholds are governance: a DISPATCH user may not loosen them', async () => {
    const h = makeHarness();
    await expect(
      h.svc.upsertGatePolicy('c1', 'Central Terminal', { ackDueMinutes: 240, reminderAfterMinutes: 120, escalateAfterMinutes: 300 }, DISPATCHER),
    ).rejects.toThrow(/window-change permission/);
    const ok = await h.svc.upsertGatePolicy('c1', 'Central Terminal', { ackDueMinutes: 30, reminderAfterMinutes: 15, escalateAfterMinutes: 45 }, ACTOR);
    expect(ok.ackDueMinutes).toBe(30);
  });

  it('a cancelled BOOKED window published by a DISPATCH user is refused too — cancellation is a window change', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment());
    await expect(
      h.svc.recordCancellation({ companyId: 'c1', appointmentId: 'a1', reason: 'truck broken down', actor: DISPATCHER }),
    ).rejects.toThrow(/window-change permission/);
    expect(h.db.changes).toHaveLength(0);
  });

  it("another tenant's appointment is a 404, not a 403 — existence is not leaked", async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment({ companyId: 'OTHER' }));
    await expect(publish(h)).rejects.toThrow('not found');
    expect(h.db.changes).toHaveLength(0);
  });

  it('nothing is written and nothing is announced when the appointment is not in the tenant', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment({ id: 'a2', companyId: 'OTHER' }));
    await expect(publish(h, { appointmentId: 'a2' })).rejects.toThrow();
    expect(h.db.changes).toHaveLength(0);
    expect(h.db.recipients).toHaveLength(0);
    expect(h.gateway.emitToCompanyWithReceipt).not.toHaveBeenCalled();
  });

  it('an acknowledgement from the wrong tenant cannot find the change', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment());
    const change = await publish(h);
    await expect(
      h.svc.acknowledge({ companyId: 'OTHER', changeId: change.id, source: TruckWindowAckSource.TENANT_USER }),
    ).rejects.toThrow('not found');
    expect(h.db.recipients.every((r) => r.ackState === 'UNACKED')).toBe(true);
  });

  it('a driver who is not the assigned driver is not a recipient of the change', async () => {
    const h = makeHarness();
    h.db.drivers.push({ id: 'd1', name: 'Thabo', companyId: 'c1', isActive: true });
    h.db.appointments.push(appointment({ driverId: 'd1', driverName: 'Thabo' }));
    const change = await publish(h);
    await expect(
      h.svc.acknowledge({
        companyId: 'c1', changeId: change.id, source: TruckWindowAckSource.DRIVER_PORTAL, driverId: 'd999',
      }),
    ).rejects.toThrow('not a recipient');
    // The refusal is itself evidence: somebody tried to confirm somebody else's window.
    expect(h.audits.some((a) => a.action === 'truck_window.ack_rejected' && a.metadata.reason === 'NOT_A_RECIPIENT')).toBe(true);
  });

  it('a driver-portal ack with no driver identity is refused, not attributed to the haulier', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment());
    const change = await publish(h);
    await expect(
      h.svc.acknowledge({ companyId: 'c1', changeId: change.id, source: TruckWindowAckSource.DRIVER_PORTAL }),
    ).rejects.toThrow('Driver identity is required');
    expect(h.db.recipients.every((r) => r.ackState === 'UNACKED')).toBe(true);
  });

  it('a driver row from another tenant resolves to DRIVER NOT ASSIGNED rather than being notified', async () => {
    const h = makeHarness();
    h.db.drivers.push({ id: 'd1', name: 'Foreign', companyId: 'OTHER', isActive: true });
    h.db.appointments.push(appointment({ driverId: 'd1' }));
    const change = await publish(h);
    const driverRow = change.recipients.find((r) => r.recipientType === 'DRIVER')!;
    expect(driverRow.recipientLabel).toBe('DRIVER NOT ASSIGNED');
    expect(driverRow.delivery.state).toBe('UNAVAILABLE');
    expect(driverRow.delivery.reason).toBe('DRIVER_NOT_ASSIGNED');
    expect(h.push.wakeDriver).not.toHaveBeenCalled();
  });
});

// ── The state machine ────────────────────────────────────────────────────────

describe('window-change state machine', () => {
  it('publishes version 1 outside the cut-off with no reason required', async () => {
    const h = makeHarness();
    const from = appointment();
    h.db.appointments.push(from);
    // The fixture object IS the stored row, so read the old window before the
    // change moves it.
    const previousStart = from.windowStart.toISOString();
    const previousEnd = from.windowEnd.toISOString();
    const newStart = hours(5);
    const newEnd = hours(6);
    const change = await publish(h, { newWindowStart: newStart, newWindowEnd: newEnd });

    expect(change.version).toBe(1);
    expect(change.status).toBe('ACTIVE');
    expect(change.forced).toBe(false);
    expect(change.insideCutoff).toBe(false);
    expect(change.cutoffHours).toBe(2);
    expect(change.truckStatusAtChange).toBe('BOOKED');
    expect(change.changedBy).toEqual({ id: 'u1', email: 'ops@terminal.co.za', role: 'MANAGER' });
    // The event keeps the old window; the appointment carries the new one.
    expect(change.previousWindow).toEqual({
      start: previousStart, end: previousEnd, text: expect.stringContaining('UTC'),
    });
    expect(change.newWindow!.start).toBe(newStart.toISOString());
    expect(h.db.appointments[0].windowStart.getTime()).toBe(newStart.getTime());
    expect(h.db.appointments[0].windowEnd.getTime()).toBe(newEnd.getTime());
    expect(h.db.appointments[0].windowVersion).toBe(2);
    // And the note trail says a version happened, without erasing what was there.
    expect(h.db.appointments[0].note).toContain('[window v1');
    expect(h.db.appointments[0].note).toContain('→');
  });

  it('refuses a change inside the cut-off with no reason, and AUDITS the refusal', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment({ windowStart: hours(1), windowEnd: hours(2) }));
    await expect(publish(h, { newWindowStart: hours(3), newWindowEnd: hours(4) })).rejects.toThrow('cut-off');
    expect(h.db.changes).toHaveLength(0);
    expect(h.db.appointments[0].windowVersion).toBe(1);
    const refusal = h.audits.find((a) => a.action === 'truck_window.change_rejected')!;
    expect(refusal.metadata.code).toBe('CUTOFF_NEEDS_FORCE');
    expect(refusal.actorType).toBe('tenant');
  });

  it('allows a forced change inside the cut-off and records the reason on the event', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment({ windowStart: hours(1), windowEnd: hours(2) }));
    const change = await publish(h, {
      newWindowStart: hours(3), newWindowEnd: hours(4), force: true, reason: 'Train ETA slipped',
    });
    expect(change.forced).toBe(true);
    expect(change.insideCutoff).toBe(true);
    expect(change.reason).toBe('Train ETA slipped');
    expect(change.cutoffHours).toBe(2);
  });

  it('a blank reason does not satisfy the cut-off rule', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment({ windowStart: hours(1), windowEnd: hours(2) }));
    await expect(publish(h, {
      newWindowStart: hours(3), newWindowEnd: hours(4), force: true, reason: '   ',
    })).rejects.toThrow('cut-off');
  });

  it('a per-company cut-off is honoured, and a bad value falls back to the default rather than to 0', async () => {
    const h = makeHarness({ cutoffHours: 6 });
    h.db.appointments.push(appointment({ windowStart: hours(5), windowEnd: hours(6) }));
    await expect(publish(h)).rejects.toThrow('6h change cut-off');

    const broken = makeHarness({ cutoffHours: -3 });
    broken.db.appointments.push(appointment({ windowStart: hours(1), windowEnd: hours(2) }));
    // -3 would widen the gate to "always inside the cut-off"; the documented
    // 2h default applies instead.
    await expect(publish(broken)).rejects.toThrow('2h change cut-off');
  });

  it('refuses a new window whose end is not after its start', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment());
    await expect(publish(h, { newWindowStart: hours(6), newWindowEnd: hours(5) }))
      .rejects.toThrow('windowEnd must be after');
  });

  it('refuses a half-specified new window', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment());
    await expect(publish(h, { newWindowStart: hours(6), newWindowEnd: null }))
      .rejects.toThrow('Both a new windowStart and windowEnd');
  });

  it('CHANGE AFTER DEPARTURE: a truck already ARRIVED cannot have its window changed', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment({ status: 'ARRIVED', arrivedAt: new Date() }));
    await expect(publish(h)).rejects.toThrow('Only a BOOKED window can be changed');
    expect(h.db.changes).toHaveLength(0);
    const refusal = h.audits.find((a) => a.action === 'truck_window.change_rejected')!;
    expect(refusal.metadata.code).toBe('NOT_BOOKED');
    expect(refusal.metadata.truckStatus).toBe('ARRIVED');
  });

  it('CHANGE AFTER DEPARTURE: a window that has already closed cannot be republished into the past', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment({ windowStart: hours(-5), windowEnd: hours(-4) }));
    await expect(publish(h)).rejects.toThrow('already closed');
    expect(h.audits.some((a) => a.metadata?.code === 'WINDOW_CLOSED')).toBe(true);
  });

  it('a LOADING truck is refused too — the vehicle is at the gate', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment({ status: 'LOADING', loadingAt: new Date() }));
    await expect(publish(h)).rejects.toThrow('Only a BOOKED window');
  });

  it('a terminal-state appointment (COMPLETED) cannot be changed', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment({ status: 'COMPLETED', completedAt: new Date() }));
    await expect(publish(h)).rejects.toThrow('Only a BOOKED window');
  });

  it('cancelling a window that has ALREADY CLOSED is allowed, and the event records that it was dead', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment({ windowStart: hours(-6), windowEnd: hours(-5) }));
    const change = await h.svc.recordCancellation({
      companyId: 'c1', appointmentId: 'a1', reason: 'Truck never arrived; slot released', force: true, actor: ACTOR,
    });
    expect(change.changeKind).toBe('CANCELLED');
    expect(change.windowAlreadyClosed).toBe(true);
    expect(change.newWindow).toBeNull();
    expect(h.db.appointments[0].status).toBe('CANCELLED');
  });

  it('cancelling a closed window still needs the cut-off reason — a stale slot is not a free pass', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment({ windowStart: hours(-6), windowEnd: hours(-5) }));
    await expect(
      h.svc.recordCancellation({ companyId: 'c1', appointmentId: 'a1', actor: ACTOR }),
    ).rejects.toThrow('cut-off');
    expect(h.db.appointments[0].status).toBe('BOOKED');
    expect(h.db.changes).toHaveLength(0);
  });

  it('cancelling a BOOKED window is a versioned change with NO new window', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment());
    const change = await h.svc.recordCancellation({
      companyId: 'c1', appointmentId: 'a1', reason: 'Terminal closed the gate', force: true, actor: ACTOR,
    });
    expect(change.changeKind).toBe('CANCELLED');
    expect(change.newWindow).toBeNull();
    expect(change.previousWindow.text).toContain('UTC');
    expect(h.db.appointments[0].status).toBe('CANCELLED');
    // The window the truck had is still on the record; only the status moved.
    expect(h.db.appointments[0].windowStart).toBeInstanceOf(Date);
    expect(h.db.appointments[0].note).toContain('CANCELLED');
  });
});

// ── Supersede + "never two active windows" ───────────────────────────────────

describe('supersede: two rapid successive changes', () => {
  async function twoChanges(h: Harness) {
    const original = appointment();
    h.db.appointments.push(original);
    const originalStart = original.windowStart.toISOString();
    const v1Start = hours(5);
    const v1 = await publish(h, { newWindowStart: v1Start, newWindowEnd: hours(6) });
    const v2Start = hours(8);
    const v2 = await publish(h, {
      newWindowStart: v2Start, newWindowEnd: hours(9), reason: 'Crane breakdown',
    });
    return { originalStart, v1, v2, v1Start, v2Start };
  }

  it('versions increment and exactly ONE change stays ACTIVE', async () => {
    const h = makeHarness();
    const { v1, v2 } = await twoChanges(h);
    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    const active = h.db.changes.filter((c) => c.status === 'ACTIVE');
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(v2.id);
  });

  it('the previous version is visibly SUPERSEDED and keeps its own window forever', async () => {
    const h = makeHarness();
    const { originalStart, v1, v2, v1Start, v2Start } = await twoChanges(h);
    const old = h.db.changes.find((c) => c.id === v1.id)!;
    expect(old.status).toBe('SUPERSEDED');
    // This column is what the database's unique index uses to forbid two ACTIVE
    // windows; it must be released on supersede, not left pointing at the row.
    expect(old.activeAppointmentId).toBeNull();
    expect(old.supersededAt).toBeInstanceOf(Date);
    expect(old.supersededById).toBe('u1');
    // Never silently overwritten: v1 still says what the window was before it.
    expect(old.previousWindowStart.toISOString()).toBe(originalStart);
    expect(old.newWindowStart.getTime()).toBe(v1Start.getTime());
    // And v2 records v1's window as ITS previous window — the chain is unbroken.
    const current = h.db.changes.find((c) => c.id === v2.id)!;
    expect(current.previousWindowStart.getTime()).toBe(v1Start.getTime());
    expect(current.newWindowStart.getTime()).toBe(v2Start.getTime());
    expect(current.activeAppointmentId).toBe('a1');
  });

  it("the appointment's window is the ACTIVE version's window", async () => {
    const h = makeHarness();
    const { v2, v2Start } = await twoChanges(h);
    expect(v2.version).toBe(2);
    expect(h.db.appointments[0].windowStart.getTime()).toBe(v2Start.getTime());
    expect(h.db.appointments[0].windowVersion).toBe(3);
  });

  it('history is returned newest-first with superseded versions intact', async () => {
    const h = makeHarness();
    await twoChanges(h);
    const history = await h.svc.listForAppointment('c1', 'a1');
    expect(history.map((c) => c.version)).toEqual([2, 1]);
    expect(history.map((c) => c.status)).toEqual(['ACTIVE', 'SUPERSEDED']);
    expect(history[1].supersededAt).toBeTruthy();
  });

  it('a third change keeps the chain: still one ACTIVE, two SUPERSEDED', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment());
    await publish(h);
    await publish(h, { newWindowStart: hours(8), newWindowEnd: hours(9) });
    const v3 = await publish(h, { newWindowStart: hours(11), newWindowEnd: hours(12), reason: 'Third slip' });
    expect(v3.version).toBe(3);
    expect(h.db.changes.filter((c) => c.status === 'ACTIVE')).toHaveLength(1);
    expect(h.db.changes.filter((c) => c.status === 'SUPERSEDED')).toHaveLength(2);
    expect(h.db.appointments[0].windowVersion).toBe(4);
  });
});

// ── Idempotency ──────────────────────────────────────────────────────────────

describe('idempotency', () => {
  it('a replayed idempotency key returns the ORIGINAL change and publishes no second version', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment());
    const first = await publish(h, { idempotencyKey: 'key-1' });
    const replay = await publish(h, { idempotencyKey: 'key-1' });
    expect(replay.id).toBe(first.id);
    expect(replay.version).toBe(1);
    expect(replay.idempotentReplay).toBe(true);
    expect(h.db.changes).toHaveLength(1);
    // The notification storm must not repeat either.
    expect(h.gateway.emitToCompanyWithReceipt).toHaveBeenCalledTimes(1);
    expect(h.notifications.broadcast).toHaveBeenCalledTimes(1);
    expect(h.db.outbox.filter((o) => o.event === 'rail.truck_window.changed')).toHaveLength(1);
  });

  it('without a key, a second submit is a genuine second version (not silently deduped)', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment());
    const first = await publish(h);
    const second = await publish(h, { newWindowStart: hours(9), newWindowEnd: hours(10) });
    expect(second.version).toBe(2);
    expect(second.id).not.toBe(first.id);
  });

  it('the same key in another tenant is a different key (the unique index is per company)', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment());
    h.db.appointments.push(appointment({ id: 'a2', companyId: 'OTHER' }));
    await publish(h, { idempotencyKey: 'shared-key' });
    const other = await publish(h, { companyId: 'OTHER', appointmentId: 'a2', idempotencyKey: 'shared-key' });
    expect(other.version).toBe(1);
    expect(h.db.changes).toHaveLength(2);
  });

  it('a duplicate acknowledgement returns the original and does NOT move ackedAt', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment());
    const change = await publish(h);
    const t0 = new Date('2026-10-26T10:00:00Z');
    const first = await h.svc.acknowledge({
      companyId: 'c1', changeId: change.id, source: TruckWindowAckSource.TENANT_USER, actorLabel: 'ops@haulier', now: t0,
    });
    expect(first.idempotentReplay).toBe(false);
    const replay = await h.svc.acknowledge({
      companyId: 'c1', changeId: change.id, source: TruckWindowAckSource.TENANT_USER,
      now: new Date('2026-10-26T11:30:00Z'),
    });
    expect(replay.idempotentReplay).toBe(true);
    // Re-stamping would corrupt the latency measurement.
    expect(replay.recipient.ack.ackedAt).toBe(first.recipient.ack.ackedAt);
    expect(replay.recipient.ack.ackedAt).toBe(t0.toISOString());
    expect(h.db.outbox.filter((o) => o.event === 'rail.truck_window.acknowledged')).toHaveLength(1);
  });
});

// ── Propagation + honest delivery states ─────────────────────────────────────

describe('propagation and honest delivery states', () => {
  it('addresses BOTH the haulier organisation and the assigned driver', async () => {
    const h = makeHarness({ pushEnabled: true, pushSubscriptions: 1, pushAccepted: 1 });
    h.db.drivers.push({ id: 'd1', name: 'Thabo M', companyId: 'c1', isActive: true });
    h.db.appointments.push(appointment({ driverId: 'd1', driverName: 'Thabo M' }));
    const change = await publish(h);
    expect(change.recipients.map((r) => r.recipientType).sort()).toEqual(['DRIVER', 'HAULIER']);
    expect(h.push.wakeDriver).toHaveBeenCalledWith('d1');
    const driver = change.recipients.find((r) => r.recipientType === 'DRIVER')!;
    expect(driver.recipientLabel).toBe('Thabo M');
    expect(driver.driverId).toBe('d1');
    expect(change.recipients.find((r) => r.recipientType === 'HAULIER')!.recipientLabel).toBe('Haulier Co');
  });

  it('NO DRIVER: states DRIVER NOT ASSIGNED rather than inventing a recipient', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment());
    const change = await publish(h);
    const driverRow = change.recipients.find((r) => r.recipientType === 'DRIVER')!;
    expect(driverRow.recipientLabel).toBe('DRIVER NOT ASSIGNED');
    expect(driverRow.driverId).toBeNull();
    expect(driverRow.delivery.state).toBe('UNAVAILABLE');
    expect(driverRow.delivery.reason).toBe('DRIVER_NOT_ASSIGNED');
    expect(driverRow.delivery.channels).toEqual(['NONE']);
    expect(driverRow.delivery.dispatchedAt).toBeNull();
    expect(h.push.wakeDriver).not.toHaveBeenCalled();
  });

  it('SENT is not DELIVERED: a realtime emit with no client receipt stays SENT', async () => {
    const h = makeHarness({ socketConnected: 2, socketReceipts: 0 });
    h.db.appointments.push(appointment());
    const change = await publish(h);
    const haulier = change.recipients.find((r) => r.recipientType === 'HAULIER')!;
    const realtime = haulier.delivery.detail.find((d) => d.channel === 'REALTIME')!;
    expect(realtime.state).toBe('SENT');
    expect(realtime.reason).toBe('NO_SOCKET_RECEIPT');
    expect(realtime.detail!).toMatchObject({ connectedClients: 2, receipts: 0 });
    expect(haulier.delivery.deliveredAt).toBeNull();
    expect(haulier.delivery.state).toBe('SENT');
  });

  it('DELIVERED only when a client actually confirmed receipt — and that is still not an acknowledgement', async () => {
    const h = makeHarness({ socketConnected: 1, socketReceipts: 1 });
    h.db.appointments.push(appointment());
    const change = await publish(h);
    const haulier = change.recipients.find((r) => r.recipientType === 'HAULIER')!;
    expect(haulier.delivery.state).toBe('DELIVERED');
    expect(haulier.delivery.deliveredAt).toBeTruthy();
    expect(haulier.ack.state).toBe('UNACKED');
    expect(haulier.ack.ackedAt).toBeNull();
  });

  it('a share link is a PULL channel: PUBLISHED, never SENT', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment({
      shareToken: 'tok-valid-00000000', shareTokenIssuedAt: new Date(),
      shareTokenExpiresAt: hours(24),
    }));
    const change = await publish(h);
    const share = change.recipients.find((r) => r.recipientType === 'HAULIER')!
      .delivery.detail.find((d) => d.channel === 'SHARE_LINK')!;
    expect(share.state).toBe('PUBLISHED');
  });

  it('a LEGACY link with no expiry is published but flagged as unable to confirm', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment({ shareToken: 'tok-legacy-000000', shareTokenExpiresAt: null }));
    const change = await publish(h);
    const share = change.recipients.find((r) => r.recipientType === 'HAULIER')!
      .delivery.detail.find((d) => d.channel === 'SHARE_LINK')!;
    expect(share.state).toBe('PUBLISHED');
    expect(share.reason).toBe('SHARE_LINK_NO_EXPIRY');
  });

  it('an EXPIRED link is UNAVAILABLE, so the counterparty is honestly unreachable that way', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment({ shareToken: 'tok-expired-000000', shareTokenExpiresAt: new Date(Date.now() - 1000) }));
    const change = await publish(h);
    const share = change.recipients.find((r) => r.recipientType === 'HAULIER')!
      .delivery.detail.find((d) => d.channel === 'SHARE_LINK')!;
    expect(share.state).toBe('UNAVAILABLE');
    expect(share.reason).toBe('SHARE_TOKEN_EXPIRED');
  });

  it('no share token at all is UNAVAILABLE with a reason — the haulier has no way to see it', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment({ shareToken: null }));
    const change = await publish(h);
    const share = change.recipients.find((r) => r.recipientType === 'HAULIER')!
      .delivery.detail.find((d) => d.channel === 'SHARE_LINK')!;
    expect(share.state).toBe('UNAVAILABLE');
    expect(share.reason).toBe('NO_SHARE_TOKEN');
  });

  it('push not configured is UNAVAILABLE, not a silent success', async () => {
    const h = makeHarness({ pushEnabled: false });
    h.db.drivers.push({ id: 'd1', name: 'Thabo', companyId: 'c1', isActive: true });
    h.db.appointments.push(appointment({ driverId: 'd1' }));
    const change = await publish(h);
    const driverRow = change.recipients.find((r) => r.recipientType === 'DRIVER')!;
    expect(driverRow.delivery.detail.find((d) => d.channel === 'PUSH')!).toMatchObject({
      state: 'UNAVAILABLE', reason: 'PUSH_NOT_CONFIGURED',
    });
    // The portal is still a live pull channel, so the driver CAN see it — the
    // headline says PUBLISHED, it does not borrow the push channel's absence.
    expect(driverRow.delivery.state).toBe('PUBLISHED');
  });

  it('a driver with no registered device is UNAVAILABLE with NO_PUSH_SUBSCRIPTION', async () => {
    const h = makeHarness({ pushEnabled: true, pushSubscriptions: 0, pushAccepted: 0 });
    h.db.drivers.push({ id: 'd1', name: 'Thabo', companyId: 'c1', isActive: true });
    h.db.appointments.push(appointment({ driverId: 'd1' }));
    const change = await publish(h);
    expect(change.recipients.find((r) => r.recipientType === 'DRIVER')!
      .delivery.detail.find((d) => d.channel === 'PUSH')!).toMatchObject({
      state: 'UNAVAILABLE', reason: 'NO_PUSH_SUBSCRIPTION',
    });
  });

  it('an accepted payload-less push is SENT and is explicitly labelled payloadless', async () => {
    const h = makeHarness({ pushEnabled: true, pushSubscriptions: 2, pushAccepted: 2 });
    h.db.drivers.push({ id: 'd1', name: 'Thabo', companyId: 'c1', isActive: true });
    h.db.appointments.push(appointment({ driverId: 'd1' }));
    const change = await publish(h);
    const push = change.recipients.find((r) => r.recipientType === 'DRIVER')!
      .delivery.detail.find((d) => d.channel === 'PUSH')!;
    expect(push.state).toBe('SENT');
    // A tickle proves the push service accepted a wake-up, never that a device
    // displayed anything — the record says so.
    expect(push.detail!).toMatchObject({ payloadless: true, accepted: 2, subscriptions: 2 });
  });

  it('a push the service rejected is FAILED, and the portal channel still stands', async () => {
    const h = makeHarness({ pushEnabled: true, pushSubscriptions: 1, pushAccepted: 0 });
    h.db.drivers.push({ id: 'd1', name: 'Thabo', companyId: 'c1', isActive: true });
    h.db.appointments.push(appointment({ driverId: 'd1' }));
    const change = await publish(h);
    const driverRow = change.recipients.find((r) => r.recipientType === 'DRIVER')!;
    expect(driverRow.delivery.detail.find((d) => d.channel === 'PUSH')!.state).toBe('FAILED');
    expect(driverRow.delivery.state).toBe('PUBLISHED');
  });

  it('a throwing transport is recorded as FAILED and never breaks the publish', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment());
    h.gateway.emitToCompanyWithReceipt.mockRejectedValue(new Error('socket down'));
    h.push.wakeDriver.mockRejectedValue(new Error('push down'));
    h.notifications.broadcast.mockRejectedValue(new Error('bell down'));
    const change = await publish(h);
    expect(change.version).toBe(1);
    const haulier = change.recipients.find((r) => r.recipientType === 'HAULIER')!;
    expect(haulier.delivery.detail.find((d) => d.channel === 'REALTIME')!).toMatchObject({
      state: 'FAILED', reason: 'REALTIME_EMIT_FAILED',
    });
    expect(haulier.delivery.detail.find((d) => d.channel === 'IN_APP')!.state).toBe('FAILED');
    // The webhook rail was enqueued inside the transaction, so it survives.
    expect(haulier.delivery.state).toBe('SENT');
  });

  it('uses the rails that already exist: outbox webhook, notification bell, company room', async () => {
    const h = makeHarness({ socketConnected: 1, socketReceipts: 1 });
    h.db.appointments.push(appointment());
    await publish(h);
    expect(h.db.outbox.some((o) => o.event === 'rail.truck_window.changed')).toBe(true);
    expect(h.notifications.broadcast).toHaveBeenCalledTimes(1);
    const bell = h.notifications.broadcast.mock.calls[0];
    expect(bell[0]).toBe('c1');
    expect(bell[1]).toContain('Gate window changed (v1)');
    expect(bell[2]).toContain('moved from');
    expect(bell[3]).toBe('TRUCK_WINDOW_CHANGE');
    expect(h.gateway.emitToCompanyWithReceipt.mock.calls[0][1]).toBe('truck-window-changed');
    expect(h.gateway.emitToCompanyWithReceipt.mock.calls[0][0]).toBe('c1');
  });

  it('propagation happens only AFTER the change is committed', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment({ windowStart: hours(-5), windowEnd: hours(-4) }));
    await expect(publish(h)).rejects.toThrow();
    // A change that never happened must never be announced.
    expect(h.gateway.emitToCompanyWithReceipt).not.toHaveBeenCalled();
    expect(h.notifications.broadcast).not.toHaveBeenCalled();
    expect(h.db.outbox).toHaveLength(0);
  });
});

// ── Acknowledgement: separate states, superseded versions ────────────────────

describe('acknowledgement', () => {
  it('a DISPATCHER ack and a DRIVER ack are SEPARATE states', async () => {
    const h = makeHarness({ pushEnabled: true, pushSubscriptions: 1, pushAccepted: 1 });
    h.db.drivers.push({ id: 'd1', name: 'Thabo', companyId: 'c1', isActive: true });
    h.db.appointments.push(appointment({ driverId: 'd1', driverName: 'Thabo' }));
    const change = await publish(h);

    const dispatcherAck = await h.svc.acknowledge({
      companyId: 'c1', changeId: change.id, source: TruckWindowAckSource.TENANT_USER, actorLabel: 'ops@haulier',
    });
    expect(dispatcherAck.recipient.recipientType).toBe('HAULIER');
    expect(dispatcherAck.recipient.ack.state).toBe('ACKNOWLEDGED');

    const reloaded = await h.svc.getChange('c1', change.id);
    const haulier = reloaded.recipients.find((r) => r.recipientType === 'HAULIER')!;
    const driver = reloaded.recipients.find((r) => r.recipientType === 'DRIVER')!;
    // The dispatcher confirming does NOT mean the truck knows.
    expect(haulier.ack.state).toBe('ACKNOWLEDGED');
    expect(driver.ack.state).toBe('UNACKED');

    const driverAck = await h.svc.acknowledge({
      companyId: 'c1', changeId: change.id, source: TruckWindowAckSource.DRIVER_PORTAL, driverId: 'd1',
      actorLabel: 'Thabo',
    });
    expect(driverAck.recipient.recipientType).toBe('DRIVER');
    expect(driverAck.recipient.ack.source).toBe('DRIVER_PORTAL');
    const both = await h.svc.getChange('c1', change.id);
    expect(both.recipients.every((r) => r.ack.state === 'ACKNOWLEDGED')).toBe(true);
    // The board closes when both sides have confirmed.
    expect(h.gateway.emitToCompany).toHaveBeenCalledWith('c1', 'truck-window-acknowledged', expect.objectContaining({
      changeId: change.id, version: 1,
    }));
  });

  it('ACK ON A SUPERSEDED VERSION is refused and points at the current version', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment());
    const v1 = await publish(h);
    const v2 = await publish(h, { newWindowStart: hours(8), newWindowEnd: hours(9), reason: 'Crane breakdown' });

    await expect(
      h.svc.acknowledge({ companyId: 'c1', changeId: v1.id, source: TruckWindowAckSource.TENANT_USER }),
    ).rejects.toThrow(/superseded/i);
    try {
      await h.svc.acknowledge({ companyId: 'c1', changeId: v1.id, source: TruckWindowAckSource.TENANT_USER });
    } catch (e: any) {
      expect(e.message).toContain(`version ${v2.version}`);
      // A client that has to parse a sentence to learn why it was refused will
      // eventually guess wrong. The code travels in the response body, and so
      // does the version that IS current, so an offline driver app can say
      // "not confirmed — confirm v2 instead" without another round trip.
      expect(e.getStatus()).toBe(409);
      expect(e.getResponse()).toMatchObject({ code: 'SUPERSEDED', activeVersion: v2.version });
    }
    // Refusing it is recorded: an ack that cannot be accepted is evidence too.
    expect(h.audits.some((a) => a.action === 'truck_window.ack_rejected' && a.metadata.reason === 'SUPERSEDED')).toBe(true);
    expect(h.db.recipients.filter((r) => r.changeId === v1.id && r.ackState === 'ACKNOWLEDGED')).toHaveLength(0);
    // And the current version is still ackable.
    const ok = await h.svc.acknowledge({ companyId: 'c1', changeId: v2.id, source: TruckWindowAckSource.TENANT_USER });
    expect(ok.recipient.ack.state).toBe('ACKNOWLEDGED');
  });

  it('records the latency from the change to the server-observed ack', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment());
    const change = await publish(h);
    const later = new Date(new Date(change.changedAt).getTime() + 7 * 60_000);
    const ack = await h.svc.acknowledge({
      companyId: 'c1', changeId: change.id, source: TruckWindowAckSource.TENANT_USER, now: later,
    });
    expect(ack.recipient.ack.latencyMinutes).toBe(7);
    expect(ack.recipient.ack.ackedAt).toBe(later.toISOString());
  });

  it('DRIVER OFFLINE AT CHANGE TIME: a device-reported time is stored SEPARATELY and never used as the measurement', async () => {
    const h = makeHarness({ pushEnabled: true, pushSubscriptions: 1, pushAccepted: 1 });
    h.db.drivers.push({ id: 'd1', name: 'Thabo', companyId: 'c1', isActive: true });
    h.db.appointments.push(appointment({ driverId: 'd1' }));
    const change = await publish(h);

    // The driver tapped confirm in a notspot 5 minutes after the change; the
    // offline outbox only flushed 85 minutes after it.
    const deviceAt = new Date(new Date(change.changedAt).getTime() + 5 * 60_000);
    const serverAt = new Date(new Date(change.changedAt).getTime() + 85 * 60_000);
    const ack = await h.svc.acknowledge({
      companyId: 'c1', changeId: change.id, source: TruckWindowAckSource.DRIVER_PORTAL, driverId: 'd1',
      deviceAckedAt: deviceAt, now: serverAt,
    });
    expect(ack.recipient.ack.ackDeviceAt).toBe(deviceAt.toISOString());
    expect(ack.recipient.ack.ackedAt).toBe(serverAt.toISOString());
    // Measurement uses the server-observed time only.
    expect(ack.recipient.ack.latencyMinutes).toBe(85);
    const outboxEvent = h.db.outbox.find((o) => o.event === 'rail.truck_window.acknowledged')!;
    expect(JSON.parse(outboxEvent.payload)).toMatchObject({
      source: 'DRIVER_PORTAL', deviceAckedAt: deviceAt.toISOString(),
    });
  });

  it('a share-token ack is attributed to the CREDENTIAL, not to a person we did not authenticate', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment({
      shareToken: 'tok-valid-00000000', shareTokenIssuedAt: new Date(), shareTokenExpiresAt: hours(24),
    }));
    const change = await publish(h);
    const acked = await h.svc.acknowledgeByShareToken('tok-valid-00000000');
    expect(acked.recipient.ack.source).toBe('SHARE_TOKEN');
    expect(acked.recipient.recipientType).toBe('HAULIER');
    expect(acked.change.id).toBe(change.id);
    const entry = h.audits.find((a) => a.action === 'truck_window.acknowledged')!;
    expect(entry.actorType).toBe('system');
    expect(entry.metadata.source).toBe('SHARE_TOKEN');
    // A credential-holder ack is never written as a named tenant user.
    expect(entry.actorId).toBeNull();
  });

  it('an EXPIRED share token cannot acknowledge', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment({
      shareToken: 'tok-expired-000000', shareTokenExpiresAt: new Date(Date.now() - 1000),
    }));
    await publish(h);
    await expect(h.svc.acknowledgeByShareToken('tok-expired-000000')).rejects.toThrow('expired');
    expect(h.db.recipients.every((r) => r.ackState === 'UNACKED')).toBe(true);
  });

  it('a LEGACY token with no expiry can READ but cannot WRITE — no immortal unauthenticated mutation', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment({
      shareToken: 'tok-legacy-000000', shareTokenIssuedAt: new Date(), shareTokenExpiresAt: null,
    }));
    await publish(h);
    await expect(h.svc.acknowledgeByShareToken('tok-legacy-000000')).rejects.toThrow('before expiry enforcement');
    // But the counterparty can still see what changed.
    const view = await h.svc.sharedChangeView('tok-legacy-000000');
    expect(view.change).not.toBeNull();
    expect(view.link.canAcknowledge).toBe(false);
    expect(view.link.reason).toContain('re-issue');
  });

  it('a revoked or unknown token is a 404', async () => {
    const h = makeHarness();
    await expect(h.svc.acknowledgeByShareToken('tok-nope-000000000')).rejects.toThrow('not found');
    await expect(h.svc.acknowledgeByShareToken('short')).rejects.toThrow('not found');
    await expect(h.svc.sharedChangeView('tok-nope-000000000')).rejects.toThrow('revoked');
  });

  it('a share-token ack with no current change says so instead of inventing one', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment({ shareToken: 'tok-valid-00000000', shareTokenExpiresAt: hours(24) }));
    await expect(h.svc.acknowledgeByShareToken('tok-valid-00000000')).rejects.toThrow('no current window change');
  });

  it('the shared view shows the ACTIVE change, the superseded ones, and leaks no tenant internals', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment({
      shareToken: 'tok-valid-00000000', shareTokenExpiresAt: hours(24),
      note: 'internal: booker is Sipho, credit hold', driverId: 'd1', driverName: 'Thabo',
    }));
    h.db.drivers.push({ id: 'd1', name: 'Thabo', companyId: 'c1', isActive: true });
    await publish(h);
    await publish(h, { newWindowStart: hours(8), newWindowEnd: hours(9), reason: 'Crane breakdown' });

    const view = await h.svc.sharedChangeView('tok-valid-00000000');
    expect(view.change!.version).toBe(2);
    expect(view.change!.reason).toBe('Crane breakdown');
    expect(view.change!.previousWindow.text).toContain('UTC');
    expect(view.change!.acknowledged).toBe(false);
    expect(view.superseded).toHaveLength(1);
    expect(view.superseded[0].version).toBe(1);
    expect(view.link.canAcknowledge).toBe(true);
    expect(view.link.expiresAt).toBeTruthy();
    // Nothing the counterparty should not see.
    const serialised = JSON.stringify(view);
    expect(serialised).not.toContain('c1');
    expect(serialised).not.toContain('Sipho');
    expect(serialised).not.toContain('Thabo');
    expect(serialised).not.toContain('companyId');
  });

  it('an unreachable recipient is never escalated — nobody can ack a notification that was never deliverable', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment()); // no driver, no share token
    const change = await publish(h);
    const driverRow = h.db.recipients.find((r) => r.changeId === change.id && r.recipientType === 'DRIVER')!;
    expect(driverRow.deliveryState).toBe('UNAVAILABLE');
    await h.svc.ackBoard('c1', {}, hours(5));
    expect(h.db.recipients.find((r) => r.id === driverRow.id)!.escalation).toBe('NONE');
    expect(h.audits.some((a) => a.action === 'truck_window.escalated' && a.targetId === driverRow.id)).toBe(false);
  });
});

// ── Escalation ladder ────────────────────────────────────────────────────────

describe('escalation ladder', () => {
  async function withChange(h: Harness, terminalName = 'Central Terminal') {
    h.db.appointments.push(appointment({
      terminalName, shareToken: 'tok-valid-00000000', shareTokenExpiresAt: hours(24),
    }));
    return publish(h);
  }

  it('moves NONE → REMINDER → ESCALATED on the clock, without a cron', async () => {
    const h = makeHarness();
    const change = await withChange(h);
    const haulierId = h.db.recipients.find((r) => r.changeId === change.id && r.recipientType === 'HAULIER')!.id;

    await h.svc.ackBoard('c1', {}, minutes(5));
    expect(h.db.recipients.find((r) => r.id === haulierId)!.escalation).toBe('NONE');

    await h.svc.ackBoard('c1', {}, minutes(20));
    const reminded = h.db.recipients.find((r) => r.id === haulierId)!;
    expect(reminded.escalation).toBe('REMINDER');
    expect(reminded.reminderSentAt).toBeInstanceOf(Date);

    await h.svc.ackBoard('c1', {}, minutes(50));
    const escalated = h.db.recipients.find((r) => r.id === haulierId)!;
    expect(escalated.escalation).toBe('ESCALATED');
    expect(escalated.escalatedAt).toBeInstanceOf(Date);

    // The ladder moving is attributed to the system, not to a person.
    const movements = h.audits.filter((a) => a.action === 'truck_window.escalated');
    expect(movements.map((m) => m.metadata.to)).toEqual(['REMINDER', 'ESCALATED']);
    expect(movements.every((m) => m.actorType === 'system')).toBe(true);
    expect(movements[0].metadata).toMatchObject({ from: 'NONE', to: 'REMINDER', minutesSinceChange: 20 });
    expect(movements[1].metadata).toMatchObject({ from: 'REMINDER', to: 'ESCALATED', minutesSinceChange: 50 });
  });

  it('a per-terminal policy overrides the defaults and is frozen onto the change', async () => {
    const h = makeHarness();
    h.db.policies.push({
      id: 'gp1', companyId: 'c1', terminalName: 'Central Terminal',
      ackDueMinutes: 5, reminderAfterMinutes: 2, escalateAfterMinutes: 4,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const change = await withChange(h);
    const haulier = h.db.recipients.find((r) => r.changeId === change.id && r.recipientType === 'HAULIER')!;
    // ackDueMinutes is frozen onto the recipient at change time.
    expect(haulier.ackDueMinutes).toBe(5);
    await h.svc.ackBoard('c1', {}, minutes(3));
    expect(h.db.recipients.find((r) => r.id === haulier.id)!.escalation).toBe('REMINDER');
    await h.svc.ackBoard('c1', {}, minutes(5));
    expect(h.db.recipients.find((r) => r.id === haulier.id)!.escalation).toBe('ESCALATED');

    // Editing the policy afterwards does not move the DEADLINE this change was
    // published with: the frozen 5 minutes still governs it.
    h.db.policies[0].ackDueMinutes = 600;
    const board = await h.svc.ackBoard('c1', {}, minutes(6));
    expect(board.rows[0].recipients.find((r) => r.recipientType === 'HAULIER')!.escalation.ackDueMinutes).toBe(5);
  });

  it('acknowledging stops the ladder', async () => {
    const h = makeHarness();
    const change = await withChange(h);
    await h.svc.acknowledge({ companyId: 'c1', changeId: change.id, source: TruckWindowAckSource.TENANT_USER });
    await h.svc.ackBoard('c1', {}, minutes(120));
    const haulier = h.db.recipients.find((r) => r.changeId === change.id && r.recipientType === 'HAULIER')!;
    expect(haulier.escalation).toBe('NONE');
    expect(haulier.escalatedAt).toBeNull();
  });

  it('a SUPERSEDED version\'s recipients are not open items', async () => {
    const h = makeHarness();
    const v1 = await withChange(h);
    await publish(h, { newWindowStart: hours(8), newWindowEnd: hours(9), reason: 'Moved again' });
    await h.svc.ackBoard('c1', {}, minutes(120));
    // Only the ACTIVE version is on the board at all.
    const board = await h.svc.ackBoard('c1', {}, minutes(120));
    expect(board.changes).toBe(1);
    expect(board.rows[0].id).not.toBe(v1.id);
    const oldRecipients = h.db.recipients.filter((r) => r.changeId === v1.id);
    expect(oldRecipients.every((r) => r.escalation === 'NONE')).toBe(true);
  });

  it('the board answers "does that truck know?" with counts that match the rows', async () => {
    const h = makeHarness({ pushEnabled: true, pushSubscriptions: 1, pushAccepted: 1 });
    h.db.drivers.push({ id: 'd1', name: 'Thabo', companyId: 'c1', isActive: true });
    h.db.appointments.push(appointment({ driverId: 'd1', driverName: 'Thabo', shareToken: 'tok-valid-00000000', shareTokenExpiresAt: hours(24) }));
    const change = await publish(h);
    await h.svc.acknowledge({ companyId: 'c1', changeId: change.id, source: TruckWindowAckSource.TENANT_USER });

    const board = await h.svc.ackBoard('c1', {}, minutes(20));
    expect(board.changes).toBe(1);
    expect(board.counts.acknowledged).toBe(1);
    expect(board.counts.unacknowledged).toBe(1);
    expect(board.rows[0].recipients.map((r) => r.ack.state).sort()).toEqual(['ACKNOWLEDGED', 'UNACKED']);
    expect(board.rows[0].appointment.vehicleReg).toBe('ABC 123');
    // The summary is computed from the same rows it displays.
    const fromRows = board.rows.flatMap((r) => r.recipients);
    expect(fromRows.filter((r) => r.ack.state === 'ACKNOWLEDGED')).toHaveLength(board.counts.acknowledged);
    expect(fromRows.filter((r) => r.ack.state !== 'ACKNOWLEDGED')).toHaveLength(board.counts.unacknowledged);
    expect(board.source).toContain('this tenant');
    expect(board.computedAt).toBeTruthy();
    // Time since the change is human text, never a bare "0".
    expect(board.rows[0].recipients[0].escalation.sinceChange).toMatch(/min|h/);
  });

  it('the board can be filtered to one terminal', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment({ id: 'a1', terminalName: 'Central Terminal' }));
    h.db.appointments.push(appointment({ id: 'a2', terminalName: 'North Yard' }));
    await publish(h, { appointmentId: 'a1' });
    await publish(h, { appointmentId: 'a2' });
    const central = await h.svc.ackBoard('c1', { terminalName: 'central terminal' });
    expect(central.changes).toBe(1);
    expect(central.rows[0].appointment.terminalName).toBe('Central Terminal');
    expect(central.terminalName).toBe('central terminal');
  });

  it('stale counts reachable unacknowledged recipients past their due time, and keeps unreachable ones out of the blame', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment()); // no share token, no driver
    const change = await publish(h);
    const board = await h.svc.ackBoard('c1', {}, minutes(120));
    // The haulier is reachable (realtime + bell + webhook) and 120 min > 30 min due.
    expect(board.counts.stale).toBe(1);
    expect(board.counts.escalated).toBe(1);
    // The driver row has no channel at all: it is reported, not blamed.
    expect(board.counts.driverNotAssigned).toBe(1);
    expect(board.counts.unreachable).toBe(1);
    // ...and therefore not counted as "has not confirmed": the terminal reads
    // that number as a list of people it still needs to hear from.
    expect(board.counts.unacknowledged).toBe(1);
    expect(board.method).toContain('excluded');
    expect(board.rows[0].recipients.find((r) => r.recipientType === 'DRIVER')!.escalation.overdue).toBe(false);
    expect(change.recipients.find((r) => r.recipientType === 'DRIVER')!.delivery.state).toBe('UNAVAILABLE');
  });
});

// ── Ack-rate denominators: an unfillable obligation is not a failure ─────────

describe('ack-rate denominators', () => {
  it('excludes DRIVER NOT ASSIGNED from the driver denominator and reports it as its own count', async () => {
    const h = makeHarness();
    // A share link makes the haulier reachable; no driver is attached, so the
    // driver row has no channel at all.
    h.db.appointments.push(appointment({ shareToken: 'tok-valid-00000000', shareTokenExpiresAt: hours(24) }));
    const change = await publish(h);
    await h.svc.acknowledge({ companyId: 'c1', changeId: change.id, source: TruckWindowAckSource.TENANT_USER });

    const kpis = await h.svc.kpis('c1');
    expect(kpis.driverNotAssignedChanges).toBe(1);
    // 1 of 1 reachable haulier recipients confirmed.
    expect(kpis.ackRate.HAULIER).toMatchObject({ acknowledged: 1, denominator: 1, unreachable: 0, percentText: '100%' });
    // The driver rate has NO denominator: nothing was deliverable, so there is
    // no rate to report. UNKNOWN, with the absence counted on its own line.
    expect(kpis.ackRate.DRIVER).toMatchObject({
      acknowledged: 0, denominator: 0, unreachable: 1, driverNotAssigned: 1, percent: null, percentText: 'UNKNOWN',
    });
    expect(kpis.ackRate.definition).toContain('excluded');
  });

  it('counts a reachable driver who has not confirmed as NOT acknowledged, not as unreachable', async () => {
    const h = makeHarness({ pushEnabled: true, pushSubscriptions: 1, pushAccepted: 1 });
    h.db.drivers.push({ id: 'd1', name: 'Thabo', companyId: 'c1', isActive: true });
    h.db.appointments.push(appointment({ driverId: 'd1', driverName: 'Thabo' }));
    await publish(h);
    const kpis = await h.svc.kpis('c1');
    expect(kpis.ackRate.DRIVER).toMatchObject({
      acknowledged: 0, notAcknowledged: 1, denominator: 1, unreachable: 0, driverNotAssigned: 0, percentText: '0%',
    });
    expect(kpis.driverNotAssignedChanges).toBe(0);
  });

  it('a change with no share link is still reachable in-tenant; only the driver row drops out', async () => {
    const h = makeHarness();
    // No share link and no driver attached. The HAULIER recipient is still
    // reachable through the tenant's own channels (socket, bell, webhook) —
    // that is who the terminal's own users and the haulier's in-tenant dispatch
    // desk see — so the change stays in the before-arrival denominator. Only
    // the DRIVER recipient has no channel at all, and only it is excluded.
    h.db.appointments.push(appointment({ id: 'a-solo' }));
    const change = await publish(h, { appointmentId: 'a-solo' });
    h.db.appointments[0].arrivedAt = new Date(new Date(change.changedAt).getTime() + 3_600_000);

    const kpis = await h.svc.kpis('c1');
    expect(kpis.ackedBeforeArrival.excludedUnreachable).toBe(0);
    expect(kpis.ackedBeforeArrival.denominator).toBe(1);
    expect(kpis.ackedBeforeArrival.neverAcked).toBe(1);
    expect(kpis.unreachableRecipients).toBe(1);
    expect(kpis.ackRate.HAULIER.denominator).toBe(1);
    expect(kpis.ackRate.DRIVER.denominator).toBe(0);
    // Arrival is terminal-recorded wherever this figure is shown.
    expect(kpis.ackedBeforeArrival.arrivalSource).toContain('TERMINAL-RECORDED');
    expect(kpis.ackedBeforeArrival.arrivalSource).toContain('not GPS');
    expect(kpis.ackedBeforeArrival.definition).toContain('TERMINAL-RECORDED');
  });

  it('keeps the two recipient types in separate denominators — a dispatcher confirming is not a driver confirming', async () => {
    const h = makeHarness({ pushEnabled: true, pushSubscriptions: 1, pushAccepted: 1 });
    h.db.drivers.push({ id: 'd1', name: 'Thabo', companyId: 'c1', isActive: true });
    h.db.appointments.push(appointment({ driverId: 'd1', driverName: 'Thabo', shareToken: 'tok-valid-00000000', shareTokenExpiresAt: hours(24) }));
    const change = await publish(h);
    await h.svc.acknowledge({ companyId: 'c1', changeId: change.id, source: TruckWindowAckSource.TENANT_USER });
    const kpis = await h.svc.kpis('c1');
    expect(kpis.ackRate.HAULIER.percentText).toBe('100%');
    expect(kpis.ackRate.DRIVER.percentText).toBe('0%');
    // One merged number would have read 50% and described neither party.
    expect(kpis.ackLatency.byRecipientType.DRIVER.n).toBe(0);
    expect(kpis.ackLatency.byRecipientType.HAULIER.n).toBe(1);
  });
});

// ── Quiet hours: an urgent gate change is never silently deferred ────────────

describe('an urgent change at night is not deferred', () => {
  // 00:30Z is 02:30 in Africa/Johannesburg — squarely inside the 22:00–07:00
  // quiet window that notification PREFERENCES describe. 08:00Z is 10:00 SAST.
  const NIGHT = new Date('2026-10-29T00:30:00.000Z');
  const DAY = new Date('2026-10-29T08:00:00.000Z');

  async function publishAt(now: Date) {
    const h = makeHarness({ pushEnabled: true, pushSubscriptions: 1, pushAccepted: 1, socketConnected: 1, socketReceipts: 1 });
    h.db.drivers.push({ id: 'd1', name: 'Thabo', companyId: 'c1', isActive: true });
    h.db.appointments.push(appointment({
      driverId: 'd1', driverName: 'Thabo',
      shareToken: 'tok-valid-00000000', shareTokenExpiresAt: new Date(now.getTime() + 24 * 3_600_000),
      windowStart: new Date(now.getTime() + 3 * 3_600_000),
      windowEnd: new Date(now.getTime() + 4 * 3_600_000),
    }));
    const change = await publish(h, {
      now,
      newWindowStart: new Date(now.getTime() + 5 * 3_600_000),
      newWindowEnd: new Date(now.getTime() + 6 * 3_600_000),
    });
    return { h, change };
  }

  const channelsOf = (change: any) => change.recipients
    .flatMap((r: any) => r.delivery.channels.map((c: any) => `${r.recipientType}:${c.channel}:${c.state}`))
    .sort();

  it('reaches every channel at 02:30 exactly as it does at 10:00', async () => {
    const night = await publishAt(NIGHT);
    const day = await publishAt(DAY);

    // Same channels, same observed states — nothing was held back for the night.
    expect(channelsOf(night.change)).toEqual(channelsOf(day.change));

    // The socket, the bell and the push tickle all fired during quiet hours.
    expect(night.h.gateway.emitToCompanyWithReceipt).toHaveBeenCalledTimes(1);
    expect(night.h.notifications.broadcast).toHaveBeenCalledTimes(1);
    expect(night.h.push.wakeDriver).toHaveBeenCalledWith('d1');
    // And the webhook event was enqueued inside the change transaction.
    expect(night.h.outbox.enqueue).toHaveBeenCalled();
  });

  it('stamps dispatch and delivery at the change time, not at the end of quiet hours', async () => {
    const { h, change } = await publishAt(NIGHT);
    const haulier = change.recipients.find((r: any) => r.recipientType === 'HAULIER')!;
    expect(haulier.delivery.dispatchedAt).toBe(NIGHT.toISOString());
    // The socket double returns a receipt, so this is an OBSERVED delivery at
    // 02:30 — not something queued for the morning.
    expect(haulier.delivery.state).toBe('DELIVERED');
    expect(haulier.delivery.deliveredAt).toBe(NIGHT.toISOString());
    const driver = change.recipients.find((r: any) => r.recipientType === 'DRIVER')!;
    expect(driver.delivery.dispatchedAt).toBe(NIGHT.toISOString());
    // No channel in this path reports a deferral, because none is deferred.
    expect(JSON.stringify(change.recipients)).not.toMatch(/DEFERRED|QUIET_HOURS/i);
    expect(h.notifications.broadcast.mock.calls[0][1]).toContain('Gate window changed');
  });

  it('escalates on the same clock at night: the ladder is not paused until morning', async () => {
    const { h, change } = await publishAt(NIGHT);
    // 60 minutes after a 02:30 change is 03:30 — still quiet hours, and still
    // past the 30-minute ack deadline and the 45-minute escalation rung.
    const board = await h.svc.ackBoard('c1', {}, new Date(NIGHT.getTime() + 60 * 60_000));
    const haulier = board.rows.find((r: any) => r.id === change.id)!.recipients
      .find((r: any) => r.recipientType === 'HAULIER')!;
    expect(haulier.escalation.stage).toBe('ESCALATED');
    expect(haulier.escalation.overdue).toBe(true);
    // Both reachable recipients climbed the ladder overnight: the haulier line
    // and the driver line. Nothing waited for 07:00.
    const driver = board.rows.find((r: any) => r.id === change.id)!.recipients
      .find((r: any) => r.recipientType === 'DRIVER')!;
    expect(driver.escalation.stage).toBe('ESCALATED');
    expect(board.counts.escalated).toBe(2);
    expect(board.counts.stale).toBe(2);
    // And the escalation itself was written to the audit log at 03:30.
    const escalations = h.audits.filter((a) => a.action === 'truck_window.escalated');
    expect(escalations.map((a) => a.metadata.to)).toContain('ESCALATED');
  });
});

// ── Day replan ───────────────────────────────────────────────────────────────

describe('day replan', () => {
  const mk = (id: string, status: string, start: string, terminal = 'Central Terminal') => ({
    id, companyId: 'c1', terminalName: terminal, haulierName: 'H', vehicleReg: id, purpose: 'DELIVERY',
    status, windowStart: new Date(start), windowEnd: new Date(new Date(start).getTime() + 3600_000),
    windowVersion: 1, arrivedAt: null, loadingAt: null, completedAt: null, note: null,
    shareToken: null, shareTokenExpiresAt: null, driverId: null, driverName: null,
    createdAt: new Date(), updatedAt: new Date(),
  });

  it('shifts only BOOKED appointments at that terminal on that day, each as its own notified change', async () => {
    const h = makeHarness();
    h.db.appointments.push(
      mk('a', 'BOOKED', '2099-01-02T08:00:00Z'),
      mk('b', 'ARRIVED', '2099-01-02T08:00:00Z'),
      mk('c', 'BOOKED', '2099-01-03T08:00:00Z'),
      mk('d', 'BOOKED', '2099-01-02T09:00:00Z', 'Other Yard'),
    );
    const res: any = await h.svc.replanDay('c1', {
      terminalName: 'Central Terminal', date: '2099-01-02', shiftMinutes: 120, reason: 'Train late',
    }, ACTOR);
    expect(res.shifted).toBe(1);
    expect(res.appointmentIds).toEqual(['a']);
    expect(new Date(h.db.appointments[0].windowStart).toISOString()).toBe('2099-01-02T10:00:00.000Z');
    // b (ARRIVED), c (other day) and d (other terminal) are untouched.
    expect(new Date(h.db.appointments[1].windowStart).toISOString()).toBe('2099-01-02T08:00:00.000Z');
    expect(new Date(h.db.appointments[3].windowStart).toISOString()).toBe('2099-01-02T09:00:00.000Z');
    expect(h.db.changes).toHaveLength(1);
    expect(h.db.changes[0].changeKind).toBe('REPLANNED');
    expect(h.db.changes[0].reason).toBe('Train late');
    // 2099 is far outside the cut-off, so this is an ordinary reasoned change,
    // not a forced late one — the record says which, it does not guess.
    expect(h.db.changes[0].insideCutoff).toBe(false);
    expect(h.db.changes[0].forced).toBe(false);
    // Each affected truck got its own recipient rows.
    expect(h.db.recipients.filter((r) => r.changeId === h.db.changes[0].id)).toHaveLength(2);
    expect(h.audits.some((a) => a.action === 'truck_appointment.day_replanned')).toBe(true);
  });

  it('a replan inside the cut-off is recorded as forced, because the reason is mandatory', async () => {
    const h = makeHarness();
    const start = new Date(Date.now() + 60 * 60_000);
    h.db.appointments.push(mk('a', 'BOOKED', start.toISOString()));
    const res: any = await h.svc.replanDay('c1', {
      terminalName: 'Central Terminal', date: start.toISOString().slice(0, 10), shiftMinutes: 60, reason: 'Loco late',
    }, ACTOR);
    expect(res.shifted).toBe(1);
    expect(h.db.changes[0].insideCutoff).toBe(true);
    expect(h.db.changes[0].forced).toBe(true);
  });

  it('a double-submitted replan cannot publish two versions for the same truck', async () => {
    const h = makeHarness();
    h.db.appointments.push(mk('a', 'BOOKED', '2099-01-02T08:00:00Z'));
    const dto = { terminalName: 'Central Terminal', date: '2099-01-02', shiftMinutes: 120, reason: 'Train late' };
    await h.svc.replanDay('c1', dto, ACTOR, { idempotencyKey: 'replan-run-1' });
    const second: any = await h.svc.replanDay('c1', dto, ACTOR, { idempotencyKey: 'replan-run-1' });
    expect(second.shifted).toBe(1);
    expect(h.db.changes).toHaveLength(1);
    expect(new Date(h.db.appointments[0].windowStart).toISOString()).toBe('2099-01-02T10:00:00.000Z');
    expect(h.db.recipients).toHaveLength(2);
  });

  it('the default replan key is derived from the day and the shift, so a retry of the same run dedupes', async () => {
    const h = makeHarness();
    h.db.appointments.push(mk('a', 'BOOKED', '2099-01-02T08:00:00Z'));
    const dto = { terminalName: 'Central Terminal', date: '2099-01-02', shiftMinutes: 120, reason: 'Train late' };
    await h.svc.replanDay('c1', dto, ACTOR);
    await h.svc.replanDay('c1', dto, ACTOR);
    expect(h.db.changes).toHaveLength(1);
    // A different shift is a different run and does publish again.
    await h.svc.replanDay('c1', { ...dto, shiftMinutes: 60 }, ACTOR);
    expect(h.db.changes).toHaveLength(2);
  });

  it('SKIPS windows that have already closed and reports them, rather than silently replanning part of a day', async () => {
    const h = makeHarness();
    h.db.appointments.push(mk('past', 'BOOKED', '2020-01-02T08:00:00Z'));
    const closed: any = await h.svc.replanDay('c1', {
      terminalName: 'Central Terminal', date: '2020-01-02', shiftMinutes: 60, reason: 'Too late',
    }, ACTOR);
    expect(closed.shifted).toBe(0);
    expect(closed.skipped).toHaveLength(1);
    expect(closed.skipped[0].appointmentId).toBe('past');
    expect(closed.skipped[0].vehicleReg).toBe('past');
    expect(closed.skipped[0].reason).toMatch(/already closed/i);
    expect(h.db.changes).toHaveLength(0);
    // The partial result is audited with both numbers.
    const entry = h.audits.find((a) => a.action === 'truck_appointment.day_replanned')!;
    expect(entry.metadata).toMatchObject({ replanned: 0, skipped: 1 });
  });

  it('reports overlapping windows instead of auto-resolving them', async () => {
    const h = makeHarness();
    h.db.appointments.push(mk('a', 'BOOKED', '2099-01-02T08:00:00Z'));
    h.db.appointments.push(mk('b', 'BOOKED', '2099-01-02T10:00:00Z'));
    const res: any = await h.svc.replanDay('c1', {
      terminalName: 'Central Terminal', date: '2099-01-02', shiftMinutes: 120, reason: 'Train late',
    }, ACTOR);
    expect(res.shifted).toBe(2);
    // 'a' moves onto 10:00, which is where 'b' was — the conflict is surfaced.
    expect(res.withConflicts).toBeGreaterThan(0);
  });

  it('rejects a malformed date, a zero shift and a blank reason', async () => {
    const h = makeHarness();
    await expect(h.svc.replanDay('c1', { terminalName: 'T', date: '2099/01/02', shiftMinutes: 60, reason: 'x' }, ACTOR))
      .rejects.toThrow('YYYY-MM-DD');
    await expect(h.svc.replanDay('c1', { terminalName: 'T', date: '2099-01-02', shiftMinutes: 0, reason: 'x' }, ACTOR))
      .rejects.toThrow('non-zero');
    await expect(h.svc.replanDay('c1', { terminalName: 'T', date: '2099-01-02', shiftMinutes: 60, reason: '  ' }, ACTOR))
      .rejects.toThrow('reason is required');
    expect(h.db.changes).toHaveLength(0);
  });

  it('a replan with no authenticated actor is refused — nothing moves windows except a named person', async () => {
    const h = makeHarness();
    h.db.appointments.push(mk('a', 'BOOKED', '2099-01-02T08:00:00Z'));
    await expect(h.svc.replanDay('c1', {
      terminalName: 'Central Terminal', date: '2099-01-02', shiftMinutes: 60, reason: 'Automated',
    }, null)).rejects.toThrow(/authenticated user of the tenant/);
    expect(h.db.changes).toHaveLength(0);
    expect(h.audits.some((a) => a.action === 'truck_window.change_rejected'
      && a.metadata.code === 'AUTHORITY_DENIED' && a.actorType === 'system')).toBe(true);
  });
});

// ── Measurement ──────────────────────────────────────────────────────────────

describe('measured KPIs', () => {
  it('reports median and P90 WITH n, and UNKNOWN (never 0) when nothing has been acknowledged', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment());
    await publish(h);
    const kpis = await h.svc.kpis('c1');
    expect(kpis.changesExamined).toBe(1);
    expect(kpis.ackLatency.n).toBe(0);
    expect(kpis.ackLatency.medianMinutes).toBeNull();
    expect(kpis.ackLatency.p90Minutes).toBeNull();
    // An absent measurement is UNKNOWN, never 0 — 0 minutes would read as perfect.
    expect(kpis.ackLatency.medianText).toBe('UNKNOWN');
    expect(kpis.ackLatency.p90Text).toBe('UNKNOWN');
    expect(kpis.ackedBeforeArrival.percent).toBeNull();
    expect(kpis.ackedBeforeArrival.percentText).toBe('UNKNOWN');
    expect(kpis.computedAt).toBeTruthy();
  });

  it('computes latency from SERVER-OBSERVED times, nearest-rank, and excludes device-reported ones', async () => {
    const h = makeHarness();
    const lats = [4, 8, 12, 40];
    const changes = [];
    for (let i = 0; i < lats.length; i += 1) {
      const id = `a${i + 1}`;
      h.db.appointments.push(appointment({ id, vehicleReg: `V${i}` }));
      changes.push(await publish(h, {
        appointmentId: id, newWindowStart: hours(5 + i), newWindowEnd: hours(6 + i),
      }));
    }
    for (let i = 0; i < lats.length; i += 1) {
      const ackAt = new Date(new Date(changes[i].changedAt).getTime() + lats[i] * 60_000);
      // A device-reported time far from the server time must not move the number.
      await h.svc.acknowledge({
        companyId: 'c1', changeId: changes[i].id, source: TruckWindowAckSource.TENANT_USER,
        deviceAckedAt: new Date(0), now: ackAt,
      });
    }

    const kpis = await h.svc.kpis('c1');
    expect(kpis.ackLatency.n).toBe(4);
    expect(kpis.ackLatency.medianMinutes).toBe(10);
    // Nearest-rank P90 over [4,8,12,40] is the 4th observation (40), not an
    // interpolation invented between two of them (~34.4).
    expect(kpis.ackLatency.p90Minutes).toBe(40);
    expect(kpis.ackLatency.minMinutes).toBe(4);
    expect(kpis.ackLatency.maxMinutes).toBe(40);
    expect(kpis.ackLatency.byRecipientType.HAULIER.n).toBe(4);
    expect(kpis.ackLatency.byRecipientType.DRIVER.n).toBe(0);
    expect(kpis.ackLatency.byRecipientType.DRIVER.medianMinutes).toBeNull();
    expect(kpis.method).toContain('server-observed');
    expect(kpis.method).toContain('device-reported times are excluded');
    expect(kpis.source).toContain('this tenant only');
  });

  it('"% acked before arrival" carries its denominator and reports exclusions instead of shrinking', async () => {
    const h = makeHarness();
    const ids = ['a1', 'a2', 'a3', 'a4'];
    for (const id of ids) h.db.appointments.push(appointment({ id }));
    const changes = [];
    for (let i = 0; i < ids.length; i += 1) {
      changes.push(await publish(h, {
        appointmentId: ids[i], newWindowStart: hours(5 + i), newWindowEnd: hours(6 + i),
      }));
    }
    const base = new Date(changes[0].changedAt).getTime();
    h.db.appointments[0].arrivedAt = new Date(base + 60 * 60_000);
    h.db.appointments[1].arrivedAt = new Date(base + 10 * 60_000);
    h.db.appointments[2].arrivedAt = new Date(base + 60 * 60_000);
    // a4 has no recorded arrival → excluded, and counted as excluded.

    await h.svc.acknowledge({ companyId: 'c1', changeId: changes[0].id, source: TruckWindowAckSource.TENANT_USER, now: new Date(base + 5 * 60_000) });
    await h.svc.acknowledge({ companyId: 'c1', changeId: changes[1].id, source: TruckWindowAckSource.TENANT_USER, now: new Date(base + 30 * 60_000) });

    const kpis = await h.svc.kpis('c1');
    expect(kpis.ackedBeforeArrival.ackedBeforeArrival).toBe(1);
    expect(kpis.ackedBeforeArrival.ackedAfterArrival).toBe(1);
    expect(kpis.ackedBeforeArrival.neverAcked).toBe(1);
    expect(kpis.ackedBeforeArrival.denominator).toBe(3);
    expect(kpis.ackedBeforeArrival.excludedNoArrival).toBe(1);
    expect(kpis.ackedBeforeArrival.percent).toBe(33.3);
    expect(kpis.ackedBeforeArrival.percentText).toBe('33.3%');
    // The arrival time is terminal-recorded, not GPS, and the figure says so.
    expect(kpis.ackedBeforeArrival.arrivalSource).toContain('arrivedAt');
    expect(kpis.ackedBeforeArrival.arrivalSource).toContain('not GPS');
  });

  it('counts stale unacknowledged changes, and keeps unreachable recipients out of that count', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment({ id: 'a1', shareToken: 'tok-1-valid-0000000', shareTokenExpiresAt: hours(24) }));
    h.db.appointments.push(appointment({ id: 'a2' }));
    const c1 = await publish(h, { appointmentId: 'a1' });
    await publish(h, { appointmentId: 'a2', newWindowStart: hours(7), newWindowEnd: hours(8) });
    await h.svc.acknowledge({ companyId: 'c1', changeId: c1.id, source: TruckWindowAckSource.TENANT_USER });

    const kpis = await h.svc.kpis('c1', {}, hours(3));
    // a1's haulier acknowledged → not stale. a2's haulier did not → stale.
    expect(kpis.staleUnackedChanges).toBe(1);
    // Both appointments have no driver: two recipients nobody could reach.
    expect(kpis.unreachableRecipients).toBe(2);
    expect(kpis.changesExamined).toBe(2);
  });

  it('a date filter narrows the sample and the window is reported with it', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment({ id: 'a1' }));
    h.db.appointments.push(appointment({ id: 'a2' }));
    await publish(h, { appointmentId: 'a1', now: new Date('2026-10-01T08:00:00Z') });
    await publish(h, { appointmentId: 'a2', now: new Date('2026-10-20T08:00:00Z') });
    const kpis = await h.svc.kpis('c1', { from: '2026-10-10T00:00:00Z' });
    expect(kpis.changesExamined).toBe(1);
    expect(kpis.window).toEqual({ from: '2026-10-10T00:00:00Z', to: null });
  });
});

// ── Gate policy ──────────────────────────────────────────────────────────────

describe('per-terminal acknowledgement policy', () => {
  it('upserts a policy, audits it, and reports the defaults when a terminal has none', async () => {
    const h = makeHarness();
    const listed = await h.svc.listGatePolicies('c1');
    expect(listed.defaults).toMatchObject({
      ackDueMinutes: 30, reminderAfterMinutes: 15, escalateAfterMinutes: 45, source: 'DEFAULT',
    });
    expect(listed.policies).toHaveLength(0);

    await h.svc.upsertGatePolicy('c1', 'Central Terminal', {
      ackDueMinutes: 10, reminderAfterMinutes: 5, escalateAfterMinutes: 20,
    }, ACTOR);
    const after = await h.svc.listGatePolicies('c1');
    expect(after.policies).toHaveLength(1);
    expect(after.policies[0]).toMatchObject({ terminalName: 'Central Terminal', ackDueMinutes: 10 });
    const entry = h.audits.find((a) => a.action === 'truck_gate_policy.updated')!;
    expect(entry.actorType).toBe('tenant');
    expect(entry.metadata).toMatchObject({ ackDueMinutes: 10, reminderAfterMinutes: 5, escalateAfterMinutes: 20 });

    // Upsert, not insert-a-second-row.
    await h.svc.upsertGatePolicy('c1', 'Central Terminal', {
      ackDueMinutes: 12, reminderAfterMinutes: 6, escalateAfterMinutes: 24,
    }, ACTOR);
    const twice = await h.svc.listGatePolicies('c1');
    expect(twice.policies).toHaveLength(1);
    expect(twice.policies[0].ackDueMinutes).toBe(12);
  });

  it('refuses a ladder that is out of order', async () => {
    const h = makeHarness();
    await expect(h.svc.upsertGatePolicy('c1', 'T', { ackDueMinutes: 10, reminderAfterMinutes: 20, escalateAfterMinutes: 30 }, ACTOR))
      .rejects.toThrow('reminderAfterMinutes');
    await expect(h.svc.upsertGatePolicy('c1', 'T', { ackDueMinutes: 40, reminderAfterMinutes: 10, escalateAfterMinutes: 30 }, ACTOR))
      .rejects.toThrow('escalateAfterMinutes');
    await expect(h.svc.upsertGatePolicy('c1', '   ', { ackDueMinutes: 10, reminderAfterMinutes: 5, escalateAfterMinutes: 30 }, ACTOR))
      .rejects.toThrow('terminalName is required');
    expect(h.db.policies).toHaveLength(0);
  });

  it('a policy from another tenant never applies', async () => {
    const h = makeHarness();
    h.db.policies.push({
      id: 'gp1', companyId: 'OTHER', terminalName: 'Central Terminal',
      ackDueMinutes: 1, reminderAfterMinutes: 1, escalateAfterMinutes: 1,
      createdAt: new Date(), updatedAt: new Date(),
    });
    expect((await h.svc.listGatePolicies('c1')).policies).toHaveLength(0);
    // And a change in this tenant keeps the documented defaults.
    h.db.appointments.push(appointment({ shareToken: 'tok-valid-00000000', shareTokenExpiresAt: hours(24) }));
    const change = await publish(h);
    expect(h.db.recipients.find((r) => r.changeId === change.id)!.ackDueMinutes).toBe(30);
  });
});

// ── Auditability ─────────────────────────────────────────────────────────────

describe('auditability', () => {
  it('records who changed the window, from what to what, and why', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment());
    await publish(h, { reason: 'Loco late' });
    const entry = h.audits.find((a) => a.action === 'truck_window.changed')!;
    expect(entry).toBeTruthy();
    expect(entry.actorType).toBe('tenant');
    expect(entry.actorId).toBe('u1');
    expect(entry.targetType).toBe('rail_truck_window_change');
    expect(entry.metadata).toMatchObject({
      version: 1, kind: 'RESCHEDULED', reason: 'Loco late', forced: false, insideCutoff: false,
      supersededCount: 0, terminalName: 'Central Terminal', companyId: 'c1', module: 'rail',
    });
    expect(entry.metadata.from).toContain('UTC');
    expect(entry.metadata.to).toContain('UTC');
  });

  it('records the supersede count when a change replaces an ACTIVE version', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment());
    await publish(h);
    await publish(h, { newWindowStart: hours(8), newWindowEnd: hours(9) });
    const entries = h.audits.filter((a) => a.action === 'truck_window.changed');
    expect(entries.map((e) => e.metadata.supersededCount)).toEqual([0, 1]);
    expect(entries[1].metadata.version).toBe(2);
  });

  it('every window movement is attributable to a named person: a null actor is refused, not recorded as "the platform"', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment());
    await expect(publish(h, { actor: null, reason: 'Automated replan' })).rejects.toThrow(/authenticated user of the tenant/);
    expect(h.db.changes).toHaveLength(0);
    // The refusal is audited as a system entry with NO invented actor id: the
    // evidence is that an unattributable attempt was made and refused.
    const entry = h.audits.find((a) => a.action === 'truck_window.change_rejected')!;
    expect(entry.actorType).toBe('system');
    expect(entry.actorId).toBeNull();
    expect(entry.metadata).toMatchObject({ code: 'AUTHORITY_DENIED', attemptedRole: null });
  });

  it('an audit write failure never breaks the window change', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment());
    h.audit.record.mockRejectedValue(new Error('audit down'));
    const change = await publish(h);
    expect(change.version).toBe(1);
    expect(h.db.changes).toHaveLength(1);
  });

  it('the outbox event is written in the SAME transaction as the change', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment());
    await publish(h, { reason: 'Loco late' });
    // The writer handed to the outbox is the tenant tx client, not the root one.
    expect(h.outbox.enqueue.mock.calls[0][0]).toBe(h.tx);
    expect(h.outbox.enqueue.mock.calls[0][0]).not.toBe(h.prisma);
    const event = h.db.outbox.find((o) => o.event === 'rail.truck_window.changed')!;
    expect(JSON.parse(event.payload)).toMatchObject({
      version: 1, changeKind: 'RESCHEDULED', driverAssigned: false, reason: 'Loco late',
      terminalName: 'Central Terminal', vehicleReg: 'ABC 123',
    });
  });
});

// ── Driver portal view ───────────────────────────────────────────────────────

describe('driver gate-window view', () => {
  it('shows the driver their current window, the superseded count, and whether they confirmed', async () => {
    const h = makeHarness({ pushEnabled: true, pushSubscriptions: 1, pushAccepted: 1 });
    h.db.drivers.push({ id: 'd1', name: 'Thabo', companyId: 'c1', isActive: true });
    h.db.appointments.push(appointment({ driverId: 'd1', driverName: 'Thabo' }));
    const v1 = await publish(h);
    await publish(h, { newWindowStart: hours(8), newWindowEnd: hours(9), reason: 'Crane breakdown' });

    const view = await h.svc.driverGateWindows('d1', 'c1');
    expect(view.items).toHaveLength(1);
    const item = view.items[0];
    expect(v1.version).toBe(1);
    expect(item.change!.version).toBe(2);
    expect(item.change!.reason).toBe('Crane breakdown');
    expect(item.change!.acknowledged).toBe(false);
    expect(item.supersededCount).toBe(1);
    expect(item.change!.previousWindow.text).toContain('UTC');
    expect(item.currentWindow.text).toContain('UTC');
    expect(item.change!.acknowledgedAt).toBeNull();
  });

  it('is scoped by tenant AND by driver — another driver sees nothing', async () => {
    const h = makeHarness();
    h.db.drivers.push({ id: 'd1', name: 'Thabo', companyId: 'c1', isActive: true });
    h.db.appointments.push(appointment({ driverId: 'd1' }));
    await publish(h);
    expect((await h.svc.driverGateWindows('d1', 'c1')).items).toHaveLength(1);
    expect((await h.svc.driverGateWindows('d2', 'c1')).items).toHaveLength(0);
    expect((await h.svc.driverGateWindows('d1', 'OTHER')).items).toHaveLength(0);
  });

  it('exposes the device-reported ack time separately from the server time (PENDING SYNC honesty)', async () => {
    const h = makeHarness({ pushEnabled: true, pushSubscriptions: 1, pushAccepted: 1 });
    h.db.drivers.push({ id: 'd1', name: 'Thabo', companyId: 'c1', isActive: true });
    h.db.appointments.push(appointment({ driverId: 'd1' }));
    const change = await publish(h);
    const deviceAt = minutes(2);
    const serverAt = minutes(30);
    await h.svc.acknowledge({
      companyId: 'c1', changeId: change.id, source: TruckWindowAckSource.DRIVER_PORTAL, driverId: 'd1',
      deviceAckedAt: deviceAt, now: serverAt,
    });
    const view = await h.svc.driverGateWindows('d1', 'c1');
    expect(view.items[0].change!.acknowledged).toBe(true);
    expect(view.items[0].change!.acknowledgedDeviceAt).toBe(deviceAt.toISOString());
    expect(view.items[0].change!.acknowledgedAt).toBe(serverAt.toISOString());
  });

  it('a driver with no change still sees their booked window, with change null', async () => {
    const h = makeHarness();
    h.db.drivers.push({ id: 'd1', name: 'Thabo', companyId: 'c1', isActive: true });
    h.db.appointments.push(appointment({ driverId: 'd1' }));
    const view = await h.svc.driverGateWindows('d1', 'c1');
    expect(view.items).toHaveLength(1);
    expect(view.items[0].change).toBeNull();
    expect(view.items[0].supersededCount).toBe(0);
    expect(view.items[0].windowVersion).toBe(1);
  });
});

// ── Tenant context on every write ────────────────────────────────────────────

describe('tenant context on every write (RLS phase-2 ready)', () => {
  it('delivery bookkeeping opens a tenant context and scopes the row by company', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment());
    await publish(h);
    const calls = h.prisma.terminalTruckWindowRecipient.updateMany.mock.calls;
    // One write per recipient (haulier + driver), both after commit.
    expect(calls).toHaveLength(2);
    for (const [args] of calls) expect(args.where.companyId).toBe('c1');
    // Every transaction this service opened was for this tenant.
    expect(h.prisma.withTenant.mock.calls.length).toBeGreaterThan(1);
    expect(h.prisma.withTenant.mock.calls.every(([companyId]: any[]) => companyId === 'c1')).toBe(true);
    // No bare, uncontextualised recipient write anywhere.
    expect(h.prisma.terminalTruckWindowRecipient.update).not.toHaveBeenCalled();
  });

  it('a cross-tenant delivery write cannot land: the row is scoped, not just the context', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment({ companyId: 'OTHER' }));
    await publish(h, { companyId: 'OTHER' });
    const calls = h.prisma.terminalTruckWindowRecipient.updateMany.mock.calls;
    expect(calls).toHaveLength(2);
    for (const [args] of calls) expect(args.where.companyId).toBe('OTHER');
    expect(h.prisma.withTenant.mock.calls.every(([companyId]: any[]) => companyId === 'OTHER')).toBe(true);
  });

  it('escalation movement is persisted inside a tenant transaction, one per company per read', async () => {
    const h = makeHarness();
    h.db.appointments.push(appointment({ shareToken: 'tok-valid-00000000', shareTokenExpiresAt: hours(24) }));
    await publish(h);
    const before = h.prisma.withTenant.mock.calls.length;
    await h.svc.ackBoard('c1', {}, minutes(20));
    // One batch transaction for the whole board, not one per recipient.
    expect(h.prisma.withTenant.mock.calls.length).toBe(before + 1);
    const move = h.prisma.terminalTruckWindowRecipient.updateMany.mock.calls.at(-1)![0];
    expect(move.where.companyId).toBe('c1');
    expect(move.data.escalation).toBe('REMINDER');
    expect(move.data.reminderSentAt).toBeInstanceOf(Date);
  });

  it('the gate policy upsert runs inside the tenant context too', async () => {
    const h = makeHarness();
    await h.svc.upsertGatePolicy('c1', 'Central Terminal', {
      ackDueMinutes: 10, reminderAfterMinutes: 5, escalateAfterMinutes: 20,
    }, ACTOR);
    expect(h.prisma.withTenant.mock.calls).toHaveLength(1);
    expect(h.prisma.withTenant.mock.calls[0][0]).toBe('c1');
    expect(h.db.policies[0].companyId).toBe('c1');
  });
});
