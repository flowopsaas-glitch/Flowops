import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuditTrailService } from './audit-trail.service';
import { fakeTable } from './audit-trail.testkit';
import { decodeCursor, encodeCursor } from './audit-trail.cursor';

/**
 * Behavioural tests for the tenant audit trail.
 *
 * The failure this feature exists to avoid is a demo that looks right and is
 * wrong: an endpoint that returns *some* records, scoped to *nobody in
 * particular*, presenting reconstructed state as if it were a record. So the
 * assertions below are about boundaries and about what the data is allowed to
 * claim — not about formatting.
 */

const HOUR = 60 * 60 * 1000;
const T0 = new Date('2026-11-04T08:00:00.000Z');

function event(id: string, waybillId: string, companyId: string, offsetHours: number, over: Record<string, any> = {}) {
  return {
    id,
    waybillId,
    companyId,
    event: 'IN_TRANSIT',
    status: 'IN_TRANSIT',
    description: `event ${id}`,
    location: 'Johannesburg Hub',
    lat: null,
    lng: null,
    actorType: 'DRIVER',
    actorId: 'drv-1',
    metadata: null,
    createdAt: new Date(T0.getTime() - offsetHours * HOUR),
    ...over,
  };
}

/**
 * Rail event rows carry their consignment relation, because the service filters
 * tenancy as `where: { consignment: { companyId } }` — a valid Prisma to-one
 * relation filter. The fake table stands in for the database, where that
 * relation exists.
 */
function railEvent(
  id: string,
  consignmentId: string,
  companyId: string,
  offsetHours: number,
  over: Record<string, any> = {},
) {
  return {
    id,
    consignmentId,
    consignment: { companyId },
    status: 'IN_TRANSIT',
    note: `rail event ${id}`,
    location: null,
    reachedAt: new Date(T0.getTime() - offsetHours * HOUR),
    ...over,
  };
}

function build(seed: {
  trackingEvents?: any[];
  consignmentEvents?: any[];
  waybills?: any[];
  consignments?: any[];
  drivers?: any[];
  users?: any[];
}) {
  const prisma = {
    trackingEvent: fakeTable(seed.trackingEvents ?? [], { timeField: 'createdAt' }),
    railConsignmentEvent: fakeTable(seed.consignmentEvents ?? [], { timeField: 'reachedAt' }),
    waybill: fakeTable(seed.waybills ?? []),
    railConsignment: fakeTable(seed.consignments ?? []),
    driver: fakeTable(seed.drivers ?? []),
    user: fakeTable(seed.users ?? []),
  };
  return new AuditTrailService(prisma as any);
}

const waybills = [
  { id: 'wb-1', companyId: 'tenant-a', trackingNumber: 'FO-A-001' },
  { id: 'wb-2', companyId: 'tenant-a', trackingNumber: 'FO-A-002' },
  { id: 'wb-x', companyId: 'tenant-b', trackingNumber: 'FO-B-999' },
];

describe('AuditTrailService — tenancy', () => {
  it('never returns another tenant’s events', async () => {
    const svc = build({
      waybills,
      trackingEvents: [
        event('e1', 'wb-1', 'tenant-a', 1),
        event('e2', 'wb-x', 'tenant-b', 2),
      ],
    });

    const page = await svc.list('tenant-a', {});
    expect(page.records.map((r) => r.id)).toEqual(['e1']);
    // The other tenant's event was filtered by the query, not by the mock's
    // return value: the table truly held both rows.
    expect(page.records.some((r) => r.entityId === 'wb-x')).toBe(false);
  });

  it('refuses to serve the history of an entity in another tenant', async () => {
    const svc = build({
      waybills,
      trackingEvents: [event('e2', 'wb-x', 'tenant-b', 1)],
    });

    await expect(svc.history('tenant-a', 'waybill', 'wb-x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('distinguishes “no history yet” from “not your entity”', async () => {
    const svc = build({ waybills, trackingEvents: [] });
    // wb-1 belongs to tenant-a but has no events: an empty list, not a 404.
    await expect(svc.history('tenant-a', 'waybill', 'wb-1')).resolves.toEqual([]);
    await expect(svc.history('tenant-a', 'waybill', 'does-not-exist')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('AuditTrailService — pagination', () => {
  const many = Array.from({ length: 12 }, (_, i) => event(`e${i}`, 'wb-1', 'tenant-a', i));

  it('walks the whole trail without repeating or dropping a record', async () => {
    const svc = build({ waybills, trackingEvents: many });

    const seen: string[] = [];
    let cursor: string | undefined;
    let guard = 0;

    do {
      const page: Awaited<ReturnType<typeof svc.list>> = await svc.list('tenant-a', { limit: 5, cursor });
      seen.push(...page.records.map((r) => r.id));
      cursor = page.nextCursor ?? undefined;
      if (++guard > 10) throw new Error('pagination did not terminate');
    } while (cursor);

    expect(seen).toHaveLength(12);
    expect(new Set(seen).size).toBe(12); // no duplicates across pages
    expect(seen).toEqual(many.map((e) => e.id)); // newest first, exactly once each
  });

  it('reports hasMore only while rows remain', async () => {
    const svc = build({ waybills, trackingEvents: many });
    const first = await svc.list('tenant-a', { limit: 11 });
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toEqual(expect.any(String));

    const last = await svc.list('tenant-a', { limit: 11, cursor: first.nextCursor! });
    expect(last.records).toHaveLength(1);
    expect(last.hasMore).toBe(false);
    expect(last.nextCursor).toBeNull();
  });

  it('clamps the limit instead of trusting it', async () => {
    const svc = build({ waybills, trackingEvents: many });
    expect((await svc.list('tenant-a', { limit: 10_000 })).records).toHaveLength(12); // 12 < 200 cap
    expect((await svc.list('tenant-a', { limit: 0 })).records.length).toBeGreaterThan(0); // clamped to 1+
  });

  it('rejects a cursor that has been edited by hand', async () => {
    const svc = build({ waybills, trackingEvents: many });
    await expect(svc.list('tenant-a', { cursor: 'not-a-cursor' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      svc.list('tenant-a', { cursor: Buffer.from('{"occurredAt":"nope","id":"x"}').toString('base64url') }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AuditTrailService — merging two sources', () => {
  const consignments = [{ id: 'rc-1', companyId: 'tenant-a', consignmentNumber: 'RAIL-2026-00042' }];

  it('interleaves waybill and rail events in one time-ordered feed', async () => {
    const svc = build({
      waybills,
      consignments,
      trackingEvents: [event('e-early', 'wb-1', 'tenant-a', 5), event('e-late', 'wb-1', 'tenant-a', 1)],
      consignmentEvents: [railEvent('r-mid', 'rc-1', 'tenant-a', 3, { status: 'IN_TRANSIT', note: 'departed' })],
    });

    const page = await svc.list('tenant-a', {});
    expect(page.records.map((r) => r.id)).toEqual(['e-late', 'r-mid', 'e-early']);
    expect(page.records.map((r) => r.kind)).toEqual(['waybill', 'consignment', 'waybill']);
  });

  it('resolves the human reference for both kinds', async () => {
    const svc = build({
      waybills,
      consignments,
      trackingEvents: [event('e1', 'wb-1', 'tenant-a', 0)],
      consignmentEvents: [railEvent('r1', 'rc-1', 'tenant-a', 1, { status: 'PLANNED', note: null })],
    });

    const [first, second] = (await svc.list('tenant-a', {})).records;
    expect(first.entityReference).toBe('FO-A-001');
    expect(second.entityReference).toBe('RAIL-2026-00042');
  });

  it('marks a dangling reference rather than silently showing an id', async () => {
    const svc = build({
      waybills: [], // the waybill row is gone, the event survives
      trackingEvents: [event('e1', 'wb-gone', 'tenant-a', 1)],
    });

    const [record] = (await svc.list('tenant-a', {})).records;
    expect(record.entityReference).toContain('wb-gone'.slice(0, 8));
    expect(record.entityReference).not.toBe('wb-gone'); // never pass an id off as a reference
  });
});

describe('AuditTrailService — what the data is allowed to claim', () => {
  it('does not fabricate a transition on the list view', async () => {
    const svc = build({
      waybills,
      trackingEvents: [
        event('e1', 'wb-1', 'tenant-a', 2, { status: 'COLLECTED' }),
        event('e2', 'wb-1', 'tenant-a', 1, { status: 'IN_TRANSIT' }),
      ],
    });

    const page = await svc.list('tenant-a', {});
    // The preceding event IS in this page — and we still refuse, because on a
    // paginated list it would be populated for some rows and not others.
    expect(page.records.every((r) => r.fromStatus === null)).toBe(true);
  });

  it('derives fromStatus in a single-entity history, where the predecessor is in hand', async () => {
    const svc = build({
      waybills,
      trackingEvents: [
        event('e2', 'wb-1', 'tenant-a', 1, { status: 'IN_TRANSIT' }),
        event('e1', 'wb-1', 'tenant-a', 2, { status: 'COLLECTED' }),
      ],
    });

    const history = await svc.history('tenant-a', 'waybill', 'wb-1');
    expect(history.map((r) => r.status)).toEqual(['COLLECTED', 'IN_TRANSIT']);
    expect(history.map((r) => r.fromStatus)).toEqual([null, 'COLLECTED']);
  });

  it('omits fields the source does not carry instead of guessing them', async () => {
    const svc = build({
      consignments: [{ id: 'rc-1', companyId: 'tenant-a', consignmentNumber: 'RAIL-1' }],
      consignmentEvents: [railEvent('r1', 'rc-1', 'tenant-a', 0, { status: 'PLANNED', note: null })],
    });

    const [record] = (await svc.list('tenant-a', {})).records;
    expect(record.actorType).toBeNull();
    expect(record.actorId).toBeNull();
    expect(record.actorName).toBeNull();
    expect(record.evidence).toBeNull();
  });

  it('resolves actor names from the right table by actor type', async () => {
    const svc = build({
      waybills,
      drivers: [{ id: 'drv-1', companyId: 'tenant-a', name: 'Sipho Ndlovu' }],
      users: [{ id: 'usr-1', companyId: 'tenant-a', name: 'Thandi Mokoena' }],
      trackingEvents: [
        event('e-driver', 'wb-1', 'tenant-a', 2, { actorType: 'DRIVER', actorId: 'drv-1' }),
        event('e-ops', 'wb-1', 'tenant-a', 1, { actorType: 'DISPATCH', actorId: 'usr-1' }),
      ],
    });

    const byId = Object.fromEntries((await svc.list('tenant-a', {})).records.map((r) => [r.id, r]));
    expect(byId['e-driver'].actorName).toBe('Sipho Ndlovu');
    expect(byId['e-ops'].actorName).toBe('Thandi Mokoena');
  });

  it('prefers the label recorded on the event over a resolved current name', async () => {
    // auto-dispatch stores `AUTO_DISPATCH:<mode>` and no user row of its own;
    // driver/ePOD paths store only an id. Getting the precedence backwards
    // erases the recorded label and renders the event unattributed.
    const svc = build({
      waybills,
      drivers: [{ id: 'drv-1', companyId: 'tenant-a', name: 'Sipho Ndlovu (renamed)' }],
      trackingEvents: [
        event('e-auto', 'wb-1', 'tenant-a', 1, {
          actorType: 'SYSTEM',
          actorId: null,
          actorName: 'AUTO_DISPATCH:suggest',
        }),
        event('e-named', 'wb-1', 'tenant-a', 2, {
          actorType: 'DRIVER',
          actorId: 'drv-1',
          actorName: 'Sipho Ndlovu',
        }),
      ],
    });

    const byId = Object.fromEntries((await svc.list('tenant-a', {})).records.map((r) => [r.id, r]));
    expect(byId['e-auto'].actorName).toBe('AUTO_DISPATCH:suggest');
    expect(byId['e-named'].actorName).toBe('Sipho Ndlovu');
  });

  it('leaves the actor name null when the actor row is gone', async () => {
    const svc = build({
      waybills,
      drivers: [],
      trackingEvents: [event('e1', 'wb-1', 'tenant-a', 1, { actorType: 'DRIVER', actorId: 'deleted-driver' })],
    });
    const [record] = (await svc.list('tenant-a', {})).records;
    expect(record.actorId).toBe('deleted-driver'); // the attribution is preserved
    expect(record.actorName).toBeNull(); // the name is not invented
  });
});

describe('AuditTrailService — filters', () => {
  const seed = () => ({
    waybills,
    trackingEvents: [
      event('a', 'wb-1', 'tenant-a', 1, { description: 'Collected at depot', location: 'Spartan Depot', actorType: 'DRIVER' }),
      event('b', 'wb-1', 'tenant-a', 2, { description: 'Scanned at hub', location: 'Isando Hub', actorType: 'WAREHOUSE' }),
      event('c', 'wb-2', 'tenant-a', 3, { description: 'Delivered to client', location: 'Sandton', actorType: 'DRIVER' }),
    ],
  });

  it('filters by kind', async () => {
    const svc = build(seed());
    expect((await svc.list('tenant-a', { kind: 'consignment' })).records).toHaveLength(0);
    expect((await svc.list('tenant-a', { kind: 'waybill' })).records).toHaveLength(3);
  });

  it('searches the event text', async () => {
    const svc = build(seed());
    const page = await svc.list('tenant-a', { q: 'hub' });
    expect(page.records.map((r) => r.id)).toEqual(['b']);
  });

  it('searches an entity reference by resolving it to ids first', async () => {
    const svc = build(seed());
    const page = await svc.list('tenant-a', { q: 'FO-A-002' });
    expect(page.records.map((r) => r.id)).toEqual(['c']);
  });

  it('filters by actor type', async () => {
    const svc = build(seed());
    const page = await svc.list('tenant-a', { actorType: 'WAREHOUSE' });
    expect(page.records.map((r) => r.id)).toEqual(['b']);
  });

  it('rejects an inverted date range rather than returning nothing', async () => {
    const svc = build(seed());
    await expect(
      svc.list('tenant-a', { from: '2026-11-05T00:00:00Z', to: '2026-11-01T00:00:00Z' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown kind', async () => {
    const svc = build(seed());
    await expect(svc.list('tenant-a', { kind: 'invoice' as any })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AuditTrailService — summary', () => {
  it('separates unattributed from unrecorded instead of showing one zero', async () => {
    const svc = build({
      waybills,
      consignments: [{ id: 'rc-1', companyId: 'tenant-a', consignmentNumber: 'RAIL-1' }],
      trackingEvents: [
        event('e1', 'wb-1', 'tenant-a', 1, { actorType: 'DRIVER' }),
        event('e2', 'wb-1', 'tenant-a', 2, { actorType: null }),
      ],
      consignmentEvents: [railEvent('r1', 'rc-1', 'tenant-a', 0, { status: 'PLANNED', note: null, reachedAt: new Date() })],
    });

    const summary = await svc.summary('tenant-a', 7);
    expect(summary.total).toBe(3);
    expect(summary.byKind).toEqual({ waybill: 2, consignment: 1 });
    expect(summary.byActorType.DRIVER).toBe(1);
    expect(summary.byActorType.UNATTRIBUTED).toBe(1); // a waybill event with no actor
    expect(summary.byActorType.UNRECORDED_RAIL).toBe(1); // rail events have no actor column
    expect(summary.entitiesTouched).toBe(2);
  });

  it('ignores another tenant’s activity', async () => {
    const svc = build({
      waybills,
      trackingEvents: [event('e1', 'wb-1', 'tenant-a', 1), event('e2', 'wb-x', 'tenant-b', 1)],
    });
    expect((await svc.summary('tenant-a', 7)).total).toBe(1);
  });
});

describe('cursor encoding', () => {
  it('round-trips a timestamp and id', () => {
    const cursor = { occurredAt: '2026-11-04T08:00:00.000Z', id: 'abc123' };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('does not break when an id contains a delimiter', () => {
    const cursor = { occurredAt: '2026-11-04T08:00:00.000Z', id: 'a|b:c"d' };
    expect(decodeCursor(encodeCursor(cursor)).id).toBe('a|b:c"d');
  });
});
