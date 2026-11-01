import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventsGateway } from '../gateway/events.gateway';

/**
 * WP3: Cross-border dwell measurement service.
 *
 * Derives dwell at the moment of crossing — one session per visit to a
 * border geofence, not a breadcrumb track. Entry and exit are bounded by
 * GPS fixes, never presented as exact timestamps.
 *
 * Session lifecycle:
 *   - OPEN:   first fix inside a geofence with no open session → visit started
 *   - CLOSED: a later fix outside bounds exit between last-inside and first-outside fixes
 *   - GAPPED: a gap between consecutive samples inside the session exceeds threshold
 *
 * Never closed sessions remain OPEN — counted separately, excluded from
 * headline numbers (median/P90/n), never folded in as zeros.
 *
 * Tenant-scoped throughout: every operation filters by companyId.
 */

const GAP_THRESHOLD_SECONDS = 15 * 60 * 1000; // 15 min gap → GAPPED

@Injectable()
export class BorderDwellService {
  private readonly logger = new Logger(BorderDwellService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private gateway: EventsGateway,
  ) {}

  // ═════════════════════════════════════════════════════════════════════════════
  // CORE: Evaluate driver position against border geofences
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Called on every GPS update (every 30s foreground). Evaluates border
   * geofences in the same pass as safety zones — no new ping path, no duplicate
   * position handling.
   *
   * Returns any dwell session state changes so the caller can surface them.
   */
  async checkBorderGeofences(
    driverId: string,
    companyId: string,
    lat: number,
    lng: number,
    speed?: number,
  ): Promise<{ sessions: any[]; refused?: string }> {
    // Get all active border geofences for this company
    const geofences = await this.prisma.borderGeofence.findMany({
      where: { companyId, isActive: true },
      include: { post: true },
    });

    if (geofences.length === 0) return { sessions: [] };

    // Resolve the driver IN THIS TENANT before writing anything
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, companyId },
      select: { id: true, name: true, vehicleReg: true },
    });
    if (!driver) {
      this.logger.warn(
        `Border dwell check refused: driver ${driverId} is not in company ${companyId}`,
      );
      return { sessions: [], refused: 'DRIVER_NOT_IN_TENANT' };
    }

    const sessions: any[] = [];
    const now = new Date();

    for (const geofence of geofences) {
      const distance = this.haversineMetres(lat, lng, geofence.lat, geofence.lng);
      const inside = distance <= geofence.radiusM;

      // Find any open session for this driver + geofence
      const openSession = await this.prisma.borderDwellSession.findFirst({
        where: {
          companyId,
          geofenceId: geofence.id,
          driverId: driver.id,
          state: 'OPEN',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (inside) {
        // Driver is inside this geofence
        if (!openSession) {
          // Open a new session — entry bounded by this fix, not exact
          const session = await this.prisma.borderDwellSession.create({
            data: {
              companyId,
              postId: geofence.postId,
              geofenceId: geofence.id,
              driverId: driver.id,
              vehicleReg: driver.vehicleReg ?? null,
              enteredAt: now,
              enteredFromFixAt: now,
              state: 'OPEN',
              sampleCount: 1,
              precisionSeconds: null,
              gapLargestSeconds: null,
              direction: null,
              source: 'GPS_PORTAL',
            },
          });

          sessions.push(session);

          await this.audit.record({
            actorId: driver.id,
            actorType: 'tenant',
            action: 'border_dwell.session_opened',
            targetId: session.id,
            targetType: 'border_dwell_session',
            metadata: {
              postId: geofence.postId,
              geofenceId: geofence.id,
              geofenceCode: geofence.code,
              geofenceSide: geofence.side,
              lat,
              lng,
            },
          });

          this.logger.log(
            `🟢 Border dwell opened: ${driver.name} at ${geofence.code} (${geofence.side})`,
          );
        } else {
          // Update existing open session — increment sample count, track gap
          const lastFix = openSession.enteredFromFixAt;
          const gapMs = lastFix ? now.getTime() - lastFix.getTime() : 0;
          const gapSeconds = Math.floor(gapMs / 1000);
          const isGapped = gapMs > GAP_THRESHOLD_SECONDS;

          const session = await this.prisma.borderDwellSession.update({
            where: { id: openSession.id },
            data: {
              sampleCount: openSession.sampleCount + 1,
              ...(isGapped ? { state: 'GAPPED', gapLargestSeconds: gapSeconds } : {}),
            },
          });

          sessions.push(session);
        }
      } else {
        // Driver is outside this geofence
        if (openSession) {
          // Close the session — exit bounded by this fix
          const lastInsideFix = openSession.enteredFromFixAt;
          const precisionMs = lastInsideFix ? now.getTime() - lastInsideFix.getTime() : 0;

          const session = await this.prisma.borderDwellSession.update({
            where: { id: openSession.id },
            data: {
              exitedAt: now,
              exitedFromFixAt: now,
              state: 'CLOSED',
              precisionSeconds: Math.floor(precisionMs / 1000),
            },
          });

          sessions.push(session);

          await this.audit.record({
            actorId: driver.id,
            actorType: 'tenant',
            action: 'border_dwell.session_closed',
            targetId: session.id,
            targetType: 'border_dwell_session',
            metadata: {
              postId: geofence.postId,
              geofenceId: geofence.id,
              durationSeconds: session.exitedAt
                ? Math.floor(
                    (new Date(session.exitedAt).getTime() -
                      new Date(session.enteredAt!).getTime()) /
                    1000,
                  )
                : null,
            },
          });

          this.logger.log(
            `🔴 Border dwell closed: ${driver.name} at ${geofence.code} (${geofence.side})`,
          );
        }
      }
    }

    return { sessions };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // AGGREGATES: Median / P90 / n per post, computed on read
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Get dwell aggregates for a border post within a time window.
   * Returns median, P90, n, and completeness split (CLOSED/OPEN/GAPPED).
   * Suppresses below the threshold (default n >= 5).
   */
  async getDwellAggregates(
    companyId: string,
    postId: string,
    windowStart?: Date,
    windowEnd?: Date,
    suppressionThreshold = 5,
  ) {
    const where: any = {
      companyId,
      postId,
    };
    if (windowStart || windowEnd) {
      where.createdAt = {};
      if (windowStart) where.createdAt.gte = windowStart;
      if (windowEnd) where.createdAt.lte = windowEnd;
    }

    const sessions = await this.prisma.borderDwellSession.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    const closed = sessions.filter((s) => s.state === 'CLOSED');
    const open = sessions.filter((s) => s.state === 'OPEN');
    const gapped = sessions.filter((s) => s.state === 'GAPPED');

    const durations = closed
      .map((s) => {
        if (!s.enteredAt || !s.exitedAt) return null;
        return (
          new Date(s.exitedAt).getTime() - new Date(s.enteredAt).getTime()
        );
      })
      .filter((d): d is number => d !== null)
      .sort((a, b) => a - b);

    let medianMs: number | null = null;
    let p90Ms: number | null = null;

    if (durations.length > 0) {
      const mid = Math.floor(durations.length / 2);
      medianMs =
        durations.length % 2 === 0
          ? (durations[mid - 1] + durations[mid]) / 2
          : durations[mid];
      const p90Index = Math.ceil(durations.length * 0.9) - 1;
      p90Ms = durations[Math.max(0, p90Index)];
    }

    const suppressed = durations.length < suppressionThreshold;

    return {
      postId,
      companyId,
      windowStart,
      windowEnd,
      suppressed,
      suppressionThreshold,
      n: durations.length,
      closedCount: closed.length,
      openCount: open.length,
      gappedCount: gapped.length,
      medianMs,
      p90Ms,
      medianMinutes: medianMs ? Math.round(medianMs / 1000 / 60) : null,
      p90Minutes: p90Ms ? Math.round(p90Ms / 1000 / 60) : null,
      completeness: {
        closed: closed.length,
        open: open.length,
        gapped: gapped.length,
        total: sessions.length,
      },
    };
  }

  /**
   * Get all dwell sessions for a tenant, optionally filtered by post and state.
   */
  async getDwellSessions(
    companyId: string,
    postId?: string,
    state?: string,
    limit = 50,
  ) {
    const where: any = { companyId };
    if (postId) where.postId = postId;
    if (state) where.state = state;

    return this.prisma.borderDwellSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      include: {
        post: { select: { id: true, code: true, name: true } },
        geofence: { select: { id: true, code: true, side: true } },
      },
    });
  }

  /**
   * Get all border posts for a tenant.
   */
  async getBorderPosts(companyId: string) {
    return this.prisma.borderPost.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
      include: {
        geofences: {
          where: { isActive: true },
          select: { id: true, code: true, name: true, side: true, radiusM: true },
        },
      },
    });
  }

  /**
   * Get a single border post with its geofences.
   */
  async getBorderPost(companyId: string, postId: string) {
    const post = await this.prisma.borderPost.findFirst({
      where: { id: postId, companyId },
      include: {
        geofences: { where: { isActive: true } },
        dwellSessions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!post) throw new NotFoundException('Border post not found');
    return post;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═════════════════════════════════════════════════════════════════════════════

  /** Haversine distance in metres between two lat/lng points. */
  private haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6_371_000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
