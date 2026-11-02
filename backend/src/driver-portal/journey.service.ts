import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  JourneyStatus,
  JourneyStageStatus,
  JourneyUpdateStatus,
  JourneyUpdateType,
  JourneyStageType,
} from '@prisma/client';
import { chatMessageKey, verifyChatRetry } from './chat-idempotency';

type UpdatePayload = {
  type: JourneyUpdateType;
  message: string;
  clientMessageId?: string | undefined;
  deviceOccurredAt?: Date | null;
  stageId?: string | null;
};

/**
 * Journey truth + communication (WP2 slice).
 *
 * A Journey is a tenant-scoped container of ordered planned stages. A driver
 * assigned to a journey sends updates against stages; the dispatcher receives,
 * acknowledges, assigns and resolves. Times are labelled by provenance:
 * deviceOccurredAt (driver-claimed) vs serverReceivedAt (server-observed).
 * Corrections append; they never silently overwrite history.
 *
 * Tenant-scoped throughout: every operation filters by companyId so a driver
 * or dispatcher can only touch their own tenant's journeys.
 */
@Injectable()
export class JourneyService {
  private readonly logger = new Logger(JourneyService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ── Journey lifecycle (office/dispatch) ──────────────────────────────────

  async createJourney(companyId: string, data: {
    reference: string;
    driverId?: string | null;
    origin?: string | null;
    destination?: string | null;
    plannedStart?: Date | null;
    plannedEnd?: Date | null;
  }) {
    if (!data.reference || !data.reference.trim()) {
      throw new BadRequestException('Journey reference is required');
    }

    // Tenant-scoped: driver must belong to the same company
    if (data.driverId) {
      const driver = await this.prisma.driver.findFirst({
        where: { id: data.driverId, companyId },
        select: { id: true },
      });
      if (!driver) throw new NotFoundException('Driver not found in this company');
    }

    const journey = await this.prisma.journey.create({
      data: {
        company: { connect: { id: companyId } },
        reference: data.reference.trim(),
        ...(data.driverId ? { driver: { connect: { id: data.driverId } } } : {}),
        origin: data.origin ?? null,
        destination: data.destination ?? null,
        plannedStart: data.plannedStart ?? null,
        plannedEnd: data.plannedEnd ?? null,
        status: JourneyStatus.PLANNED,
      },
      include: { driver: { select: { id: true, name: true, phone: true } } },
    });

    await this.audit.record({
      actorId: null, // office/dispatch user id to be populated by caller
      actorType: 'tenant',
      action: 'journey.created',
      targetId: journey.id,
      targetType: 'journey',
      metadata: { reference: journey.reference },
    });

    return journey;
  }

  async addStage(companyId: string, journeyId: string, data: {
    stageNumber: number;
    type: JourneyStageType;
    locationName?: string | null;
    locationRef?: string | null;
    plannedAt?: Date | null;
    notes?: string | null;
  }) {
    const journey = await this.prisma.journey.findFirst({
      where: { id: journeyId, companyId },
      select: { id: true },
    });
    if (!journey) throw new NotFoundException('Journey not found');

    // Ensure stageNumber is unique within this journey
    const existing = await this.prisma.journeyStage.findFirst({
      where: { journeyId, stageNumber: data.stageNumber },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Stage number already exists in this journey');

    const stage = await this.prisma.journeyStage.create({
      data: {
        company: { connect: { id: companyId } },
        journey: { connect: { id: journeyId } },
        stageNumber: data.stageNumber,
        type: data.type,
        locationName: data.locationName ?? null,
        locationRef: data.locationRef ?? null,
        plannedAt: data.plannedAt ?? null,
        status: JourneyStageStatus.PLANNED,
        notes: data.notes ?? null,
      },
    });

    await this.audit.record({
      actorId: null,
      actorType: 'tenant',
      action: 'journey.stage.added',
      targetId: stage.id,
      targetType: 'journey_stage',
      metadata: { journeyId, stageNumber: data.stageNumber, type: data.type },
    });

    return stage;
  }

  async assignDriver(companyId: string, journeyId: string, driverId: string) {
    const journey = await this.prisma.journey.findFirst({
      where: { id: journeyId, companyId },
      select: { id: true, driverId: true },
    });
    if (!journey) throw new NotFoundException('Journey not found');

    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, companyId, isActive: true },
      select: { id: true },
    });
    if (!driver) throw new NotFoundException('Driver not found in this company');

    const updated = await this.prisma.journey.update({
      where: { id: journeyId },
      data: { driverId },
      include: { driver: { select: { id: true, name: true, phone: true } } },
    });

    await this.audit.record({
      actorId: null,
      actorType: 'tenant',
      action: 'journey.driver.assigned',
      targetId: journeyId,
      targetType: 'journey',
      metadata: { driverId },
    });

    return updated;
  }

  async getJourney(companyId: string, journeyId: string) {
    const journey = await this.prisma.journey.findFirst({
      where: { id: journeyId, companyId },
      include: {
        driver: { select: { id: true, name: true, phone: true, vehicleReg: true } },
        stages: {
          orderBy: { stageNumber: 'asc' },
          include: {
            updates: {
              orderBy: { createdAt: 'desc' },
              take: 5,
            },
          },
        },
        updates: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!journey) throw new NotFoundException('Journey not found');
    return journey;
  }

  async listJourneys(companyId: string, status?: JourneyStatus) {
    return this.prisma.journey.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      include: {
        driver: { select: { id: true, name: true, vehicleReg: true, status: true } },
        _count: { select: { stages: true, updates: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Driver-originated update (with idempotency + time provenance) ────────

  async sendUpdate(
    driverId: string,
    companyId: string,
    journeyId: string,
    data: UpdatePayload,
  ) {
    if (!data.message || !data.message.trim()) {
      throw new BadRequestException('Update message is required');
    }
    if (data.message.length > 4000) {
      throw new BadRequestException('Update message is too long');
    }

    // Tenant-scoped: driver must belong to the company and be assigned to the journey
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, companyId, isActive: true },
      select: { id: true },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    const journey = await this.prisma.journey.findFirst({
      where: { id: journeyId, companyId },
      select: { id: true, driverId: true },
    });
    if (!journey) throw new NotFoundException('Journey not found');
    if (journey.driverId && journey.driverId !== driverId) {
      throw new BadRequestException('Driver is not assigned to this journey');
    }

    // Validate stage belongs to this journey if provided
    if (data.stageId) {
      const stage = await this.prisma.journeyStage.findFirst({
        where: { id: data.stageId, journeyId, companyId },
        select: { id: true },
      });
      if (!stage) throw new NotFoundException('Stage not found in this journey');
    }

    const key = data.clientMessageId ? chatMessageKey(data.clientMessageId) : undefined;
    const payload: UpdatePayload & { serverReceivedAt: Date } = {
      type: data.type,
      message: data.message.trim(),
      clientMessageId: key,
      deviceOccurredAt: data.deviceOccurredAt ?? null,
      stageId: data.stageId ?? null,
      serverReceivedAt: new Date(),
    };

    try {
      const update = await this.prisma.journeyUpdate.create({
        data: {
          journeyId,
          companyId,
          type: payload.type,
          message: payload.message,
          ...(key ? { clientMessageId: key } : {}),
          deviceOccurredAt: payload.deviceOccurredAt,
          stageId: payload.stageId,
          status: JourneyUpdateStatus.PENDING,
        },
        include: {
          stage: { select: { id: true, stageNumber: true, type: true, locationName: true } },
        },
      });

      await this.audit.record({
        actorId: driverId,
        actorType: 'tenant',
        action: 'journey.update.sent',
        targetId: update.id,
        targetType: 'journey_update',
        metadata: {
          journeyId,
          type: payload.type,
          deviceOccurredAt: payload.deviceOccurredAt,
        },
      });

      return update;
    } catch (error) {
      // Database unique index is the concurrency barrier for idempotent retries.
      if (!key || (error as { code?: string })?.code !== 'P2002') throw error;
      const existing = await this.prisma.journeyUpdate.findFirst({
        where: { journeyId, driverId, companyId, clientMessageId: key },
        include: {
          stage: { select: { id: true, stageNumber: true, type: true, locationName: true } },
        },
      });
      if (!existing) throw error;
      if (existing.message !== payload.message) {
        throw new ConflictException('clientMessageId was already used for a different message');
      }
      return existing;
    }
  }

  // ── Dispatcher acknowledgment / resolution ───────────────────────────────

  async acknowledgeUpdate(
    companyId: string,
    updateId: string,
    acknowledgedBy: string,
  ) {
    const update = await this.prisma.journeyUpdate.findFirst({
      where: { id: updateId, companyId },
      include: { journey: { select: { id: true, driverId: true } } },
    });
    if (!update) throw new NotFoundException('Journey update not found');

    const acknowledged = await this.prisma.journeyUpdate.update({
      where: { id: updateId },
      data: {
        status: JourneyUpdateStatus.ACKNOWLEDGED,
        acknowledgedAt: new Date(),
        acknowledgedBy,
      },
      include: {
        stage: { select: { id: true, stageNumber: true, type: true, locationName: true } },
      },
    });

    await this.audit.record({
      actorId: acknowledgedBy,
      actorType: 'tenant',
      action: 'journey.update.acknowledged',
      targetId: updateId,
      targetType: 'journey_update',
      metadata: { journeyId: update.journeyId },
    });

    return acknowledged;
  }

  async resolveUpdate(
    companyId: string,
    updateId: string,
    resolvedBy: string,
    resolutionNote?: string | null,
  ) {
    const update = await this.prisma.journeyUpdate.findFirst({
      where: { id: updateId, companyId },
      include: { journey: { select: { id: true, driverId: true } } },
    });
    if (!update) throw new NotFoundException('Journey update not found');

    const resolved = await this.prisma.journeyUpdate.update({
      where: { id: updateId },
      data: {
        status: JourneyUpdateStatus.RESOLVED,
        acknowledgedAt: new Date(),
        acknowledgedBy: resolvedBy,
        resolutionNote: resolutionNote ?? null,
      },
      include: {
        stage: { select: { id: true, stageNumber: true, type: true, locationName: true } },
      },
    });

    await this.audit.record({
      actorId: resolvedBy,
      actorType: 'tenant',
      action: 'journey.update.resolved',
      targetId: updateId,
      targetType: 'journey_update',
      metadata: { journeyId: update.journeyId, resolutionNote },
    });

    return resolved;
  }

  async getJourneyUpdates(
    companyId: string,
    journeyId: string,
    limit = 50,
    skip = 0,
  ) {
    const journey = await this.prisma.journey.findFirst({
      where: { id: journeyId, companyId },
      select: { id: true },
    });
    if (!journey) throw new NotFoundException('Journey not found');

    return this.prisma.journeyUpdate.findMany({
      where: { journeyId, companyId },
      include: {
        driver: { select: { id: true, name: true } },
        stage: { select: { id: true, stageNumber: true, type: true, locationName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      skip: Math.max(skip, 0),
    });
  }

  // ── Journey status transitions (office) ──────────────────────────────────

  async updateJourneyStatus(
    companyId: string,
    journeyId: string,
    status: JourneyStatus,
  ) {
    const journey = await this.prisma.journey.findFirst({
      where: { id: journeyId, companyId },
      select: { id: true, status: true, actualStart: true },
    });
    if (!journey) throw new NotFoundException('Journey not found');

    const data: { status: JourneyStatus; actualStart?: Date; actualEnd?: Date } = { status };
    if (status === JourneyStatus.IN_TRANSIT && !journey.actualStart) {
      data.actualStart = new Date();
    }
    if (status === JourneyStatus.COMPLETED) {
      data.actualEnd = new Date();
    }

    return this.prisma.journey.update({
      where: { id: journeyId },
      data,
      include: { driver: { select: { id: true, name: true, vehicleReg: true } } },
    });
  }
}
// CI re-trigger
