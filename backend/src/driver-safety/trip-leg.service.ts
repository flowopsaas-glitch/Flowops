import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * WP3 Stage 4: Trip corridor split with provenance labels.
 *
 * Splits a cross-border trip into legs, each with an explicit provenance
 * label (MEASURED / DECLARED / REFERENCE). A trip total is MEASURED only
 * when every leg is MEASURED — REFERENCE legs are planning-only and never
 * summed into a measured total.
 *
 * BORDER legs are derived from BorderDwellSession rows:
 *   - CLOSED session → MEASURED leg with durationMinutes from the session
 *   - GAPPED / OPEN session → MEASURED leg with durationMinutes = null and
 *     a confidenceNote explaining the gap
 *   - No session → no BORDER leg (absence is honest, not a zero)
 *
 * Tenant-scoped throughout: every operation filters by companyId.
 */

@Injectable()
export class TripLegService {
  private readonly logger = new Logger(TripLegService.name);

  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // ═════════════════════════════════════════════════════════════════════════════
  // TRIP CRUD
  // ════════════════════════════════════════════════════════════════════════════

  async createTrip(
    companyId: string,
    data: {
      reference: string;
      driverId?: string;
      vehicleReg?: string;
      origin?: string;
      destination?: string;
      plannedStart?: Date;
      plannedEnd?: Date;
    },
  ) {
    const driver =
      data.driverId &&
      (await this.prisma.driver.findFirst({
        where: { id: data.driverId, companyId },
      }));
    if (data.driverId && !driver) {
      throw new NotFoundException('Driver not found in this tenant');
    }

    const trip = await this.prisma.trip.create({
      data: {
        companyId,
        reference: data.reference,
        driverId: data.driverId ?? null,
        vehicleReg: data.vehicleReg ?? null,
        origin: data.origin ?? null,
        destination: data.destination ?? null,
        plannedStart: data.plannedStart ?? null,
        plannedEnd: data.plannedEnd ?? null,
      },
      include: { legs: true },
    });

    await this.audit.record({
      actorId: data.driverId ?? null,
      actorType: 'tenant',
      action: 'trip.created',
      targetId: trip.id,
      targetType: 'trip',
      metadata: { reference: data.reference, origin: data.origin, destination: data.destination },
    });

    return trip;
  }

  async getTrip(companyId: string, tripId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, companyId },
      include: {
        legs: {
          orderBy: { createdAt: 'asc' },
          include: {
            post: { select: { id: true, code: true, name: true } },
            dwellSession: {
              select: {
                id: true,
                state: true,
                enteredAt: true,
                exitedAt: true,
                precisionSeconds: true,
                gapLargestSeconds: true,
              },
            },
          },
        },
      },
    });
    if (!trip) throw new NotFoundException('Trip not found');
    return this.annotateTrip(trip);
  }

  async getTrips(companyId: string, status?: string, limit = 50) {
    const where: any = { companyId };
    if (status) where.status = status;

    const trips = await this.prisma.trip.findMany({
      where,
      include: {
        legs: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });

    return trips.map((t) => this.annotateTrip(t));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // LEG DERIVATION FROM DWELL SESSIONS (Stage 4 core)
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Derive BORDER legs for a trip from its border dwell sessions.
   *
   * For each CLOSED dwell session linked to the trip's posts, creates a
   * MEASURED BORDER leg with durationMinutes from the session.
   * For each GAPPED/OPEN session, creates a MEASURED BORDER leg with
   * durationMinutes = null and a confidenceNote — absence of a duration is
   * honest, not a zero.
   *
   * Idempotent: skips legs that already have a dwellSessionId link.
   */
  async deriveBorderLegsFromDwellSessions(
    companyId: string,
    tripId: string,
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, companyId },
      include: {
        legs: {
          where: { kind: 'BORDER' },
          select: { id: true, dwellSessionId: true, postId: true },
        },
      },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    const existingSessionIds = new Set(
      trip.legs.map((l) => l.dwellSessionId).filter(Boolean),
    );

    // Get all dwell sessions for this company, ordered by time.
    // Exclude sessions that already have a leg derived from them.
    const sessions = await this.prisma.borderDwellSession.findMany({
      where: {
        companyId,
        state: { in: ['CLOSED', 'GAPPED', 'OPEN'] },
        tripLegs: { none: {} },
      },
      orderBy: { enteredAt: 'asc' },
      include: { post: true },
    });

    const createdLegs: any[] = [];

    for (const session of sessions) {
      if (existingSessionIds.has(session.id)) continue;

      const isMeasured = session.state === 'CLOSED';
      const durationMinutes = isMeasured
        ? session.enteredAt && session.exitedAt
          ? Math.round(
              (new Date(session.exitedAt).getTime() -
                new Date(session.enteredAt).getTime()) /
              1000 /
              60,
            )
          : null
        : null;

      const confidenceNote =
        session.state === 'GAPPED'
          ? `GAPPED dwell session (largest gap ${session.gapLargestSeconds ?? 0}s) — dwell at ${session.post.code} observed, duration unknown`
          : session.state === 'OPEN'
            ? `OPEN dwell session at ${session.post.code} — exit not observed, duration unknown`
            : null;

      const leg = await this.prisma.tripLeg.create({
        data: {
          companyId,
          tripId,
          kind: 'BORDER',
          postId: session.postId,
          dwellSessionId: session.id,
          startedAt: session.enteredAt ?? null,
          endedAt: session.exitedAt ?? null,
          durationMinutes,
          provenance: 'MEASURED',
          source: `border_dwell_session:${session.id}`,
          confidenceNote,
          notes: `Derived from ${session.state} dwell session at ${session.post.code} (${session.post.name})`,
        },
      });

      createdLegs.push(leg);

      await this.audit.record({
        actorId: session.driverId ?? null,
        actorType: 'tenant',
        action: 'trip_leg.derived_from_dwell',
        targetId: leg.id,
        targetType: 'trip_leg',
        metadata: {
          tripId,
          postId: session.postId,
          dwellSessionId: session.id,
          state: session.state,
          durationMinutes,
          provenance: 'MEASURED',
        },
      });
    }

    return createdLegs;
  }

  /**
   * Create a DECLARED BORDER leg — dispatcher keys in a duration.
   * DECLARED legs are not MEASURED; a trip with any DECLARED leg is not
   * fully MEASURED.
   */
  async createDeclaredLeg(
    companyId: string,
    tripId: string,
    data: {
      postId?: string;
      startedAt?: Date;
      endedAt?: Date;
      durationMinutes?: number;
      confidenceNote?: string;
      notes?: string;
      capturedBy: string;
    },
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, companyId },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    const leg = await this.prisma.tripLeg.create({
      data: {
        companyId,
        tripId,
        kind: 'BORDER',
        postId: data.postId ?? null,
        startedAt: data.startedAt ?? null,
        endedAt: data.endedAt ?? null,
        durationMinutes: data.durationMinutes ?? null,
        provenance: 'DECLARED',
        source: `declared:${data.capturedBy}`,
        confidenceNote: data.confidenceNote ?? null,
        notes: data.notes ?? null,
      },
    });

    await this.audit.record({
      actorId: data.capturedBy,
      actorType: 'tenant',
      action: 'trip_leg.declared',
      targetId: leg.id,
      targetType: 'trip_leg',
      metadata: { tripId, postId: data.postId, durationMinutes: data.durationMinutes },
    });

    return leg;
  }

  /**
   * Create a REFERENCE leg from the static corridor table — planning only.
   * REFERENCE legs are never summed into a measured trip total.
   */
  async createReferenceLeg(
    companyId: string,
    tripId: string,
    data: {
      kind: 'LINEHAUL' | 'CLEARING' | 'BOND' | 'EMPTY_RETURN' | 'BORDER';
      postId?: string;
      durationMinutes?: number;
      source?: string;
      notes?: string;
    },
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, companyId },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    const leg = await this.prisma.tripLeg.create({
      data: {
        companyId,
        tripId,
        kind: data.kind,
        postId: data.postId ?? null,
        durationMinutes: data.durationMinutes ?? null,
        provenance: 'REFERENCE',
        source: data.source ?? 'static-corridor-table',
        notes: data.notes ?? null,
      },
    });

    await this.audit.record({
      actorId: null,
      actorType: 'system',
      action: 'trip_leg.reference_created',
      targetId: leg.id,
      targetType: 'trip_leg',
      metadata: { tripId, kind: data.kind, provenance: 'REFERENCE' },
    });

    return leg;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TRIP TOTAL WITH PROVENANCE
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Compute the trip's total duration and provenance.
   * Returns MEASURED only when every leg is MEASURED and has durationMinutes.
   * Any DECLARED or REFERENCE leg, or any MEASURED leg with null duration,
   * makes the trip total partial (not MEASURED).
   */
  private annotateTrip(trip: any) {
    const legs = trip.legs ?? [];
    const measuredLegs = legs.filter((l) => l.provenance === 'MEASURED');
    const declaredLegs = legs.filter((l) => l.provenance === 'DECLARED');
    const referenceLegs = legs.filter((l) => l.provenance === 'REFERENCE');

    const allMeasured = legs.length > 0 && measuredLegs.length === legs.length;
    const allMeasuredWithDuration =
      allMeasured && measuredLegs.every((l) => l.durationMinutes != null);

    const totalDurationMinutes = allMeasuredWithDuration
      ? measuredLegs.reduce((sum, l) => sum + (l.durationMinutes ?? 0), 0)
      : null;

    let tripProvenance: 'MEASURED' | 'PARTIAL' | 'REFERENCE_ONLY' | 'UNKNOWN';
    if (legs.length === 0) {
      tripProvenance = 'UNKNOWN';
    } else if (allMeasuredWithDuration) {
      tripProvenance = 'MEASURED';
    } else if (referenceLegs.length === legs.length) {
      tripProvenance = 'REFERENCE_ONLY';
    } else {
      tripProvenance = 'PARTIAL';
    }

    return {
      ...trip,
      legs,
      summary: {
        totalLegs: legs.length,
        measuredLegs: measuredLegs.length,
        declaredLegs: declaredLegs.length,
        referenceLegs: referenceLegs.length,
        totalDurationMinutes,
        provenance: tripProvenance,
        isFullyMeasured: tripProvenance === 'MEASURED',
      },
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  async updateTripStatus(
    companyId: string,
    tripId: string,
    status: string,
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, companyId },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    return this.prisma.trip.update({
      where: { id: tripId },
      data: { status },
      include: { legs: true },
    });
  }
}
