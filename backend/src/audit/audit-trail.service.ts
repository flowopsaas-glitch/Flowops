import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { decodeCursor, encodeCursor } from './audit-trail.cursor';
import {
  TRAIL_KINDS,
  type TrailKind,
  type TrailPage,
  type TrailQuery,
  type TrailRecord,
  type TrailSummary,
} from './audit-trail.types';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
/** A single entity's history is bounded; the cap is disclosed in the response. */
const MAX_HISTORY = 500;

interface RawEvent {
  id: string;
  kind: TrailKind;
  entityId: string;
  event: string;
  status: string | null;
  description: string;
  location: string | null;
  lat: number | null;
  lng: number | null;
  actorType: string | null;
  actorId: string | null;
  /**
   * Label the source row stored at write time. Only some writers set it —
   * auto-dispatch records `AUTO_DISPATCH:<mode>`, the driver and ePOD paths
   * record only an id. When present it is evidence and outranks a resolved
   * name; when absent it stays null and resolution fills the gap.
   */
  actorName: string | null;
  occurredAt: Date;
  evidence: Record<string, unknown> | null;
}

/**
 * Read model over the platform's append-only event tables.
 *
 * Two things this service refuses to do, because both would make the output
 * worse than useless as evidence:
 *
 *  1. **Invent field history.** There is no old/new value log in the schema. A
 *     row here is one database row, not a diff.
 *  2. **Filter after paging.** Text search resolves to entity ids first and is
 *     applied *inside* the database query, so a page can never come back empty
 *     while matches sit further down. Filtering on display fields after the
 *     merge would silently hide records.
 */
@Injectable()
export class AuditTrailService {
  constructor(private readonly prisma: PrismaService) {}

  // ── List ──────────────────────────────────────────────────────────────────

  async list(companyId: string, query: TrailQuery): Promise<TrailPage> {
    const limit = clampLimit(query.limit);
    const kinds = resolveKinds(query.kind);
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const range = resolveRange(query.from, query.to);

    // Resolve search + actor filters to ids BEFORE querying the event tables.
    // `tracking_events` declares no relation to `waybills`, so a relation filter
    // is not available; two indexed lookups are, and they keep the keyset
    // pagination honest.
    const entityIdsByKind = query.q ? await this.resolveEntityIds(companyId, query.q, kinds) : null;
    const actorIds = query.q ? await this.resolveActorIds(companyId, query.q) : null;

    const perSource = await Promise.all(
      kinds.map(async (kind) => {
        // NOTE: an empty entity-id list must NOT short-circuit the query. A
        // search term can match an event description without matching any
        // reference; returning early here hid every such row. The ids are only
        // one arm of the OR inside the query.
        return kind === 'waybill'
          ? this.fetchWaybillEvents(companyId, limit + 1, {
              cursor,
              range,
              actorType: query.actorType,
              q: query.q,
              matchingIds: entityIdsByKind?.waybill ?? null,
              actorIds,
            })
          : this.fetchConsignmentEvents(companyId, limit + 1, {
              cursor,
              range,
              actorType: query.actorType,
              q: query.q,
              matchingIds: entityIdsByKind?.consignment ?? null,
            });
      }),
    );

    const merged = perSource.flat().sort(compareDesc);
    // Taking `limit` from the union of the top `limit + 1` of each source is
    // exact: a record in the true top-N of the union cannot be the (limit+1)-th
    // of its own source, because that source alone would then supply limit
    // records ahead of it.
    const page = merged.slice(0, limit);
    const hasMore = merged.length > limit;

    const records = await this.decorate(companyId, page);

    const last = page[page.length - 1];
    return {
      records,
      hasMore,
      nextCursor:
        hasMore && last ? encodeCursor({ occurredAt: last.occurredAt.toISOString(), id: last.id }) : null,
    };
  }

  // ── Single-entity history ─────────────────────────────────────────────────

  async history(companyId: string, kind: TrailKind, entityId: string): Promise<TrailRecord[]> {
    if (!TRAIL_KINDS.includes(kind)) {
      throw new BadRequestException(`Unknown trail kind: ${kind}`);
    }

    // Verify the entity belongs to this tenant first. Without this, an empty
    // event list is ambiguous between "no history" and "someone else's id", and
    // the 404 would leak nothing but the second would silently look like the
    // first.
    await this.assertEntityInTenant(companyId, kind, entityId);

    const raw =
      kind === 'waybill'
        ? await this.fetchWaybillEvents(companyId, MAX_HISTORY, { entityId })
        : await this.fetchConsignmentEvents(companyId, MAX_HISTORY, { entityId });

    raw.sort(compareAsc);
    const records = await this.decorate(companyId, raw);

    // Only here is a transition honest: the preceding event is in hand.
    return records.map((record, index) => ({
      ...record,
      fromStatus: index === 0 ? null : records[index - 1].status,
    }));
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  async summary(companyId: string, days?: number): Promise<TrailSummary> {
    const window = Math.min(Math.max(days ?? 7, 1), 365);
    const since = new Date(Date.now() - window * 24 * 60 * 60 * 1000);

    const [waybills, consignments] = await Promise.all([
      this.prisma.trackingEvent.findMany({
        where: { companyId, createdAt: { gte: since } },
        select: { waybillId: true, actorType: true, createdAt: true },
      }),
      this.prisma.railConsignmentEvent.findMany({
        where: { consignment: { companyId }, reachedAt: { gte: since } },
        select: { consignmentId: true, reachedAt: true },
      }),
    ]);

    const byActorType: Record<string, number> = {};
    const entities = new Set<string>();

    for (const row of waybills) {
      entities.add(`waybill:${row.waybillId}`);
      const key = row.actorType || 'UNATTRIBUTED';
      byActorType[key] = (byActorType[key] ?? 0) + 1;
    }
    for (const row of consignments) {
      entities.add(`consignment:${row.consignmentId}`);
    }
    // Rail events carry no actor column at all — say so rather than reporting a
    // zero that reads like "nobody did anything".
    if (consignments.length > 0) {
      byActorType.UNRECORDED_RAIL = consignments.length;
    }

    const stamps = [
      ...waybills.map((r) => r.createdAt),
      ...consignments.map((r) => r.reachedAt),
    ].sort((a, b) => a.getTime() - b.getTime());

    return {
      days: window,
      total: waybills.length + consignments.length,
      byKind: { waybill: waybills.length, consignment: consignments.length },
      byActorType,
      entitiesTouched: entities.size,
      firstEventAt: stamps.length ? stamps[0].toISOString() : null,
      lastEventAt: stamps.length ? stamps[stamps.length - 1].toISOString() : null,
    };
  }

  // ── Source queries ────────────────────────────────────────────────────────

  private async fetchWaybillEvents(
    companyId: string,
    take: number,
    opts: {
      entityId?: string;
      cursor?: { occurredAt: string; id: string } | null;
      range?: { from?: Date; to?: Date };
      actorType?: string;
      q?: string;
      matchingIds?: string[];
      actorIds?: string[] | null;
    },
  ): Promise<RawEvent[]> {
    const where: Record<string, unknown> = { companyId };

    if (opts.entityId) where.waybillId = opts.entityId;
    if (opts.matchingIds && opts.matchingIds.length) where.waybillId = { in: opts.matchingIds };
    if (opts.actorType) where.actorType = opts.actorType;

    const and: Record<string, unknown>[] = [];
    if (opts.range?.from || opts.range?.to) {
      and.push({
        createdAt: {
          ...(opts.range.from ? { gte: opts.range.from } : {}),
          ...(opts.range.to ? { lt: opts.range.to } : {}),
        },
      });
    }
    if (opts.cursor) {
      const at = new Date(opts.cursor.occurredAt);
      // Strictly after the cursor in (createdAt DESC, id DESC) order.
      and.push({
        OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: opts.cursor.id } }],
      });
    }
    // Free text is matched on the columns the event row actually owns. Entity
    // reference matches were already turned into `matchingIds`; actor-name
    // matches into `actorIds`. This block must never be widened to display
    // fields, which are resolved after the page is chosen.
    if (opts.q) {
      const textOr: Record<string, unknown>[] = [
        { description: { contains: opts.q, mode: 'insensitive' } },
        { location: { contains: opts.q, mode: 'insensitive' } },
        { event: { contains: opts.q, mode: 'insensitive' } },
      ];
      if (opts.actorIds && opts.actorIds.length) textOr.push({ actorId: { in: opts.actorIds } });
      if (opts.matchingIds && opts.matchingIds.length) textOr.push({ waybillId: { in: opts.matchingIds } });
      and.push({ OR: textOr });
    }
    if (and.length) where.AND = and;

    const rows = await this.prisma.trackingEvent.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    });

    return rows.map((r) => ({
      id: r.id,
      kind: 'waybill' as const,
      entityId: r.waybillId,
      event: r.event,
      status: r.status ?? null,
      description: r.description,
      location: r.location ?? null,
      lat: r.lat ?? null,
      lng: r.lng ?? null,
      actorType: r.actorType ?? null,
      actorId: r.actorId ?? null,
      actorName: r.actorName ?? null,
      occurredAt: r.createdAt,
      evidence: (r.metadata as Record<string, unknown> | null) ?? null,
    }));
  }

  private async fetchConsignmentEvents(
    companyId: string,
    take: number,
    opts: {
      entityId?: string;
      cursor?: { occurredAt: string; id: string } | null;
      range?: { from?: Date; to?: Date };
      actorType?: string;
      q?: string;
      matchingIds?: string[];
    },
  ): Promise<RawEvent[]> {
    const where: Record<string, unknown> = { consignment: { companyId } };

    if (opts.entityId) where.consignmentId = opts.entityId;
    if (opts.matchingIds && opts.matchingIds.length) where.consignmentId = { in: opts.matchingIds };

    const and: Record<string, unknown>[] = [];
    if (opts.range?.from || opts.range?.to) {
      and.push({
        reachedAt: {
          ...(opts.range.from ? { gte: opts.range.from } : {}),
          ...(opts.range.to ? { lt: opts.range.to } : {}),
        },
      });
    }
    if (opts.cursor) {
      const at = new Date(opts.cursor.occurredAt);
      and.push({
        OR: [{ reachedAt: { lt: at } }, { reachedAt: at, id: { lt: opts.cursor.id } }],
      });
    }
    if (opts.q) {
      const textOr: Record<string, unknown>[] = [
        { note: { contains: opts.q, mode: 'insensitive' } },
        { location: { contains: opts.q, mode: 'insensitive' } },
        { status: { contains: opts.q, mode: 'insensitive' } },
      ];
      if (opts.matchingIds && opts.matchingIds.length) {
        textOr.push({ consignmentId: { in: opts.matchingIds } });
      }
      and.push({ OR: textOr });
    }
    if (and.length) where.AND = and;

    // Rail events record no actor by design (see TrailSummary.byActorType).
    if (opts.actorType) return [];

    const rows = await this.prisma.railConsignmentEvent.findMany({
      where,
      orderBy: [{ reachedAt: 'desc' }, { id: 'desc' }],
      take,
    });

    return rows.map((r) => ({
      id: r.id,
      kind: 'consignment' as const,
      entityId: r.consignmentId,
      event: String(r.status),
      status: String(r.status),
      description: r.note ?? `Status ${r.status}.`,
      location: r.location ?? null,
      lat: null,
      lng: null,
      actorType: null,
      actorId: null,
      actorName: null,
      occurredAt: r.reachedAt,
      evidence: null,
    }));
  }

  // ── Resolution + decoration ───────────────────────────────────────────────

  /**
   * Turn a search term into entity ids, per kind.
   *
   * An empty array means "no reference matched" — which is not the same as "this
   * source has nothing to say", because the text may still match an event
   * description. Callers must not treat it as a stop signal.
   */
  private async resolveEntityIds(
    companyId: string,
    q: string,
    kinds: TrailKind[],
  ): Promise<Record<TrailKind, string[]>> {
    const [waybills, consignments] = await Promise.all([
      kinds.includes('waybill')
        ? this.prisma.waybill.findMany({
            where: { companyId, trackingNumber: { contains: q, mode: 'insensitive' } },
            select: { id: true },
            take: 500,
          })
        : Promise.resolve([]),
      kinds.includes('consignment')
        ? this.prisma.railConsignment.findMany({
            where: { companyId, consignmentNumber: { contains: q, mode: 'insensitive' } },
            select: { id: true },
            take: 500,
          })
        : Promise.resolve([]),
    ]);

    return {
      waybill: waybills.map((w) => w.id),
      consignment: consignments.map((c) => c.id),
    };
  }

  private async resolveActorIds(companyId: string, q: string): Promise<string[]> {
    const [drivers, users] = await Promise.all([
      this.prisma.driver.findMany({
        where: { companyId, name: { contains: q, mode: 'insensitive' } },
        select: { id: true },
        take: 200,
      }),
      this.prisma.user.findMany({
        where: { companyId, name: { contains: q, mode: 'insensitive' } },
        select: { id: true },
        take: 200,
      }),
    ]);
    return [...drivers, ...users].map((r) => r.id);
  }

  /**
   * Attach human references and actor names, in batches — never per row.
   *
   * `actorName` resolution is deliberately separate from `actorType`: a DRIVER
   * actor id is a `drivers` row, everything else is a `users` row (or a system
   * string, which the source already stored as the name).
   */
  private async decorate(companyId: string, rows: RawEvent[]): Promise<TrailRecord[]> {
    if (rows.length === 0) return [];

    const waybillIds = unique(rows.filter((r) => r.kind === 'waybill').map((r) => r.entityId));
    const consignmentIds = unique(rows.filter((r) => r.kind === 'consignment').map((r) => r.entityId));
    const driverIds = unique(rows.filter((r) => r.actorType === 'DRIVER' && r.actorId).map((r) => r.actorId!));
    const userIds = unique(rows.filter((r) => r.actorType !== 'DRIVER' && r.actorId).map((r) => r.actorId!));

    const [waybills, consignments, drivers, users] = await Promise.all([
      waybillIds.length
        ? this.prisma.waybill.findMany({
            where: { id: { in: waybillIds }, companyId },
            select: { id: true, trackingNumber: true },
          })
        : Promise.resolve([]),
      consignmentIds.length
        ? this.prisma.railConsignment.findMany({
            where: { id: { in: consignmentIds }, companyId },
            select: { id: true, consignmentNumber: true },
          })
        : Promise.resolve([]),
      driverIds.length
        ? this.prisma.driver.findMany({
            where: { id: { in: driverIds }, companyId },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: userIds }, companyId },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    const refByEntity = new Map<string, string>([
      ...waybills.map((w) => [`waybill:${w.id}`, w.trackingNumber] as const),
      ...consignments.map((c) => [`consignment:${c.id}`, c.consignmentNumber] as const),
    ]);
    const nameById = new Map<string, string>([
      ...drivers.map((d) => [d.id, d.name] as const),
      ...users.map((u) => [u.id, u.name] as const),
    ]);

    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      entityId: r.entityId,
      // A missing reference is a data-integrity signal, not something to paper
      // over with the id: the caller should see that the link is broken.
      entityReference: refByEntity.get(`${r.kind}:${r.entityId}`) ?? `(${r.kind} ${r.entityId.slice(0, 8)}…)`,
      event: r.event,
      status: r.status,
      fromStatus: null,
      description: r.description,
      location: r.location,
      lat: r.lat,
      lng: r.lng,
      actorType: r.actorType,
      actorId: r.actorId,
      // Recorded label first: on an audit trail, what the row says at write
      // time is evidence; the resolved name is a convenience for the majority of
      // rows that store only an id, and it reflects the actor's name *now*.
      actorName: r.actorName ?? (r.actorId ? (nameById.get(r.actorId) ?? null) : null),
      occurredAt: r.occurredAt.toISOString(),
      evidence: r.evidence,
    }));
  }

  private async assertEntityInTenant(companyId: string, kind: TrailKind, entityId: string) {
    const found =
      kind === 'waybill'
        ? await this.prisma.waybill.findFirst({ where: { id: entityId, companyId }, select: { id: true } })
        : await this.prisma.railConsignment.findFirst({
            where: { id: entityId, companyId },
            select: { id: true },
          });

    if (!found) throw new NotFoundException(`No ${kind} with that id in this account.`);
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

function clampLimit(limit?: number): number {
  if (limit === undefined || Number.isNaN(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function resolveKinds(kind?: TrailKind): TrailKind[] {
  if (!kind) return [...TRAIL_KINDS];
  if (!TRAIL_KINDS.includes(kind)) throw new BadRequestException(`Unknown trail kind: ${kind}`);
  return [kind];
}

function resolveRange(from?: string, to?: string): { from?: Date; to?: Date } {
  const parse = (value: string | undefined, label: string) => {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`Invalid ${label} date.`);
    return date;
  };
  const f = parse(from, 'from');
  const t = parse(to, 'to');
  if (f && t && f >= t) throw new BadRequestException('`from` must be before `to`.');
  return { from: f, to: t };
}

function compareDesc(a: RawEvent, b: RawEvent): number {
  const delta = b.occurredAt.getTime() - a.occurredAt.getTime();
  return delta !== 0 ? delta : b.id.localeCompare(a.id);
}

function compareAsc(a: RawEvent, b: RawEvent): number {
  const delta = a.occurredAt.getTime() - b.occurredAt.getTime();
  return delta !== 0 ? delta : a.id.localeCompare(b.id);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
