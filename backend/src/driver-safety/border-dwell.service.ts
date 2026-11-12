import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IngestFixDto, ListSessionsQueryDto } from './dto/border-dwell.dto';

/**
 * Border dwell sessions — the measured time a driver spends inside a border
 * geofence.
 *
 * WHY THIS SERVICE EXISTS
 * -----------------------
 * `BorderDwellSession` has been in the schema for a long time and nothing ever
 * wrote to it. The one read, in trip-leg.service, derives BORDER trip legs from
 * sessions — so that derivation has always found an empty table, and the
 * Border Dwell page in the frontend has been calling `GET /border-dwell/sessions`
 * against an endpoint that did not exist. The feature was a model, a reader and
 * a screen, with no writer in the middle.
 *
 * This is the writer.
 *
 * THE STATE MACHINE
 * -----------------
 * A fix inside an active geofence opens a session, or extends the OPEN one for
 * that driver and geofence. A fix outside closes it. Three states:
 *
 *   OPEN    currently inside; exitedAt is null
 *   CLOSED  left the geofence, and the fixes covering the visit are dense
 *           enough to trust the duration
 *   GAPPED  left the geofence, but the largest gap between consecutive fixes
 *           exceeded GAP_THRESHOLD_SECONDS, so the duration is a floor rather
 *           than a measurement
 *
 * GAPPED exists because a phone in a border queue loses signal, and a session
 * assembled from two fixes ten minutes apart is not evidence of a ten-minute
 * dwell — it is evidence of *at least* that. Downstream, trip-leg.service
 * already refuses to call a GAPPED session MEASURED; this is where that
 * distinction is earned.
 *
 * TENANT SCOPING
 * --------------
 * Every query filters by companyId, and a caller-supplied driverId is verified
 * to belong to this tenant rather than trusted.
 */

/** A gap longer than this makes the resulting duration a floor, not a measure. */
export const GAP_THRESHOLD_SECONDS = 300;

export type DwellSessionRow = {
  id: string;
  companyId: string;
  postId: string;
  postCode: string;
  postName: string;
  geofenceId: string;
  driverId: string | null;
  driverName: string | null;
  state: 'CLOSED' | 'GAPPED' | 'OPEN';
  enteredAt: string;
  enteredFromFixAt: string | null;
  exitedAt: string | null;
  exitedFromFixAt: string | null;
  sampleCount: number;
  precisionSeconds: number | null;
  gapLargestSeconds: number | null;
  direction: 'INBOUND' | 'OUTBOUND';
  source: 'GPS_PORTAL' | 'MANUAL';
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class BorderDwellService {
  private readonly logger = new Logger(BorderDwellService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Ingest ────────────────────────────────────────────────────────────────

  /**
   * Record one GPS fix and reconcile open sessions against it.
   *
   * The geofences containing this fix are opened or extended; every other
   * session open for this driver is closed, because a driver cannot be inside
   * two border posts at once.
   */
  async ingestFix(companyId: string, dto: IngestFixDto, user: any) {
    const at = dto.at ? new Date(dto.at) : new Date();
    if (Number.isNaN(at.getTime())) {
      throw new BadRequestException('at is not a valid ISO-8601 timestamp');
    }
    const samples = dto.samples ?? 1;

    // One tenant-scoped transaction for the whole reconciliation, so a fix that
    // closes one post and opens the next cannot leave the driver half-moved.
    // This is also a device-facing path, which is what withTenant is for: the
    // database refuses cross-tenant rows even if a filter above is wrong.
    //
    // The driver resolution is inlined rather than extracted into a helper on
    // purpose. scripts/tenant-context-coverage.mjs decides whether an operation
    // is contextualised by whether it sits inside the lexical span of a
    // `withTenant(` call, so a helper would be counted as bare while genuinely
    // running on the transaction client — and an audit that disagrees with
    // runtime is worse than no audit. Keeping it inline is what lets the number
    // mean what it says.
    return this.prisma.withTenant(companyId, async (tx) => {
      const isDriver = String(user?.role ?? '').toUpperCase() === 'DRIVER';
      let driver: { id: string; name?: string | null };

      if (isDriver) {
        const mine = await tx.driver.findFirst({
          where: { companyId, userId: user?.id ?? user?.sub },
          select: { id: true, name: true },
        });
        if (!mine) throw new NotFoundException('No driver record for this account');
        // A driver naming someone else is refused rather than silently ignored:
        // a session records who was at the border.
        if (dto.driverId && dto.driverId !== mine.id) {
          throw new ForbiddenException('A driver may only report their own position');
        }
        driver = mine;
      } else {
        if (!dto.driverId) {
          throw new BadRequestException('driverId is required for a non-driver caller');
        }
        const subject = await tx.driver.findFirst({
          where: { id: dto.driverId, companyId },
          select: { id: true, name: true },
        });
        // Not-found rather than forbidden: it tells a caller with a stale
        // driver list that the record is gone, without confirming whether the
        // id exists in another tenant.
        if (!subject) throw new NotFoundException('Driver not found in this tenant');
        driver = subject;
      }

      const geofences = await tx.borderGeofence.findMany({
        where: { companyId, isActive: true },
        include: { post: { select: { id: true, code: true, name: true } } },
      });

      const inside = geofences.filter(
        (g) => this.haversineMetres(dto.lat, dto.lng, g.lat, g.lng) <= g.radiusM,
      );
      const insideIds = new Set(inside.map((g) => g.id));

      const open = await tx.borderDwellSession.findMany({
        where: { companyId, driverId: driver.id, state: 'OPEN' },
      });

      const opened: string[] = [];
      const closed: string[] = [];

      // Close anything this driver has left: they cannot be at two posts at once.
      for (const session of open) {
        if (insideIds.has(session.geofenceId)) continue;
        const gap = this.largestGapSeconds(session, at);
        const precision = Math.max(
          0,
          Math.round((at.getTime() - new Date(session.enteredAt).getTime()) / 1000),
        );
        await tx.borderDwellSession.update({
          where: { id: session.id },
          data: {
            state: gap > GAP_THRESHOLD_SECONDS ? 'GAPPED' : 'CLOSED',
            exitedAt: at,
            exitedFromFixAt: at,
            precisionSeconds: precision,
            gapLargestSeconds: gap,
          },
        });
        closed.push(session.id);
      }

      // Open what this fix has arrived in, extend what it is still inside of.
      for (const g of inside) {
        const existing = open.find((s) => s.geofenceId === g.id);
        if (existing) {
          await tx.borderDwellSession.update({
            where: { id: existing.id },
            data: {
              sampleCount: { increment: samples },
              exitedFromFixAt: at,
              gapLargestSeconds: this.largestGapSeconds(existing, at),
            },
          });
          continue;
        }

        const created = await tx.borderDwellSession.create({
          data: {
            companyId,
            postId: g.postId,
            geofenceId: g.id,
            driverId: driver.id,
            state: 'OPEN',
            enteredAt: at,
            enteredFromFixAt: at,
            exitedFromFixAt: at,
            sampleCount: samples,
            direction: this.directionFor(g.side),
            source: 'GPS_PORTAL',
          },
        });
        opened.push(created.id);
      }

      if (opened.length || closed.length) {
        this.logger.log(
          `dwell ingest tenant=${companyId} driver=${driver.id} opened=${opened.length} closed=${closed.length}`,
        );
      }

      return {
        at: at.toISOString(),
        driverId: driver.id,
        geofencesEvaluated: geofences.length,
        opened,
        closed,
      };
    });
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  /**
   * Sessions for this tenant, flattened into the shape the Border Dwell board
   * renders: post and driver resolved to the labels a dispatcher reads.
   */
  async listSessions(companyId: string, query: ListSessionsQueryDto = {}): Promise<DwellSessionRow[]> {
    const state = query.state ? String(query.state).toUpperCase() : undefined;
    if (state && !['OPEN', 'CLOSED', 'GAPPED'].includes(state)) {
      throw new BadRequestException(`Unknown state "${query.state}"`);
    }

    const rows = await this.prisma.withTenant(companyId, (tx) =>
      tx.borderDwellSession.findMany({
      where: { companyId, ...(state ? { state } : {}) },
      orderBy: [{ enteredAt: 'desc' }],
      take: query.take ?? 200,
      include: {
        post: { select: { code: true, name: true } },
        driver: { select: { name: true } },
      },
    }));

    return rows.map((r: any) => ({
      id: r.id,
      companyId: r.companyId,
      postId: r.postId,
      postCode: r.post?.code ?? '',
      postName: r.post?.name ?? '',
      geofenceId: r.geofenceId,
      driverId: r.driverId,
      driverName: r.driver?.name ?? null,
      state: r.state,
      enteredAt: this.iso(r.enteredAt),
      enteredFromFixAt: this.iso(r.enteredFromFixAt),
      exitedAt: this.iso(r.exitedAt),
      exitedFromFixAt: this.iso(r.exitedFromFixAt),
      sampleCount: r.sampleCount,
      precisionSeconds: r.precisionSeconds,
      gapLargestSeconds: r.gapLargestSeconds,
      direction: r.direction,
      source: r.source,
      createdAt: this.iso(r.createdAt),
      updatedAt: this.iso(r.updatedAt),
    }));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private iso(v: unknown): any {
    return v == null ? null : new Date(v as any).toISOString();
  }

  /**
   * Largest gap between consecutive fixes, including the one being ingested.
   *
   * While a session is OPEN, `exitedFromFixAt` is the timestamp of the most
   * recent fix — it doubles as "last seen inside", which is also true.
   */
  private largestGapSeconds(session: any, at: Date): number {
    const previous = session.exitedFromFixAt ?? session.enteredAt;
    if (!previous) return 0;
    const gap = Math.max(0, Math.round((at.getTime() - new Date(previous).getTime()) / 1000));
    return Math.max(Number(session.gapLargestSeconds ?? 0), gap);
  }

  /**
   * Direction of travel implied by which side of the border the geofence sits
   * on. Inward for an import post, outward for an export post, and inbound when
   * a geofence serves both — the ambiguity is real and is recorded as a choice
   * rather than guessed per fix.
   */
  private directionFor(side: string): 'INBOUND' | 'OUTBOUND' {
    const s = String(side ?? '').toUpperCase();
    if (s === 'EXPORT') return 'OUTBOUND';
    return 'INBOUND';
  }

  /** Haversine distance in metres between two lat/lng points. */
  private haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
}
