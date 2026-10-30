import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { Prisma, RailAlertStatus, RailTelemetryAlertKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../webhooks/outbox.service';
import { RAIL_AUDIT_ACTION, RAIL_AUDIT_TARGET, RailActor, railAuditEntry, recordRailAudit } from './rail-audit';
import {
  CreateTelemetryDeviceDto, TelemetryPointDto, UpdateTelemetryDeviceDto,
} from './dto/rail-telemetry.dto';
import {
  distanceKmOver, evaluateIngestAlerts, isSilent, normalisePoint, shouldRaiseAlert, MAX_INGEST_BATCH, ProposedAlert,
} from './rail-telemetry.rules';

export interface IngestResult {
  accepted: number;
  rejected: Array<{ index: number; reasons: string[] }>;
  alertsRaised: string[];
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Telemetry foundations service.
 *
 * Devices authenticate ingest with a bearer token of which only the SHA-256
 * hash is stored — the plaintext is shown exactly once at creation or
 * rotation. Ingest validates every point through the pure rules before it can
 * touch the map, keeps a last-known-position snapshot per device, and raises
 * deduplicated health alerts through the outbox like every other rail event.
 */
@Injectable()
export class RailTelemetryService {
  private readonly logger = new Logger(RailTelemetryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  private async assertEntitled(companyId: string): Promise<void> {
    if (!(await this.billing.hasFeature(companyId, 'rail'))) {
      throw new ForbiddenException('Rail & Intermodal is an Enterprise feature. Upgrade your plan to track wagons and locomotives.');
    }
  }

  private record(companyId: string, actor: RailActor, action: string, target: { type: string; id: string; name?: string | null }, metadata: Record<string, unknown> = {}) {
    return recordRailAudit(this.audit, this.logger, railAuditEntry(companyId, actor, action, target, metadata));
  }

  private issueToken(): { token: string; hash: string; prefix: string } {
    const token = randomBytes(24).toString('base64url');
    return { token, hash: hashToken(token), prefix: token.slice(0, 8) };
  }

  // ── Device registry ──────────────────────────────────────────────────────

  async createDevice(companyId: string, dto: CreateTelemetryDeviceDto, actor: RailActor) {
    await this.assertEntitled(companyId);
    const cred = this.issueToken();
    let device;
    try {
      device = await this.prisma.withTenant(companyId, async (tx) => {
        const d = await tx.railDevice.create({
          data: {
            companyId,
            deviceCode: dto.deviceCode.trim(),
            kind: dto.kind ?? 'WAGON_TRACKER',
            label: dto.label ?? null,
            wagonNumber: dto.wagonNumber ?? null,
            locoReference: dto.locoReference ?? null,
            simRef: dto.simRef ?? null,
            speedLimitKph: dto.speedLimitKph ?? null,
            batteryThresholdPct: dto.batteryThresholdPct ?? null,
            notes: dto.notes ?? null,
            tokenHash: cred.hash,
            tokenPrefix: cred.prefix,
          },
        });
        await this.outbox.enqueue(tx, companyId, 'rail.telemetry.device_registered', {
          deviceId: d.id, deviceCode: d.deviceCode, kind: d.kind,
        });
        return d;
      });
    } catch (err: any) {
      if (err?.code === 'P2002') throw new BadRequestException(`Device code ${dto.deviceCode} already exists on this tenant.`);
      throw err;
    }
    await this.record(companyId, actor, RAIL_AUDIT_ACTION.TELEMETRY_DEVICE_REGISTERED,
      { type: RAIL_AUDIT_TARGET.TELEMETRY_DEVICE, id: device.id, name: device.deviceCode }, { kind: device.kind });
    // The plaintext token is returned exactly once — nothing stores it from here on.
    return { device, ingestToken: cred.token };
  }

  async updateDevice(companyId: string, id: string, dto: UpdateTelemetryDeviceDto, actor: RailActor) {
    await this.assertEntitled(companyId);
    const device = await this.deviceOrThrow(companyId, id);
    const before = device.status;
    const updated = await this.prisma.withTenant(companyId, async (tx) => {
      const u = await tx.railDevice.update({
        where: { id },
        data: {
          status: dto.status ?? undefined,
          label: dto.label ?? undefined,
          wagonNumber: dto.wagonNumber ?? undefined,
          locoReference: dto.locoReference ?? undefined,
          simRef: dto.simRef ?? undefined,
          speedLimitKph: dto.speedLimitKph ?? undefined,
          batteryThresholdPct: dto.batteryThresholdPct ?? undefined,
          notes: dto.notes ?? undefined,
        },
      });
      if (dto.status && dto.status !== before) {
        await this.outbox.enqueue(tx, companyId, 'rail.telemetry.device_status_changed', {
          deviceId: u.id, deviceCode: u.deviceCode, from: before, to: dto.status,
        });
      }
      return u;
    });
    await this.record(companyId, actor, RAIL_AUDIT_ACTION.TELEMETRY_DEVICE_UPDATED,
      { type: RAIL_AUDIT_TARGET.TELEMETRY_DEVICE, id, name: device.deviceCode }, { fields: Object.keys(dto), status: updated.status });
    return updated;
  }

  async rotateToken(companyId: string, id: string, actor: RailActor) {
    await this.assertEntitled(companyId);
    const device = await this.deviceOrThrow(companyId, id);
    const cred = this.issueToken();
    const updated = await this.prisma.railDevice.update({
      where: { id }, data: { tokenHash: cred.hash, tokenPrefix: cred.prefix },
    });
    await this.record(companyId, actor, RAIL_AUDIT_ACTION.TELEMETRY_DEVICE_TOKEN_ROTATED,
      { type: RAIL_AUDIT_TARGET.TELEMETRY_DEVICE, id, name: device.deviceCode }, {});
    return { device: updated, ingestToken: cred.token };
  }

  async listDevices(companyId: string) {
    const [devices, openAlerts] = await Promise.all([
      this.prisma.railDevice.findMany({ where: { companyId }, orderBy: { deviceCode: 'asc' } }),
      this.prisma.railTelemetryAlert.groupBy({
        by: ['deviceId'], where: { companyId, status: 'OPEN' }, _count: { _all: true },
      }),
    ]);
    const alertCount = new Map(openAlerts.map((a) => [a.deviceId, a._count._all]));
    const now = new Date();
    return devices.map((d) => ({
      ...d,
      silent: isSilent(d.lastSeenAt, now),
      openAlerts: alertCount.get(d.id) ?? 0,
    }));
  }

  async deviceOrThrow(companyId: string, id: string) {
    const device = await this.prisma.railDevice.findFirst({ where: { id, companyId } });
    if (!device) throw new NotFoundException('Telemetry device not found');
    return device;
  }

  // ── Ingest ───────────────────────────────────────────────────────────────

  /** Device-token ingest (X-Device-Token). All points belong to that one device. */
  async ingestByToken(token: string, points: TelemetryPointDto[]): Promise<IngestResult> {
    if (!token) throw new UnauthorizedException('Missing X-Device-Token.');
    const hash = hashToken(token);
    const device = await this.prisma.railDevice.findUnique({ where: { tokenHash: hash } });
    if (!device) throw new UnauthorizedException('Unknown device token.');
    if (device.status !== 'ACTIVE') throw new ForbiddenException(`Device ${device.deviceCode} is ${device.status}; ingest refused.`);
    return this.ingestPoints(device.companyId, [{ device, points }]);
  }

  /**
   * Bulk ingest on a user session (RAIL_WRITE): each point names its deviceCode.
   *
   * `_actor` is the caller's identity, accepted so the route reads the same as
   * every other write on this controller and so a future audit line has it to
   * hand. Device-token ingest (`ingestForToken`) attributes to the device; this
   * path currently writes no audit entry, and the underscore says that plainly
   * rather than leaving an unused name that looks like an oversight.
   */
  async ingestBulk(companyId: string, rows: Array<TelemetryPointDto & { deviceCode: string }>, _actor: RailActor): Promise<IngestResult> {
    await this.assertEntitled(companyId);
    const codes = [...new Set(rows.map((r) => r.deviceCode))];
    const devices = await this.prisma.railDevice.findMany({ where: { companyId, deviceCode: { in: codes } } });
    const byCode = new Map(devices.map((d) => [d.deviceCode, d]));
    const missing = codes.filter((c) => !byCode.has(c));
    if (missing.length) throw new BadRequestException(`Unknown device codes: ${missing.join(', ')}`);

    const grouped = new Map<string, { device: (typeof devices)[number]; points: TelemetryPointDto[] }>();
    for (const row of rows) {
      const device = byCode.get(row.deviceCode)!;
      if (device.status !== 'ACTIVE') continue; // silently skip inactive hardware in bulk
      const g = grouped.get(row.deviceCode) ?? { device, points: [] };
      g.points.push(row);
      grouped.set(row.deviceCode, g);
    }
    return this.ingestPoints(companyId, [...grouped.values()]);
  }

  private async ingestPoints(companyId: string, groups: Array<{ device: { id: string; companyId: string; deviceCode: string; speedLimitKph: number | null; batteryThresholdPct: number | null; lastSeenAt: Date | null }; points: TelemetryPointDto[] }>): Promise<IngestResult> {
    // Tenant context is established for the whole ingest transaction: the RLS
    // policies (migration 20261012210000_rls_tenant_isolation) make the DATABASE
    // refuse any row outside this companyId — defence in depth beneath the
    // device-token lookup. Everything (points, last-known-position, alerts,
    // outbox) stays one transaction.
    return this.prisma.withTenant(companyId, (tx) => this.ingestPointsIn(tx, companyId, groups));
  }

  private async ingestPointsIn(tx: Prisma.TransactionClient, companyId: string, groups: Array<{ device: { id: string; companyId: string; deviceCode: string; speedLimitKph: number | null; batteryThresholdPct: number | null; lastSeenAt: Date | null }; points: TelemetryPointDto[] }>): Promise<IngestResult> {
    const total = groups.reduce((n, g) => n + g.points.length, 0);
    if (total === 0) throw new BadRequestException('Batch is empty.');
    if (total > MAX_INGEST_BATCH) throw new BadRequestException(`Batch too large: ${total} points (max ${MAX_INGEST_BATCH}).`);

    const now = new Date();
    const acceptedRows: Prisma.RailTelemetryPointCreateManyInput[] = [];
    const rejected: IngestResult['rejected'] = [];
    const alertsRaised = new Set<string>();
    let index = 0;

    for (const { device, points } of groups) {
      // Existing open alerts for dedupe (fresh read per device).
      const open = await tx.railTelemetryAlert.findMany({
        where: { deviceId: device.id, status: 'OPEN' },
        select: { kind: true, status: true, raisedAt: true },
      });
      const pending: Array<{ kind: RailTelemetryAlertKind; p: ProposedAlert }> = [];
      let latest: { at: Date; lat: number; lng: number; speedKph: number | null; batteryPct: number | null } | null = null;

      for (const raw of points) {
        const check = normalisePoint(raw, now);
        if ('reasons' in check) {
          rejected.push({ index, reasons: check.reasons });
          index += 1;
          continue;
        }
        const p = check.point;
        acceptedRows.push({
          companyId, deviceId: device.id,
          recordedAt: p.recordedAt, lat: p.lat, lng: p.lng,
          speedKph: p.speedKph, headingDeg: p.headingDeg, odometerKm: p.odometerKm,
          batteryPct: p.batteryPct, temperatureC: p.temperatureC, doorOpen: p.doorOpen,
          raw: p.raw === undefined ? undefined : (p.raw as Prisma.InputJsonValue),
        });
        if (!latest || p.recordedAt > latest.at) {
          latest = { at: p.recordedAt, lat: p.lat, lng: p.lng, speedKph: p.speedKph, batteryPct: p.batteryPct };
        }
        for (const alert of evaluateIngestAlerts(device, p)) {
          if (shouldRaiseAlert([...open, ...pending.map((x) => ({ ...x.p, kind: x.kind, status: 'OPEN', raisedAt: now }))], alert.kind, now)) {
            pending.push({ kind: alert.kind as RailTelemetryAlertKind, p: alert });
          }
        }
        index += 1;
      }

      const deviceRows = acceptedRows.filter((r) => r.deviceId === device.id);
      if (deviceRows.length) {
        await tx.railTelemetryPoint.createMany({ data: deviceRows });
        if (latest) {
          await tx.railDevice.update({
            where: { id: device.id },
            data: {
              lastSeenAt: latest.at, lastLat: latest.lat, lastLng: latest.lng,
              lastSpeedKph: latest.speedKph, lastBatteryPct: latest.batteryPct,
            },
          });
        }
        for (const { kind, p } of pending) {
          const alert = await tx.railTelemetryAlert.create({
            data: {
              companyId, deviceId: device.id, kind, status: 'OPEN',
              message: p.message, value: p.value, threshold: p.threshold,
            },
          });
          await this.outbox.enqueue(tx, companyId, 'rail.telemetry.alert_raised', {
            alertId: alert.id, deviceId: device.id, deviceCode: device.deviceCode,
            kind, message: p.message, value: p.value, threshold: p.threshold,
          });
          alertsRaised.add(kind);
        }
      }
    }

    return { accepted: acceptedRows.length, rejected, alertsRaised: [...alertsRaised] };
  }

  // ── Queries ──────────────────────────────────────────────────────────────

  async points(companyId: string, deviceId: string, opts: { from?: Date; to?: Date; limit?: number }) {
    await this.deviceOrThrow(companyId, deviceId);
    return this.prisma.railTelemetryPoint.findMany({
      where: {
        companyId, deviceId,
        ...(opts.from || opts.to ? { recordedAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } } : {}),
      },
      orderBy: { recordedAt: 'desc' },
      take: Math.min(opts.limit ?? 200, 2000),
    });
  }

  /** Movement summary over a window: distance (haversine over the trail), speeds, freshness. */
  async summary(companyId: string, deviceId: string, sinceHours = 24) {
    const device = await this.deviceOrThrow(companyId, deviceId);
    const since = new Date(Date.now() - Math.min(Math.max(sinceHours, 1), 24 * 30) * 3_600_000);
    const rows = await this.prisma.railTelemetryPoint.findMany({
      where: { companyId, deviceId, recordedAt: { gte: since } },
      orderBy: { recordedAt: 'asc' },
      select: { lat: true, lng: true, speedKph: true, recordedAt: true },
    });
    const speeds = rows.map((r) => r.speedKph).filter((s): s is number => s != null);
    return {
      deviceId, deviceCode: device.deviceCode, sinceHours,
      pointCount: rows.length,
      distanceKm: distanceKmOver(rows),
      maxSpeedKph: speeds.length ? Math.max(...speeds) : null,
      avgSpeedKph: speeds.length ? Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10) / 10 : null,
      lastSeenAt: device.lastSeenAt,
      silent: isSilent(device.lastSeenAt),
    };
  }

  listAlerts(companyId: string, filters: { status?: RailAlertStatus; deviceId?: string } = {}) {
    return this.prisma.railTelemetryAlert.findMany({
      where: {
        companyId,
        ...(filters.status ? { status: filters.status } : { status: { in: ['OPEN', 'ACKNOWLEDGED'] } }),
        ...(filters.deviceId ? { deviceId: filters.deviceId } : {}),
      },
      orderBy: { raisedAt: 'desc' },
      take: 200,
      include: { device: { select: { deviceCode: true, label: true, wagonNumber: true } } },
    });
  }

  async acknowledgeAlert(companyId: string, id: string, actor: RailActor, note?: string) {
    return this.alertTransition(companyId, id, actor, 'ACKNOWLEDGED', { acknowledgedAt: new Date(), acknowledgedBy: actor.email ?? actor.name ?? 'unknown' }, note);
  }

  async resolveAlert(companyId: string, id: string, actor: RailActor, note?: string) {
    return this.alertTransition(companyId, id, actor, 'RESOLVED', { resolvedAt: new Date() }, note);
  }

  private async alertTransition(companyId: string, id: string, actor: RailActor, to: 'ACKNOWLEDGED' | 'RESOLVED', patch: Prisma.RailTelemetryAlertUpdateInput, note?: string) {
    const alert = await this.prisma.railTelemetryAlert.findFirst({ where: { id, companyId } });
    if (!alert) throw new NotFoundException('Alert not found');
    if (alert.status === 'RESOLVED' || (to === 'ACKNOWLEDGED' && alert.status === 'ACKNOWLEDGED')) {
      throw new BadRequestException(`A ${alert.status} alert cannot become ${to}.`);
    }
    const updated = await this.prisma.withTenant(companyId, async (tx) => {
      const u = await tx.railTelemetryAlert.update({ where: { id }, data: { status: to, ...patch } });
      await this.outbox.enqueue(tx, companyId, 'rail.telemetry.alert_updated', {
        alertId: id, kind: alert.kind, from: alert.status, to, note: note ?? null,
      });
      return u;
    });
    await this.record(companyId, actor,
      to === 'RESOLVED' ? RAIL_AUDIT_ACTION.TELEMETRY_ALERT_RESOLVED : RAIL_AUDIT_ACTION.TELEMETRY_ALERT_ACKNOWLEDGED,
      { type: RAIL_AUDIT_TARGET.TELEMETRY_ALERT, id, name: alert.kind }, { from: alert.status, to, note: note ?? null });
    return updated;
  }
}
