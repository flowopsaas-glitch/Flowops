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
  // ═════════════════════════════════════════════════════════════════════════════

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
    if (!data.reference || !data.reference.trim()) {
      throw new BadRequestException('Trip reference is required');
    }

    if (data.driverId) {
      const driver = await this.prisma.driver.findFirst({
        where: { id: data.driverId, companyId },
        select: { id: true },
      });
      if (!driver) throw new NotFoundException('Driver not found in this tenant');
    }

    const trip = await this.prisma.trip.create({
      data: {
        companyId,
        reference: data.reference.trim(),
        driverId: data.driverId ?? null,
        origin: data.origin ?? null,
        destination: data.destination ?? null,
        plannedStart: data.plannedStart ?? null,
        plannedEnd: data.plannedEnd ?? null,
        status: 'PLANNED',
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

  // ═════════════════════════════════════════════════════════════════════════════
  // LEG DERIVATION FROM DWELL SESSIONS (Stage 4 core)
  // ═════════════════════════════════════════════════════════════════════════════

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

  // ═════════════════════════════════════════════════════════════════════════════
  // STAGE 5: HS CODE, ORIGIN STATUS, DUTY ESTIMATED vs ACTUAL
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * HS code format validation: 6 to 10 digits. Validated against format only,
   * never against a tariff database we do not have.
   */
  private validateHsCode(hsCode: string): boolean {
    return /^\d{6,10}$/.test(hsCode);
  }

  async setHsOrigin(
    companyId: string,
    tripId: string,
    data: {
      hsCode?: string;
      originStatus?: 'PREFERENTIAL' | 'NON_PREFERENTIAL' | 'UNKNOWN';
      certificateOfOriginRef?: string;
      capturedBy: string;
    },
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, companyId },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    const updateData: any = {};
    if (data.hsCode !== undefined) {
      if (data.hsCode && !this.validateHsCode(data.hsCode)) {
        throw new BadRequestException(
          'hsCode must be 6 to 10 digits (format-validated only)',
        );
      }
      updateData.hsCode = data.hsCode ?? null;
    }
    if (data.originStatus !== undefined) {
      updateData.originStatus = data.originStatus;
    }
    if (data.certificateOfOriginRef !== undefined) {
      updateData.certificateOfOriginRef = data.certificateOfOriginRef ?? null;
    }

    const tripUpdated = await this.prisma.trip.update({
      where: { id: tripId, companyId },
      data: updateData,
    });

    await this.audit.record({
      actorId: data.capturedBy,
      actorType: 'tenant',
      action: 'trip.hs_origin_set',
      targetId: tripId,
      targetType: 'trip',
      metadata: {
        hsCode: data.hsCode,
        originStatus: data.originStatus,
        certificateOfOriginRef: data.certificateOfOriginRef,
      },
    });

    return tripUpdated;
  }

  async setDutyEstimate(
    companyId: string,
    tripId: string,
    data: {
      duty: number;
      estimateSource: string;
      estimateVersion: string;
      capturedBy: string;
    },
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, companyId },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    const tripUpdated = await this.prisma.trip.update({
      where: { id: tripId, companyId },
      data: {
        dutyEstimated: data.duty,
        estimateSource: data.estimateSource,
        estimateVersion: data.estimateVersion,
        estimatedAt: new Date(),
      },
    });

    await this.audit.record({
      actorId: data.capturedBy,
      actorType: 'tenant',
      action: 'trip.duty_estimate_set',
      targetId: tripId,
      targetType: 'trip',
      metadata: {
        dutyEstimated: data.duty,
        estimateSource: data.estimateSource,
        estimateVersion: data.estimateVersion,
        provenance: 'ESTIMATED',
      },
    });

    return tripUpdated;
  }

  async setDutyActual(
    companyId: string,
    tripId: string,
    data: {
      duty: number;
      declarationRef: string;
      capturedBy: string;
    },
  ) {
    if (!data.declarationRef) {
      throw new BadRequestException('declarationRef is required for ACTUAL duty');
    }

    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, companyId },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    const tripUpdated = await this.prisma.trip.update({
      where: { id: tripId, companyId },
      data: {
        dutyActual: data.duty,
        declarationRef: data.declarationRef,
        capturedBy: data.capturedBy,
        capturedAt: new Date(),
      },
    });

    await this.audit.record({
      actorId: data.capturedBy,
      actorType: 'tenant',
      action: 'trip.duty_actual_set',
      targetId: tripId,
      targetType: 'trip',
      metadata: {
        dutyActual: data.duty,
        declarationRef: data.declarationRef,
        provenance: 'ACTUAL',
      },
    });

    return tripUpdated;
  }

  getDutySummary(trip: any) {
    const estimated = trip.dutyEstimated != null
      ? { value: trip.dutyEstimated, source: trip.estimateSource, version: trip.estimateVersion, at: trip.estimatedAt }
      : null;
    const actual = trip.dutyActual != null
      ? { value: trip.dutyActual, declarationRef: trip.declarationRef, capturedBy: trip.capturedBy, at: trip.capturedAt }
      : null;

    let variance: number | null = null;
    let varianceLabel: string | null = null;
    if (estimated && actual) {
      variance = actual.value - estimated.value;
      varianceLabel = variance >= 0 ? `+${variance}` : `${variance}`;
    }

    return {
      tripId: trip.id,
      reference: trip.reference,
      hsCode: trip.hsCode,
      originStatus: trip.originStatus,
      certificateOfOriginRef: trip.certificateOfOriginRef,
      estimated,
      actual,
      variance,
      varianceLabel,
      estimatedLabel: estimated ? `ESTIMATED (${estimated.source} v${estimated.version})` : 'NOT CAPTURED',
      actualLabel: actual ? 'ACTUAL (declaration)' : 'NOT CAPTURED',
      hasBoth: Boolean(estimated && actual),
      hasEstimateOnly: Boolean(estimated && !actual),
      hasActualOnly: Boolean(actual && !estimated),
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // TRIP TOTAL WITH PROVENANCE
  // ═════════════════════════════════════════════════════════════════════════════

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
      dutySummary: this.getDutySummary(trip),
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═════════════════════════════════════════════════════════════════════════════

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
      where: { id: tripId, companyId },
      data: { status },
      include: { legs: true },
    });
  }
}
