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
import { OutboxService } from '../webhooks/outbox.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * WP4 — Safety Incident Layer.
 *
 * Core principle: **a report is a claim; a zone is an assertion.** Only a
 * verified assertion may alert drivers. Two records, not one:
 *
 *   - SafetyIncident — the claim, lifecycle REPORTED → CORROBORATED →
 *     VERIFIED | REJECTED | EXPIRED | WITHDRAWN.
 *   - SafetyZone — the assertion drivers are alerted by, created ONLY on
 *     verification, with expiresAt and incidentId provenance.
 *
 * Abuse handling: rate limit (6/driver/hour), dedupe (10 min, same geohash6+
 * type), contradiction (rejection requires reason + named rejecter),
 * reliability counters (dispatch context only, never automatic sanction).
 *
 * Location privacy: one point + accuracy per incident, no track, no history.
 * Report location nulled after 90 days on closed incidents; alert positions
 * nulled after 180 days. No raw coordinate crosses the tenant boundary.
 *
 * Tenant-scoped throughout: every operation filters by companyId.
 */

// Rate limit: 6 reports per driver per rolling hour, then 15 min cooldown
const RATE_LIMIT_MAX = 6;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000;

// Dedupe: same driver, same geohash6, same type within 10 min → update, not duplicate
const DEDUPE_WINDOW_MS = 10 * 60 * 1000;

// Corroboration defaults
const CORROBORATION_RADIUS_M = 1_500;
const CORROBORATION_WINDOW_MIN = 45;

// Default radius/TTL by type (from §6)
const TYPE_DEFAULTS: Record<string, { radiusM: number; capRadiusM: number; ttlHours: number }> = {
  ROAD_CLOSED:        { radiusM: 2000, capRadiusM: 10000, ttlHours: 6 },
  ACCIDENT:           { radiusM: 1000, capRadiusM: 5000,   ttlHours: 3 },
  HIJACKING_ATTEMPT:  { radiusM: 3000, capRadiusM: 10000,  ttlHours: 12 },
  ROBBERY:            { radiusM: 3000, capRadiusM: 10000,  ttlHours: 12 },
  WEATHER:            { radiusM: 10000, capRadiusM: 50000, ttlHours: 12 },
  STRIKE_PROTEST:     { radiusM: 2000, capRadiusM: 20000,  ttlHours: 24 },
  VEHICLE_HAZARD:     { radiusM: 500,  capRadiusM: 2000,   ttlHours: 2 },
  OTHER:              { radiusM: 1000, capRadiusM: 5000,   ttlHours: 2 },
};

@Injectable()
export class SafetyIncidentService {
  private readonly logger = new Logger(SafetyIncidentService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private gateway: EventsGateway,
    private outbox: OutboxService,
    private notifications: NotificationsService,
  ) {}

  // ═════════════════════════════════════════════════════════════════════════════
  // ONE-TAP REPORT — creates an incident (claim), NOT a zone (assertion)
  // ════════════════════════════════════════════════════════════════════════════

  async reportIncident(
    companyId: string,
    actor: { id?: string | null; email?: string | null; role?: string | null },
    dto: {
      type: string;
      reportLat: number;
      reportLng: number;
      reportAccuracyM?: number;
      locationSource?: 'DEVICE_GPS' | 'MAP_PIN' | 'LAST_KNOWN';
      narrative?: string;
      idempotencyKey: string;
    },
  ) {
    // Resolve the reporter from the session — never from the body.
    const userId = actor?.id ?? null;
    const userRole = actor?.role ?? null;

    // Determine reportedByDriverId (driver self-report) or reportedByUserId (dispatch/admin)
    let reportedByDriverId: string | null = null;
    let reportedByUserId: string | null = null;

    if (String(userRole) === 'DRIVER') {
      const driver = await this.prisma.driver.findFirst({
        where: { userId, companyId },
        select: { id: true },
      });
      if (!driver) {
        throw new ForbiddenException('Your user account is not linked to a driver record in this company');
      }
      reportedByDriverId = driver.id;
    } else {
      // Supervisory role: reportedByUserId is the actor
      reportedByUserId = userId;
    }

    if (!reportedByDriverId && !reportedByUserId) {
      throw new ForbiddenException('Unable to identify the reporter in this tenant');
    }

    // ── Rate limit: 6 reports per driver per rolling hour ──
    const reporterId = reportedByDriverId ?? reportedByUserId!;
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
    const recentCount = await this.prisma.safetyIncident.count({
      where: {
        companyId,
        reportedAt: { gte: windowStart },
        OR: [
          { reportedByDriverId: reporterId },
          ...(reportedByUserId ? [{ reportedByUserId: reporterId }] : []),
        ],
      },
    });
    if (recentCount >= RATE_LIMIT_MAX) {
      const cooldownUntil = new Date(Date.now() + RATE_LIMIT_COOLDOWN_MS);
      throw new BadRequestException(
        `Rate limit reached: ${RATE_LIMIT_MAX} reports per hour. Try again after ${cooldownUntil.toLocaleTimeString()}.`,
      );
    }

    // ── Dedupe: same reporter, same geohash6, same type within 10 min ──
    const geohash6 = this.geohash6(dto.reportLat, dto.reportLng);
    const dedupeStart = new Date(Date.now() - DEDUPE_WINDOW_MS);
    const existing = await this.prisma.safetyIncident.findFirst({
      where: {
        companyId,
        type: dto.type,
        reportedAt: { gte: dedupeStart },
        OR: [
          { reportedByDriverId },
          ...(reportedByUserId ? [{ reportedByUserId }] : []),
        ],
        ...(geohash6 ? { geohash6 } : {}),
      },
      orderBy: { reportedAt: 'desc' },
    });

    if (existing) {
      // Update the existing incident — reportCount implicitly tracked by corroborations count
      const updated = await this.prisma.safetyIncident.update({
        where: { id: existing.id },
        data: {
          updatedAt: new Date(),
          ...(dto.narrative && { narrative: dto.narrative }),
        },
      });
      await this.audit.record({
        actorId: userId,
        actorType: 'tenant',
        action: 'safety_incident.dedupe',
        targetId: existing.id,
        targetType: 'safety_incident',
        metadata: { type: dto.type, geohash6, locationSource: dto.locationSource },
      });
      return { ...updated, action: 'deduplicated' };
    }

    // ── Default severity by type (reporter picks type; severity default maps) ──
    const defaultSeverity = this.defaultSeverity(dto.type);

    // ── Create the incident ──
    const incident = await this.prisma.safetyIncident.create({
      data: {
        companyId,
        type: dto.type as any,
        severity: defaultSeverity,
        status: 'REPORTED',
        reportedByDriverId,
        reportedByUserId,
        reportLat: dto.reportLat,
        reportLng: dto.reportLng,
        reportAccuracyM: dto.reportAccuracyM ?? null,
        locationSource: dto.locationSource ?? 'DEVICE_GPS',
        geohash6,
        narrative: dto.narrative ?? null,
        idempotencyKey: dto.idempotencyKey,
      },
      include: {
        reportedByDriver: { select: { id: true, name: true } },
      },
    });

    await this.audit.record({
      actorId: userId,
      actorType: 'tenant',
      actorEmail: actor?.email ?? null,
      action: 'safety_incident.reported',
      targetId: incident.id,
      targetType: 'safety_incident',
      metadata: {
        type: dto.type,
        severity: defaultSeverity,
        geohash6,
        accuracyM: dto.reportAccuracyM,
        locationSource: dto.locationSource,
        deviceReportedAt: dto.reportLat, // placeholder; actual device timestamp from client
        idempotencyKey: dto.idempotencyKey,
        reportedBy: String(userRole) === 'DRIVER' ? 'DRIVER_SELF' : 'ON_BEHALF',
        actorRole: userRole,
      },
    });

    this.logger.log(
      `Safety incident reported: ${incident.id} (${dto.type}, ${defaultSeverity}, ${dto.locationSource})`,
    );

    return { ...incident, action: 'reported' };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // DISPATCH QUEUE — incidents visible to dispatch only
  // ════════════════════════════════════════════════════════════════════════════

  async listIncidents(companyId: string, status?: string, limit = 50) {
    const where: any = { companyId };
    if (status) where.status = status;

    return this.prisma.safetyIncident.findMany({
      where,
      orderBy: { reportedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      include: {
        reportedByDriver: { select: { id: true, name: true } },
        reportedByUser: { select: { id: true, name: true, email: true } },
        corroborations: {
          include: { driver: { select: { id: true, name: true } } },
          orderBy: { reportedAt: 'desc' },
        },
        zone: { select: { id: true, name: true, radiusM: true, isActive: true } },
      },
    });
  }

  async getIncident(companyId: string, incidentId: string) {
    const incident = await this.prisma.safetyIncident.findFirst({
      where: { id: incidentId, companyId },
      include: {
        reportedByDriver: { select: { id: true, name: true } },
        reportedByUser: { select: { id: true, name: true, email: true } },
        verifiedByUser: { select: { id: true, name: true } },
        rejectedByUser: { select: { id: true, name: true } },
        corroborations: {
          include: { driver: { select: { id: true, name: true } } },
          orderBy: { reportedAt: 'desc' },
        },
        zone: { select: { id: true, name: true, radiusM: true, isActive: true, expiresAt: true } },
      },
    });
    if (!incident) throw new NotFoundException('Incident not found');

    // Audited read of a raw position — every read of report location is audited
    await this.audit.record({
      actorId: null,
      actorType: 'tenant',
      action: 'safety_incident.position_read',
      targetId: incidentId,
      targetType: 'safety_incident',
      metadata: { companyId, hasCoordinates: true },
    }).catch(() => { /* best-effort */ });

    return incident;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // VERIFICATION — dispatch confirm, second source, authority notified
  // ════════════════════════════════════════════════════════════════════════════

  async verifyIncident(
    companyId: string,
    incidentId: string,
    actor: { id?: string | null; email?: string | null },
    dto: {
      verificationMethod: 'DISPATCH_CONFIRM' | 'SECOND_SOURCE' | 'AUTHORITY_NOTIFIED';
      severity?: string;
      radiusM?: number;
      ttlHours?: number;
    },
  ) {
    const incident = await this.prisma.safetyIncident.findFirst({
      where: { id: incidentId, companyId },
    });
    if (!incident) throw new NotFoundException('Incident not found');
    if (incident.status !== 'REPORTED' && incident.status !== 'CORROBORATED') {
      throw new BadRequestException(`Cannot verify an incident in ${incident.status} state`);
    }
    if (!actor?.id) throw new ForbiddenException('An authenticated user is required to verify');
    // A verifier cannot be the reporter
    if (incident.reportedByUserId === actor.id || incident.reportedByDriverId === actor.id) {
      throw new ForbiddenException('A verifier cannot be the reporter of the same incident');
    }

    const typeDefaults = TYPE_DEFAULTS[incident.type] ?? TYPE_DEFAULTS['OTHER'];
    const radiusM = dto.radiusM ?? typeDefaults.radiusM;
    const ttlHours = dto.ttlHours ?? typeDefaults.ttlHours;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    const severity = dto.severity ?? incident.severity;

    // ── Create the SafetyZone (assertion) — only on verification ──
    const zone = await this.prisma.safetyZone.create({
      data: {
        companyId,
        name: `Verified: ${incident.type} — ${new Date().toLocaleDateString('en-ZA')}`,
        description: `Verified incident ${incidentId}: ${incident.narrative ?? incident.type}. ` +
          `Verified by ${actor.id} via ${dto.verificationMethod}.`,
        lat: incident.reportLat,
        lng: incident.reportLng,
        radiusM,
        riskLevel: severity as any,
        source: 'VERIFIED_INCIDENT',
        alertMessage: `⚠️ Verified ${incident.type.toLowerCase()} reported nearby. Stay alert.`,
        notifyDriver: true,
        notifyDispatch: true,
        notifyAdmin: severity === 'CRITICAL' || severity === 'HIGH',
        isActive: true,
        expiresAt,
        incidentId: incident.id,
      },
    });

    // ── Update the incident ──
    const verified = await this.prisma.safetyIncident.update({
      where: { id: incidentId },
      data: {
        status: 'VERIFIED',
        verifiedByUserId: actor.id,
        verifiedAt: new Date(),
        verificationMethod: dto.verificationMethod as any,
        severity: severity as any,
        zoneId: zone.id,
        expiresAt,
        broadcastCount: 0,
        lastBroadcastAt: null,
      },
      include: {
        zone: { select: { id: true, name: true, radiusM: true, expiresAt: true } },
      },
    });

    await this.audit.record({
      actorId: actor.id,
      actorType: 'tenant',
      actorEmail: actor?.email ?? null,
      action: 'safety_incident.verified',
      targetId: incidentId,
      targetType: 'safety_incident',
      metadata: {
        verificationMethod: dto.verificationMethod,
        severity,
        radiusM,
        ttlHours,
        zoneId: zone.id,
        expiresAt,
        reportedBy: incident.reportedByDriverId ?? incident.reportedByUserId,
      },
    });

    // ── Broadcast to drivers in radius ──
    await this.broadcastIncident(companyId, incidentId, zone);

    this.logger.log(
      `Safety incident verified: ${incident.id} → zone ${zone.id} (${severity}, ${radiusM}m, ${ttlHours}h TTL)`,
    );

    return verified;
  }

  async rejectIncident(
    companyId: string,
    incidentId: string,
    actor: { id?: string | null; email?: string | null },
    dto: {
      rejectionReason: 'NOT_THERE' | 'ALREADY_CLEARED' | 'DUPLICATE' | 'MISCLASSIFIED' | 'NOT_CREDIBLE' | 'OTHER';
      rejectionNote?: string;
    },
  ) {
    const incident = await this.prisma.safetyIncident.findFirst({
      where: { id: incidentId, companyId },
    });
    if (!incident) throw new NotFoundException('Incident not found');
    if (incident.status !== 'REPORTED' && incident.status !== 'CORROBORATED') {
      throw new BadRequestException(`Cannot reject an incident in ${incident.status} state`);
    }
    if (!actor?.id) throw new ForbiddenException('An authenticated user is required to reject');

    const rejected = await this.prisma.safetyIncident.update({
      where: { id: incidentId },
      data: {
        status: 'REJECTED',
        rejectedByUserId: actor.id,
        rejectedAt: new Date(),
        rejectionReason: `${dto.rejectionReason}${dto.rejectionNote ? ` — ${dto.rejectionNote}` : ''}`,
      },
    });

    await this.audit.record({
      actorId: actor.id,
      actorType: 'tenant',
      actorEmail: actor?.email ?? null,
      action: 'safety_incident.rejected',
      targetId: incidentId,
      targetType: 'safety_incident',
      metadata: { rejectionReason: dto.rejectionReason, rejectionNote: dto.rejectionNote },
    });

    return rejected;
  }

  async withdrawIncident(
    companyId: string,
    incidentId: string,
    driverId: string,
  ) {
    const incident = await this.prisma.safetyIncident.findFirst({
      where: { id: incidentId, companyId },
    });
    if (!incident) throw new NotFoundException('Incident not found');
    if (incident.status !== 'REPORTED') {
      throw new BadRequestException('Only unreviewed (REPORTED) incidents can be withdrawn');
    }
    if (incident.reportedByDriverId !== driverId) {
      throw new ForbiddenException('Only the reporting driver can withdraw their own report');
    }

    const withdrawn = await this.prisma.safetyIncident.update({
      where: { id: incidentId },
      data: {
        status: 'WITHDRAWN',
        withdrawnAt: new Date(),
        withdrawnByUserId: driverId,
      },
    });

    await this.audit.record({
      actorId: driverId,
      actorType: 'tenant',
      action: 'safety_incident.withdrawn',
      targetId: incidentId,
      targetType: 'safety_incident',
      metadata: { type: incident.type },
    });

    return withdrawn;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // CORROBORATION — second source match
  // ════════════════════════════════════════════════════════════════════════════

  async corroborateIncident(
    companyId: string,
    actor: { id?: string | null },
    dto: {
      incidentId: string;
      driverId: string;
      reportLat: number;
      reportLng: number;
    },
  ) {
    const incident = await this.prisma.safetyIncident.findFirst({
      where: { id: dto.incidentId, companyId },
    });
    if (!incident) throw new NotFoundException('Incident not found');
    if (incident.status === 'VERIFIED' || incident.status === 'REJECTED' || incident.status === 'WITHDRAWN' || incident.status === 'EXPIRED') {
      throw new BadRequestException(`Cannot corroborate an incident in ${incident.status} state`);
    }

    // Driver must be in this tenant
    const driver = await this.prisma.driver.findFirst({
      where: { id: dto.driverId, companyId },
      select: { id: true, name: true },
    });
    if (!driver) throw new NotFoundException('Driver not found in your company');

    // Distance from incident location
    const distanceM = this.haversineMetres(
      incident.reportLat, incident.reportLng, dto.reportLat, dto.reportLng,
    );
    if (distanceM > CORROBORATION_RADIUS_M) {
      throw new BadRequestException(
        `Report is ${Math.round(distanceM)} m from the incident — outside the ${CORROBORATION_RADIUS_M} m corroboration radius`,
      );
    }

    // Time window check
    const windowStart = new Date(Date.now() - CORROBORATION_WINDOW_MIN * 60 * 1000);
    if (incident.reportedAt < windowStart) {
      throw new BadRequestException('Incident is outside the corroboration time window');
    }

    // Idempotent: same driver can't corroborate twice
    const existing = await this.prisma.safetyCorroboration.findFirst({
      where: { incidentId: dto.incidentId, driverId: dto.driverId },
    });
    if (existing) {
      return { ...existing, action: 'already_corroborated' };
    }

    const corroboration = await this.prisma.safetyCorroboration.create({
      data: {
        companyId,
        incidentId: dto.incidentId,
        driverId: dto.driverId,
        distanceM: Math.round(distanceM),
        reportedAt: new Date(),
      },
    });

    // Promote to CORROBORATED
    const promoted = await this.prisma.safetyIncident.update({
      where: { id: dto.incidentId },
      data: { status: 'CORROBORATED' },
    });

    await this.audit.record({
      actorId: actor?.id ?? null,
      actorType: 'tenant',
      action: 'safety_incident.corroborated',
      targetId: dto.incidentId,
      targetType: 'safety_incident',
      metadata: {
        corroboratingDriverId: dto.driverId,
        distanceM: Math.round(distanceM),
        matchedIncident: dto.incidentId,
      },
    });

    this.logger.log(
      `Safety incident corroborated: ${dto.incidentId} by driver ${dto.driverId} (${Math.round(distanceM)} m away)`,
    );

    return { ...corroboration, incident: promoted, action: 'corroborated' };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // BROADCAST — alert drivers in radius (only on verification)
  // ════════════════════════════════════════════════════════════════════════════

  private async broadcastIncident(
    companyId: string,
    incidentId: string,
    zone: any,
  ) {
    const incident = await this.prisma.safetyIncident.findFirst({
      where: { id: incidentId, companyId },
    });
    if (!incident) return;

    const typeDefaults = TYPE_DEFAULTS[incident.type] ?? TYPE_DEFAULTS['OTHER'];
    const radiusM = zone.radiusM ?? typeDefaults.radiusM;
    const targetRadiusM = radiusM + 1000; // +1 km margin

    // Get drivers whose last known position is inside the target radius
    const drivers = await this.prisma.driver.findMany({
      where: {
        companyId,
        isActive: true,
        lastLat: { not: null },
        lastLng: { not: null },
      },
      select: { id: true, name: true, lastLat: true, lastLng: true },
    });

    let reachable = 0;
    let unreachable = 0;

    for (const driver of drivers) {
      if (!driver.lastLat || !driver.lastLng) {
        unreachable++;
        continue;
      }
      const distance = this.haversineMetres(
        incident.reportLat, incident.reportLng, driver.lastLat, driver.lastLng,
      );
      if (distance > targetRadiusM) continue;

      reachable++;

      // Socket push to driver
      this.gateway.emitToDriver(driver.id, 'safety-alert', {
        type: 'SAFETY_INCIDENT_BROADCAST',
        incidentId,
        zoneId: zone.id,
        zoneName: zone.name,
        riskLevel: incident.severity,
        message: `⚠️ Verified ${incident.type.toLowerCase()} reported ${Math.round(distance)} m away`,
        lat: incident.reportLat,
        lng: incident.reportLng,
        radiusM,
      });

      // Broadcast to company room (dispatch)
      this.gateway.broadcastToCompany(companyId, 'safety-alert', {
        type: 'SAFETY_INCIDENT_BROADCAST',
        incidentId,
        driverId: driver.id,
        driverName: driver.name,
        zoneName: zone.name,
        riskLevel: incident.severity,
        distanceM: Math.round(distance),
        message: `⚠️ ${driver.name} is near a verified ${incident.type.toLowerCase()}`,
      });

      // Notification row
      await this.prisma.notification.create({
        data: {
          companyId,
          userId: null, // broadcast to all — null userId = company-wide
          title: `⚠️ Safety incident: ${incident.type}`,
          body: `Verified ${incident.type.toLowerCase()} reported ${Math.round(distance)} m away.`,
          type: 'SAFETY_INCIDENT',
          link: `/safety-incidents/${incidentId}`,
        },
      }).catch(() => { /* best-effort */ });
    }

    // Outbox event for webhook delivery
    void this.outbox.enqueue(
      this.prisma,
      companyId,
      'safety_incident.broadcast',
      {
        incidentId,
        companyId,
        zoneId: zone.id,
        type: incident.type,
        severity: incident.severity,
        radiusM,
        targeted: reachable,
        unreachable,
        broadcastAt: new Date(),
      },
    ).catch((err) => this.logger.warn(`Outbox enqueue failed: ${err?.message}`));

    // Update broadcast tracking
    await this.prisma.safetyIncident.update({
      where: { id: incidentId },
      data: {
        broadcastCount: reachable,
        lastBroadcastAt: new Date(),
      },
    });

    await this.audit.record({
      actorId: null,
      actorType: 'system',
      action: 'safety_incident.broadcast',
      targetId: incidentId,
      targetType: 'safety_incident',
      metadata: {
        channels: ['socket', 'notification', 'outbox'],
        recipientsTargeted: reachable,
        unreachableCount: unreachable,
        radiusM,
      },
    });

    this.logger.log(
      `Safety incident broadcast: ${incidentId} — ${reachable} reachable, ${unreachable} unreachable`,
    );
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // EXPIRY SWEEP — @Cron('*/5 * * * *') equivalent, callable manually too
  // ════════════════════════════════════════════════════════════════════════════

  async sweepExpiredIncidents(companyId?: string) {
    const where: any = {
      status: { in: ['REPORTED', 'CORROBORATED', 'VERIFIED'] },
      expiresAt: { lt: new Date() },
    };
    if (companyId) where.companyId = companyId;

    const expired = await this.prisma.safetyIncident.findMany({
      where,
      include: { zone: true },
    });

    for (const incident of expired) {
      // Mark incident EXPIRED
      await this.prisma.safetyIncident.update({
        where: { id: incident.id },
        data: { status: 'EXPIRED', expiredAt: new Date() },
      });

      // Deactivate linked SafetyZone
      if (incident.zoneId) {
        await this.prisma.safetyZone.update({
          where: { id: incident.zoneId },
          data: { isActive: false },
        });
      }

      await this.audit.record({
        actorId: null,
        actorType: 'system',
        action: 'safety_incident.expired',
        targetId: incident.id,
        targetType: 'safety_incident',
        metadata: { expiredAt: new Date(), zoneId: incident.zoneId },
      });

      this.logger.log(`Safety incident expired: ${incident.id}`);
    }

    return { expiredCount: expired.length };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // RETENTION — null positions after 90d (incident) / 180d (alert)
  // ════════════════════════════════════════════════════════════════════════════

  async sweepRetention(companyId?: string) {
    const now = new Date();
    const incidentCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const alertCutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

    // Null report locations on closed incidents older than 90 days
    const closedIncidents = await this.prisma.safetyIncident.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
        status: { in: ['VERIFIED', 'REJECTED', 'EXPIRED', 'WITHDRAWN'] },
        reportLat: { not: null },
        updatedAt: { lt: incidentCutoff },
      },
      select: { id: true },
    });

    for (const inc of closedIncidents) {
      await this.prisma.safetyIncident.update({
        where: { id: inc.id },
        data: { reportLat: null, reportLng: null, reportAccuracyM: null },
      });
    }

    // Null alert positions older than 180 days
    const oldAlerts = await this.prisma.safetyAlert.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
        lat: { not: null },
        createdAt: { lt: alertCutoff },
        positionNulledAt: null,
      },
      select: { id: true },
    });

    for (const al of oldAlerts) {
      await this.prisma.safetyAlert.update({
        where: { id: al.id },
        data: { lat: null, lng: null, positionNulledAt: now },
      });
    }

    // Record sweep
    if (companyId) {
      await this.prisma.safetyRetentionSweep.create({
        data: {
          companyId,
          sweepType: 'INCIDENT_REPORT_LOCATION_AND_ALERT_POSITION',
          completedAt: now,
          rowsNulled: closedIncidents.length + oldAlerts.length,
        },
      });
    }

    return {
      incidentLocationsNulled: closedIncidents.length,
      alertPositionsNulled: oldAlerts.length,
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════════════════════

  private defaultSeverity(type: string): string {
    switch (type) {
      case 'HIJACKING_ATTEMPT':
      case 'ROBBERY':
        return 'CRITICAL';
      case 'ACCIDENT':
      case 'ROAD_CLOSED':
      case 'STRIKE_PROTEST':
        return 'HIGH';
      case 'WEATHER':
      case 'VEHICLE_HAZARD':
        return 'MEDIUM';
      default:
        return 'MEDIUM';
    }
  }

  private geohash6(lat: number, lng: number): string {
    // Simple geohash-ish: 3 chars lat + 3 chars lng rounded to ~0.01° precision (~1 km)
    const latChar = String.fromCharCode(65 + Math.floor((lat + 90) / 30));
    const lngChar = String.fromCharCode(65 + Math.floor((lng + 180) / 60));
    const lat2 = Math.floor(lat * 100) % 100;
    const lng2 = Math.floor(lng * 100) % 100;
    return `${latChar}${lngChar}${String(lat2).padStart(2, '0')}${String(lng2).padStart(2, '0')}`;
  }

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
