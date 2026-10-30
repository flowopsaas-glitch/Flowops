/**
 * Terminal truck window changes — the closed loop against a real PostgreSQL.
 *
 * The unit suite (rail-truck-window-changes.service.spec.ts) drives the same
 * service through an in-memory double. That proves the state machine; it cannot
 * prove the things only a database can:
 *
 *   • the migration actually created the tables, enums and columns the service
 *     writes, with the RLS posture the platform's phase-1/phase-2 switch needs;
 *   • "never two active windows" is a DATABASE property (a unique index on
 *     `activeAppointmentId`), not a convention a service has to remember;
 *   • the change, its recipients, the outbox event and the audit rows all commit
 *     together, so a crash cannot leave a window moved but unannounced;
 *   • the tenant-isolation guard the new tables are bound to actually refuses a
 *     cross-tenant row when a tenant context is set.
 *
 * NOTE ON RLS ENFORCEMENT: CI's `flowops_test` role is a PostgreSQL superuser,
 * and superusers bypass row-level security even under FORCE. So this spec
 * asserts the CATALOG facts (RLS enabled + forced + a well-formed
 * `tenant_isolation` policy) and evaluates the `app_tenant_guard` function the
 * policies bind to, rather than claiming to have observed the database refuse a
 * row. Saying which of the two was measured is the point.
 */

import { TruckWindowAckSource, TruckWindowChangeKind, UserRole } from '@prisma/client';
import { AuditService } from '../../src/audit/audit.service';
import type { EventsGateway } from '../../src/gateway/events.gateway';
import type { NotificationsService } from '../../src/notifications/notifications.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { PushService } from '../../src/push/push.service';
import { RailTruckWindowChangesService } from '../../src/rail/rail-truck-window-changes.service';
import type { RailActor } from '../../src/rail/rail-audit';
import { OutboxService } from '../../src/webhooks/outbox.service';
import { WebhooksService } from '../../src/webhooks/webhooks.service';
import { seedTenant, truncateAll } from './support/db';
import { createIntegrationDatabase, type IntegrationDatabase } from './support/prisma-client';

jest.setTimeout(90_000);

const NEW_TABLES = [
  'terminal_truck_window_changes',
  'terminal_truck_window_recipients',
  'terminal_gate_policies',
];

/**
 * The integration client is a plain PrismaClient (possibly on the wasm engine).
 * `withTenant` is the one PrismaService method this service needs, so it is
 * attached with exactly PrismaService's implementation — `SET LOCAL` inside a
 * transaction — rather than stubbed.
 */
function withTenantSupport(prisma: any): PrismaService {
  prisma.withTenant = (companyId: string, fn: (tx: any) => Promise<any>, options?: any) => prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
    return fn(tx);
  }, options);
  return prisma as PrismaService;
}

describe('Truck window changes — closed loop (PostgreSQL)', () => {
  let db: IntegrationDatabase;
  let prisma: PrismaService;
  let svc: RailTruckWindowChangesService;
  let gateway: { emitToCompany: jest.Mock; emitToCompanyWithReceipt: jest.Mock };
  let push: { enabled: boolean; wakeDriver: jest.Mock };
  let notifications: { broadcast: jest.Mock };

  let companyId: string;
  let otherCompanyId: string;
  let driverId: string;
  // shareToken is @unique, so every booked appointment needs its own.
  let tokenSeq = 0;
  const actor: RailActor = { id: 'user-ops', email: 'ops@terminal.example', name: 'Terminal manager', role: UserRole.MANAGER };
  const dispatcher: RailActor = { id: 'user-dispatch', email: 'dispatch@haulier.example', name: 'Dispatcher', role: UserRole.DISPATCH };

  beforeAll(async () => {
    db = await createIntegrationDatabase();
    prisma = withTenantSupport(db.prisma);
    // eslint-disable-next-line no-console
    console.log(`[integration] truck window changes engine: ${db.engine}`);
  });

  afterAll(async () => {
    await db?.shutdown();
  });

  beforeEach(async () => {
    await truncateAll(db.prisma);
    ({ companyId } = await seedTenant(db.prisma, 'Gate Tenant'));
    ({ companyId: otherCompanyId } = await seedTenant(db.prisma, 'Other Gate Tenant'));

    const driver = await db.prisma.driver.create({
      data: { companyId, name: 'Thabo Mokoena', phone: '+27820001111' },
    });
    driverId = driver.id;

    gateway = {
      emitToCompany: jest.fn(),
      emitToCompanyWithReceipt: jest.fn(async () => ({ dispatched: true, connectedClients: 1, receipts: 1 })),
    };
    push = { enabled: true, wakeDriver: jest.fn(async () => ({ enabled: true, subscriptions: 1, accepted: 1, failed: 0, pruned: 0 })) };
    notifications = { broadcast: jest.fn(async () => ({ id: 'notification-1' })) };

    svc = new RailTruckWindowChangesService(
      prisma,
      new AuditService(prisma),
      gateway as unknown as EventsGateway,
      push as unknown as PushService,
      notifications as unknown as NotificationsService,
      new OutboxService(prisma, new WebhooksService(prisma)),
    );
  });

  const hoursFrom = (h: number) => new Date(Date.now() + h * 3_600_000);

  async function bookAppointment(over: Record<string, unknown> = {}) {
    const windowStart = hoursFrom(4);
    return db.prisma.terminalTruckAppointment.create({
      data: {
        companyId,
        terminalName: 'Central Terminal',
        haulierName: 'Haulier Co',
        vehicleReg: 'ABC 123 GP',
        driverId,
        driverName: 'Thabo Mokoena',
        purpose: 'DELIVERY',
        status: 'BOOKED',
        windowStart,
        windowEnd: new Date(windowStart.getTime() + 3_600_000),
        shareToken: `integration-token-${String((tokenSeq += 1)).padStart(4, '0')}`,
        shareTokenIssuedAt: new Date(),
        shareTokenExpiresAt: hoursFrom(24 * 7),
        ...over,
      } as any,
    });
  }

  function reschedule(appointmentId: string, over: Record<string, unknown> = {}) {
    return svc.publishWindowChange({
      companyId,
      appointmentId,
      kind: TruckWindowChangeKind.RESCHEDULED,
      newWindowStart: hoursFrom(8),
      newWindowEnd: hoursFrom(9),
      actor,
      ...over,
    });
  }

  // ── The migration ──────────────────────────────────────────────────────────

  it('created the closed-loop tables, and the service can write every column it declares', async () => {
    const appt = await bookAppointment();
    const change = await reschedule(appt.id);

    const rows = await db.prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename::text AS tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename = ANY(${NEW_TABLES}::text[])
      ORDER BY tablename
    `;
    expect(rows.map((r) => r.tablename)).toEqual([...NEW_TABLES].sort());

    const stored = await db.prisma.terminalTruckWindowChange.findUniqueOrThrow({
      where: { id: change.id },
      include: { recipients: true },
    });
    expect(stored).toMatchObject({
      version: 1,
      changeKind: 'RESCHEDULED',
      status: 'ACTIVE',
      activeAppointmentId: appt.id,
      forced: false,
      insideCutoff: false,
      cutoffHours: 2,
      truckStatusAtChange: 'BOOKED',
      changedById: 'user-ops',
      changedByRole: 'MANAGER',
    });
    expect(stored.previousWindowStart).toBeInstanceOf(Date);
    expect(stored.newWindowStart).toBeInstanceOf(Date);
    expect(stored.recipients).toHaveLength(2);
  });

  it('put ENABLE + FORCE row level security and a well-formed tenant_isolation policy on all three tables', async () => {
    const rls = await db.prisma.$queryRaw<Array<{ tablename: string; rowsecurity: boolean; forcerowsecurity: boolean }>>`
      SELECT c.relname::text AS tablename, c.relrowsecurity AS rowsecurity, c.relforcerowsecurity AS forcerowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY(${NEW_TABLES}::text[])
      ORDER BY c.relname
    `;
    expect(rls).toHaveLength(3);
    for (const row of rls) {
      // FORCE matters: without it the table OWNER (the role Prisma connects as,
      // when it is not a superuser) would step over its own policy.
      expect(row.rowsecurity).toBe(true);
      expect(row.forcerowsecurity).toBe(true);
    }

    const policies = await db.prisma.$queryRaw<Array<{ tablename: string; policyname: string; cmd: string; qual: string | null }>>`
      SELECT tablename::text AS tablename, policyname::text AS policyname, cmd::text AS cmd, qual::text AS qual
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = ANY(${NEW_TABLES}::text[])
      ORDER BY tablename
    `;
    expect(policies).toHaveLength(3);
    for (const p of policies) {
      expect(p.policyname).toBe('tenant_isolation');
      expect(p.cmd).toBe('ALL');
      // The same guard function every other tenant table binds to — one
      // definition of the phase-1/phase-2 semantics for the whole database.
      expect(p.qual).toContain('app_tenant_guard');
    }
  });

  it('binds the new tables to the same guard the rest of the platform uses, and that guard refuses a foreign tenant', async () => {
    // Evaluated as a function call, so it holds whatever role the suite runs as
    // (CI's role is a superuser and would bypass policy evaluation entirely).
    const insideContext = await prisma.withTenant(companyId, (tx) => tx.$queryRaw<Array<{ mine: boolean; theirs: boolean }>>`
      SELECT app_tenant_guard(${companyId}) AS mine, app_tenant_guard(${otherCompanyId}) AS theirs
    `);
    expect(insideContext[0]).toEqual({ mine: true, theirs: false });

    // Phase-2 posture: no tenant context at all → nothing is visible.
    const strict = await db.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.rls_strict', 'on', true)`;
      return tx.$queryRaw<Array<{ guard: boolean | null; visible: boolean }>>`
        SELECT app_tenant_guard(${companyId}) AS guard,
               app_tenant_guard(${companyId}) IS TRUE AS visible
      `;
    });
    // SQL's three-valued logic returns NULL here, not false. A row-level
    // policy admits only TRUE, so NULL still denies access; test both facts.
    expect(strict[0]).toEqual({ guard: null, visible: false });
  });

  // ── The database-level "never two active windows" ──────────────────────────

  it('refuses a second ACTIVE window version for the same appointment at the database level', async () => {
    const appt = await bookAppointment();
    await reschedule(appt.id);

    // Not through the service: a raw insert of what a buggy caller would write.
    // The unique index on activeAppointmentId is the only thing standing between
    // "one window in force" and two.
    await expect(
      db.prisma.terminalTruckWindowChange.create({
        data: {
          companyId, appointmentId: appt.id, version: 2,
          changeKind: TruckWindowChangeKind.RESCHEDULED, status: 'ACTIVE', activeAppointmentId: appt.id,
          previousWindowStart: hoursFrom(8), previousWindowEnd: hoursFrom(9),
          newWindowStart: hoursFrom(10), newWindowEnd: hoursFrom(11),
          cutoffHours: 2, truckStatusAtChange: 'BOOKED', changedAt: new Date(),
        } as any,
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    // Superseded rows null the column, and Postgres does not collide NULLs —
    // that is what lets the whole history stay.
    await reschedule(appt.id, { newWindowStart: hoursFrom(12), newWindowEnd: hoursFrom(13), reason: 'Crane breakdown' });
    const active = await db.prisma.terminalTruckWindowChange.count({ where: { appointmentId: appt.id, status: 'ACTIVE' } });
    const superseded = await db.prisma.terminalTruckWindowChange.count({ where: { appointmentId: appt.id, status: 'SUPERSEDED' } });
    expect(active).toBe(1);
    expect(superseded).toBe(1);
  });

  it('enforces the idempotency key per company in the database, not just in the service', async () => {
    const appt = await bookAppointment();
    const first = await reschedule(appt.id, { idempotencyKey: 'run-42' });
    const replay = await reschedule(appt.id, { idempotencyKey: 'run-42' });
    expect(replay.id).toBe(first.id);
    expect(replay.idempotentReplay).toBe(true);
    expect(await db.prisma.terminalTruckWindowChange.count({ where: { appointmentId: appt.id } })).toBe(1);

    await expect(
      db.prisma.terminalTruckWindowChange.create({
        data: {
          companyId, appointmentId: appt.id, version: 99, changeKind: TruckWindowChangeKind.RESCHEDULED,
          status: 'SUPERSEDED', previousWindowStart: hoursFrom(8), previousWindowEnd: hoursFrom(9),
          newWindowStart: hoursFrom(10), newWindowEnd: hoursFrom(11), cutoffHours: 2,
          truckStatusAtChange: 'BOOKED', changedAt: new Date(), idempotencyKey: 'run-42',
        } as any,
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('lets two tenants use the same idempotency key — the constraint is scoped to the company', async () => {
    const appt = await bookAppointment();
    const otherAppt = await db.prisma.terminalTruckAppointment.create({
      data: {
        companyId: otherCompanyId, terminalName: 'North Yard', haulierName: 'Other Haulier',
        vehicleReg: 'XYZ 789 GP', purpose: 'DELIVERY', status: 'BOOKED',
        windowStart: hoursFrom(4), windowEnd: hoursFrom(5),
      } as any,
    });
    await reschedule(appt.id, { idempotencyKey: 'shared-key' });
    const other = await svc.publishWindowChange({
      companyId: otherCompanyId, appointmentId: otherAppt.id, kind: TruckWindowChangeKind.RESCHEDULED,
      newWindowStart: hoursFrom(8), newWindowEnd: hoursFrom(9), actor, idempotencyKey: 'shared-key',
    });
    expect(other.version).toBe(1);
    expect(await db.prisma.terminalTruckWindowChange.count()).toBe(2);
  });

  it('refuses dispatcher window changes, day replans and policy edits', async () => {
    const appt = await bookAppointment();
    await expect(reschedule(appt.id, { actor: dispatcher })).rejects.toThrow(/permission/i);
    await expect(svc.replanDay(companyId, {
      terminalName: 'Central Terminal', date: '2099-03-04', shiftMinutes: 60, reason: 'Late train',
    }, dispatcher)).rejects.toThrow(/permission/i);
    await expect(svc.upsertGatePolicy(companyId, 'Central Terminal', {
      ackDueMinutes: 5, reminderAfterMinutes: 2, escalateAfterMinutes: 4,
    }, dispatcher)).rejects.toThrow(/permission/i);
    expect(await db.prisma.terminalTruckWindowChange.count()).toBe(0);
    expect(await db.prisma.terminalGatePolicy.count()).toBe(0);
  });

  // ── One atomic commit ──────────────────────────────────────────────────────

  it('commits the change, both recipients, the outbox event and the audit trail together', async () => {
    const appt = await bookAppointment();
    const change = await reschedule(appt.id, { reason: 'Locomotive late at the yard' });

    expect(await db.prisma.terminalTruckWindowRecipient.count({ where: { changeId: change.id } })).toBe(2);

    const outbox = await db.prisma.outboxEvent.findMany({ where: { companyId } });
    const published = outbox.find((o) => o.event === 'rail.truck_window.changed');
    expect(published).toBeTruthy();
    expect(JSON.parse(published!.payload)).toMatchObject({
      changeId: change.id, version: 1, changeKind: 'RESCHEDULED', driverAssigned: true,
      reason: 'Locomotive late at the yard',
    });

    const audits = await db.prisma.auditLog.findMany({ where: { action: 'truck_window.changed' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].actorType).toBe('tenant');
    expect(audits[0].actorId).toBe('user-ops');
    expect(audits[0].targetType).toBe('rail_truck_window_change');
    expect(audits[0].metadata).toMatchObject({ version: 1, reason: 'Locomotive late at the yard', companyId });

    // The appointment carries the new window and the incremented version.
    const updated = await db.prisma.terminalTruckAppointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect(updated.windowVersion).toBe(2);
    expect(updated.windowStart.getTime()).toBe(new Date(change.newWindow!.start).getTime());
    expect(updated.note).toContain('[window v1');
  });

  it('leaves nothing behind when the governance refuses the change', async () => {
    // Inside the 2h cut-off with no reason: refused, and audited as refused.
    const appt = await bookAppointment({ windowStart: hoursFrom(1), windowEnd: hoursFrom(2) });
    await expect(reschedule(appt.id)).rejects.toThrow('cut-off');

    expect(await db.prisma.terminalTruckWindowChange.count()).toBe(0);
    expect(await db.prisma.terminalTruckWindowRecipient.count()).toBe(0);
    expect(await db.prisma.outboxEvent.count({ where: { event: 'rail.truck_window.changed' } })).toBe(0);
    expect(await db.prisma.auditLog.count({ where: { action: 'truck_window.change_rejected' } })).toBe(1);
    const untouched = await db.prisma.terminalTruckAppointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect(untouched.windowVersion).toBe(1);
    expect(gateway.emitToCompanyWithReceipt).not.toHaveBeenCalled();
  });

  // ── The whole loop: change → notify → acknowledge → escalate → measure ─────

  it('runs the full loop end to end and measures it', async () => {
    const appt = await bookAppointment();

    // 1. CHANGE
    const change = await reschedule(appt.id, { reason: 'Crane breakdown at the terminal' });
    expect(change.version).toBe(1);

    // 2. NOTIFY — over the rails that already exist, with observed states.
    expect(gateway.emitToCompanyWithReceipt).toHaveBeenCalledTimes(1);
    expect(push.wakeDriver).toHaveBeenCalledWith(driverId);
    expect(notifications.broadcast).toHaveBeenCalledTimes(1);
    const recipients = await db.prisma.terminalTruckWindowRecipient.findMany({ where: { changeId: change.id } });
    const haulier = recipients.find((r) => r.recipientType === 'HAULIER')!;
    const driverRow = recipients.find((r) => r.recipientType === 'DRIVER')!;
    // A socket receipt was observed, so DELIVERED is a fact here — and it is
    // still NOT an acknowledgement.
    expect(haulier.deliveryState).toBe('DELIVERED');
    expect(haulier.deliveredAt).toBeInstanceOf(Date);
    expect(haulier.ackState).toBe('UNACKED');
    expect(driverRow.deliveryState).toBe('SENT');
    expect(driverRow.deliveryChannels).toEqual(expect.arrayContaining(['DRIVER_PORTAL', 'PUSH']));
    expect(JSON.parse(JSON.stringify(driverRow.deliveryDetail))).toEqual(
      expect.arrayContaining([expect.objectContaining({ channel: 'PUSH', state: 'SENT' })]),
    );

    // 3. ACKNOWLEDGE — dispatcher first; the truck still does not know.
    const sevenMinutes = new Date(new Date(change.changedAt).getTime() + 7 * 60_000);
    const dispatcherAck = await svc.acknowledge({
      companyId, changeId: change.id, source: TruckWindowAckSource.TENANT_USER,
      actorLabel: actor.email, now: sevenMinutes,
    });
    expect(dispatcherAck.recipient.recipientType).toBe('HAULIER');
    expect(dispatcherAck.recipient.ack.latencyMinutes).toBe(7);
    const boardMid = await svc.ackBoard(companyId, {}, sevenMinutes);
    expect(boardMid.counts).toMatchObject({ acknowledged: 1, unacknowledged: 1 });

    // 4. The driver's own confirmation is a separate row and a separate time.
    const twentyMinutes = new Date(new Date(change.changedAt).getTime() + 20 * 60_000);
    const driverAck = await svc.acknowledge({
      companyId, changeId: change.id, source: TruckWindowAckSource.DRIVER_PORTAL, driverId,
      deviceAckedAt: new Date(new Date(change.changedAt).getTime() + 3 * 60_000),
      now: twentyMinutes,
    });
    expect(driverAck.recipient.recipientType).toBe('DRIVER');
    expect(driverAck.recipient.ack.latencyMinutes).toBe(20);
    expect(driverAck.recipient.ack.ackDeviceAt).not.toBe(driverAck.recipient.ack.ackedAt);
    const ackOutbox = await db.prisma.outboxEvent.findMany({ where: { event: 'rail.truck_window.acknowledged' } });
    expect(ackOutbox).toHaveLength(2);

    // 5. ESCALATE — with both sides acknowledged, the ladder has nothing to do.
    const boardAfter = await svc.ackBoard(companyId, {}, new Date(new Date(change.changedAt).getTime() + 3 * 3_600_000));
    expect(boardAfter.counts).toMatchObject({ acknowledged: 2, unacknowledged: 0, stale: 0, escalated: 0 });

    // 6. MEASURE — n, median and P90 over the two acknowledgements.
    const kpis = await svc.kpis(companyId);
    expect(kpis.changesExamined).toBe(1);
    expect(kpis.ackLatency).toMatchObject({ n: 2, minMinutes: 7, maxMinutes: 20, medianMinutes: 13.5, p90Minutes: 20 });
    expect(kpis.ackLatency.byRecipientType.HAULIER).toMatchObject({ n: 1, medianMinutes: 7 });
    expect(kpis.ackLatency.byRecipientType.DRIVER).toMatchObject({ n: 1, medianMinutes: 20 });
    // No arrival was recorded, so the arrival figure is excluded, not zero.
    expect(kpis.ackedBeforeArrival).toMatchObject({ denominator: 0, excludedNoArrival: 1, percent: null });
  });

  it('escalates an unacknowledged change on the clock and persists the movement', async () => {
    const appt = await bookAppointment();
    const change = await reschedule(appt.id);

    const at = (m: number) => new Date(new Date(change.changedAt).getTime() + m * 60_000);

    await svc.ackBoard(companyId, {}, at(5));
    let rows = await db.prisma.terminalTruckWindowRecipient.findMany({ where: { changeId: change.id } });
    expect(rows.map((r) => r.escalation).sort()).toEqual(['NONE', 'NONE']);

    await svc.ackBoard(companyId, {}, at(20));
    rows = await db.prisma.terminalTruckWindowRecipient.findMany({ where: { changeId: change.id } });
    // The haulier is reachable and gets the reminder; the driver is reachable
    // through the portal + push, so it escalates on the same ladder.
    expect(rows.filter((r) => r.escalation === 'REMINDER')).toHaveLength(2);
    expect(rows.every((r) => r.reminderSentAt instanceof Date)).toBe(true);

    await svc.ackBoard(companyId, {}, at(50));
    rows = await db.prisma.terminalTruckWindowRecipient.findMany({ where: { changeId: change.id } });
    expect(rows.filter((r) => r.escalation === 'ESCALATED')).toHaveLength(2);
    expect(rows.every((r) => r.escalatedAt instanceof Date)).toBe(true);

    const escalated = await db.prisma.auditLog.findMany({
      where: { action: 'truck_window.escalated' }, orderBy: { createdAt: 'asc' },
    });
    expect(escalated.length).toBeGreaterThanOrEqual(4);
    expect(escalated.every((e) => e.actorType === 'system')).toBe(true);

    const board = await svc.ackBoard(companyId, {}, at(50));
    expect(board.counts).toMatchObject({ unacknowledged: 2, escalated: 2, stale: 2 });
  });

  it('never escalates a recipient it could not reach — DRIVER NOT ASSIGNED is reported, not blamed', async () => {
    const appt = await bookAppointment({ driverId: null, driverName: null, shareToken: null, shareTokenExpiresAt: null });
    const change = await reschedule(appt.id);
    const driverRow = await db.prisma.terminalTruckWindowRecipient.findFirstOrThrow({
      where: { changeId: change.id, recipientType: 'DRIVER' },
    });
    expect(driverRow.recipientLabel).toBe('DRIVER NOT ASSIGNED');
    expect(driverRow.deliveryState).toBe('UNAVAILABLE');
    expect(driverRow.deliveryReason).toBe('DRIVER_NOT_ASSIGNED');
    expect(push.wakeDriver).not.toHaveBeenCalled();

    const late = new Date(new Date(change.changedAt).getTime() + 5 * 3_600_000);
    const board = await svc.ackBoard(companyId, {}, late);
    expect(board.counts.driverNotAssigned).toBe(1);
    const after = await db.prisma.terminalTruckWindowRecipient.findUniqueOrThrow({ where: { id: driverRow.id } });
    expect(after.escalation).toBe('NONE');
    expect(after.escalatedAt).toBeNull();
  });

  // ── Cross-tenant denial ────────────────────────────────────────────────────

  it('denies a window change and an acknowledgement from another tenant, and leaks nothing', async () => {
    const appt = await bookAppointment();
    const change = await reschedule(appt.id);

    await expect(
      svc.publishWindowChange({
        companyId: otherCompanyId, appointmentId: appt.id, kind: TruckWindowChangeKind.RESCHEDULED,
        newWindowStart: hoursFrom(20), newWindowEnd: hoursFrom(21), actor,
      }),
    ).rejects.toThrow('not found');

    await expect(
      svc.acknowledge({ companyId: otherCompanyId, changeId: change.id, source: TruckWindowAckSource.TENANT_USER }),
    ).rejects.toThrow('not found');

    await expect(svc.getChange(otherCompanyId, change.id)).rejects.toThrow('not found');
    await expect(svc.ackBoard(otherCompanyId)).resolves.toMatchObject({ changes: 0, rows: [] });
    await expect(svc.kpis(otherCompanyId)).resolves.toMatchObject({ changesExamined: 0 });

    // Nothing was written by the denied attempts.
    expect(await db.prisma.terminalTruckWindowChange.count({ where: { companyId: otherCompanyId } })).toBe(0);
    const unacked = await db.prisma.terminalTruckWindowRecipient.count({
      where: { changeId: change.id, ackState: 'ACKNOWLEDGED' },
    });
    expect(unacked).toBe(0);
    // The foreign tenant lookup fails before recipient evaluation; it must not
    // attribute a rejected-recipient audit to a change that tenant cannot see.
    expect(await db.prisma.auditLog.count({ where: { action: 'truck_window.ack_rejected' } })).toBe(0);

    // A wrong driver on an owned change reaches recipient evaluation and is
    // rejected and audited, without acknowledging the actual recipient.
    await expect(svc.acknowledge({
      companyId, changeId: change.id, source: TruckWindowAckSource.DRIVER_PORTAL,
      driverId: 'another-driver',
    })).rejects.toThrow(/not a recipient/i);
    const rejected = await db.prisma.auditLog.findMany({ where: { action: 'truck_window.ack_rejected' } });
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      action: 'truck_window.ack_rejected',
      actorType: 'system',
      targetType: 'rail_truck_window_change',
      targetId: change.id,
      metadata: { companyId, reason: 'NOT_A_RECIPIENT', source: 'DRIVER_PORTAL' },
    });
    expect(await db.prisma.terminalTruckWindowRecipient.count({
      where: { changeId: change.id, ackState: 'ACKNOWLEDGED' },
    })).toBe(0);
  });

  it('refuses an acknowledgement of a superseded version, in the database as well as in the service', async () => {
    const appt = await bookAppointment();
    const v1 = await reschedule(appt.id);
    const v2 = await reschedule(appt.id, { newWindowStart: hoursFrom(12), newWindowEnd: hoursFrom(13), reason: 'Slipped again' });

    await expect(
      svc.acknowledge({ companyId, changeId: v1.id, source: TruckWindowAckSource.TENANT_USER }),
    ).rejects.toThrow(/superseded/i);

    const v1Rows = await db.prisma.terminalTruckWindowRecipient.findMany({ where: { changeId: v1.id } });
    expect(v1Rows.every((r) => r.ackState === 'UNACKED')).toBe(true);
    const storedV1 = await db.prisma.terminalTruckWindowChange.findUniqueOrThrow({ where: { id: v1.id } });
    expect(storedV1.status).toBe('SUPERSEDED');
    expect(storedV1.activeAppointmentId).toBeNull();
    expect(storedV1.supersededById).toBe('user-ops');
    // The old window is still on the record, never overwritten.
    expect(storedV1.newWindowStart!.getTime()).toBe(new Date(v1.newWindow!.start).getTime());

    const ok = await svc.acknowledge({ companyId, changeId: v2.id, source: TruckWindowAckSource.TENANT_USER });
    expect(ok.recipient.ack.state).toBe('ACKNOWLEDGED');
  });

  it('acknowledges behind the expiring share token, and refuses it once the token has expired', async () => {
    const appt = await bookAppointment();
    const change = await reschedule(appt.id);

    const acked = await svc.acknowledgeByShareToken(appt.shareToken!);
    expect(acked.recipient.recipientType).toBe('HAULIER');
    expect(acked.recipient.ack.source).toBe('SHARE_TOKEN');
    expect(acked.change.id).toBe(change.id);
    const audit = await db.prisma.auditLog.findFirstOrThrow({ where: { action: 'truck_window.acknowledged' } });
    // A credential-holder ack is attributed to the system naming the credential,
    // never to a person we did not authenticate.
    expect(audit.actorType).toBe('system');
    expect(audit.metadata).toMatchObject({ source: 'SHARE_TOKEN' });

    // Now expire the token: the same confirmation must be refused.
    await db.prisma.terminalTruckAppointment.update({
      where: { id: appt.id },
      data: { shareTokenExpiresAt: new Date(Date.now() - 1000) },
    });
    await db.prisma.terminalTruckWindowRecipient.updateMany({
      where: { changeId: change.id }, data: { ackState: 'UNACKED', ackedAt: null },
    });
    await expect(svc.acknowledgeByShareToken(appt.shareToken!)).rejects.toThrow('expired');
    await expect(svc.sharedChangeView(appt.shareToken!)).resolves.toMatchObject({
      link: { expired: true, canAcknowledge: false },
    });
  });

  it('replans a whole day as one versioned change per truck, skipping windows that already closed', async () => {
    const day = '2099-03-04';
    const open = await bookAppointment({ windowStart: new Date(`${day}T08:00:00.000Z`), windowEnd: new Date(`${day}T09:00:00.000Z`) });
    const closed = await bookAppointment({
      vehicleReg: 'OLD 001 GP', windowStart: new Date('2020-03-04T08:00:00.000Z'), windowEnd: new Date('2020-03-04T09:00:00.000Z'),
    });
    const arrived = await bookAppointment({ vehicleReg: 'HERE 002 GP', status: 'ARRIVED', arrivedAt: new Date() });

    const result: any = await svc.replanDay(companyId, {
      terminalName: 'Central Terminal', date: day, shiftMinutes: 120, reason: 'Late train from the corridor',
    }, actor);

    expect(result.shifted).toBe(1);
    expect(result.appointmentIds).toEqual([open.id]);
    const moved = await db.prisma.terminalTruckAppointment.findUniqueOrThrow({ where: { id: open.id } });
    expect(moved.windowStart.toISOString()).toBe(`${day}T10:00:00.000Z`);
    expect(moved.windowVersion).toBe(2);

    const untouchedArrived = await db.prisma.terminalTruckAppointment.findUniqueOrThrow({ where: { id: arrived.id } });
    expect(untouchedArrived.windowVersion).toBe(1);
    expect(untouchedArrived.status).toBe('ARRIVED');

    // The already-closed window is reported as skipped, not silently dropped.
    const closedDay: any = await svc.replanDay(companyId, {
      terminalName: 'Central Terminal', date: '2020-03-04', shiftMinutes: 60, reason: 'Cleaning up the board',
    }, actor);
    expect(closedDay.shifted).toBe(0);
    expect(closedDay.skipped).toHaveLength(1);
    expect(closedDay.skipped[0].appointmentId).toBe(closed.id);
    const stillClosed = await db.prisma.terminalTruckAppointment.findUniqueOrThrow({ where: { id: closed.id } });
    expect(stillClosed.windowStart.toISOString()).toBe('2020-03-04T08:00:00.000Z');
    expect(await db.prisma.auditLog.count({ where: { action: 'truck_appointment.day_replanned' } })).toBe(2);
  });

  it('stores a per-terminal acknowledgement threshold and freezes it onto changes already in flight', async () => {
    const appt = await bookAppointment();
    await svc.upsertGatePolicy(companyId, 'Central Terminal', {
      ackDueMinutes: 5, reminderAfterMinutes: 2, escalateAfterMinutes: 6,
    }, actor);

    const change = await reschedule(appt.id);
    const rows = await db.prisma.terminalTruckWindowRecipient.findMany({ where: { changeId: change.id } });
    expect(rows.every((r) => r.ackDueMinutes === 5)).toBe(true);

    // Loosening the ladder afterwards does NOT move the deadline the recipient
    // was given (frozen on the row), but it does govern the reminder/escalation
    // rungs from then on — a terminal that re-tunes its ladder wants the new
    // tuning applied to changes still open.
    await svc.upsertGatePolicy(companyId, 'Central Terminal', {
      ackDueMinutes: 600, reminderAfterMinutes: 300, escalateAfterMinutes: 900,
    }, actor);
    const at = (m: number) => new Date(new Date(change.changedAt).getTime() + m * 60_000);
    const board = await svc.ackBoard(companyId, {}, at(6));
    const after = await db.prisma.terminalTruckWindowRecipient.findMany({ where: { changeId: change.id } });
    expect(after.every((r) => r.ackDueMinutes === 5)).toBe(true);
    // Past the frozen 5-minute deadline → both recipients are stale...
    expect(board.counts.stale).toBe(2);
    // ...while the re-tuned 300/900-minute ladder has not rung yet.
    expect(after.every((r) => r.escalation === 'NONE')).toBe(true);

    // One row per (company, terminal) — the upsert really upserts.
    expect(await db.prisma.terminalGatePolicy.count({ where: { companyId } })).toBe(1);
  });
});
