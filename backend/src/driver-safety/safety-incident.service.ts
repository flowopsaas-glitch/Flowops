import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportIncidentDto } from './dto/incident-document.dto';
import { INCIDENT_STATUSES } from './dto/incident-document.dto';

/**
 * Safety incidents — reported in the field, reviewed by dispatch.
 *
 * Neither `SafetyIncident` nor its endpoints existed, while two screens have
 * been calling them. This is the model and the endpoints.
 *
 * The verification fields are per-outcome on purpose (verified*, rejected*).
 * An incident that is rejected and later verified has to show who did which;
 * a single "last actor" column would silently erase the first decision, and the
 * point of this table is that a decision can be reviewed after the fact.
 */

/** No names to resolve: a single row read back after a write. */
const EMPTY_NAMES: Map<string, string> = new Map();

@Injectable()
export class SafetyIncidentService {
  private readonly logger = new Logger(SafetyIncidentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** POST /safety-incidents — a driver or dispatcher reports what happened. */
  async report(companyId: string, dto: ReportIncidentDto, user: any) {
    const isDriver = String(user?.role ?? '').toUpperCase() === 'DRIVER';

    return this.prisma.withTenant(companyId, async (tx) => {
      // A driver is the subject of their own report and cannot name another
      // driver; anyone else reports on behalf of the company, with no driver
      // attached unless one is supplied.
      let driverId: string | null = null;
      if (isDriver) {
        const mine = await tx.driver.findFirst({
          where: { companyId, userId: user?.id ?? user?.sub },
          select: { id: true },
        });
        if (!mine) throw new NotFoundException('No driver record for this account');
        driverId = mine.id;
      }

      const row = await tx.safetyIncident.create({
        data: {
          companyId,
          type: dto.type,
          severity: dto.severity,
          status: 'REPORTED',
          reportedByDriverId: driverId,
          reportedByUserId: isDriver ? null : (user?.id ?? null),
          reportLat: dto.reportLat,
          reportLng: dto.reportLng,
          locationSource: dto.locationSource ?? 'GPS',
          narrative: dto.narrative ?? null,
          zoneId: dto.zoneId ?? null,
        },
      });

      this.logger.log(`incident reported tenant=${companyId} id=${row.id} severity=${row.severity}`);
      return this.present(row, EMPTY_NAMES, EMPTY_NAMES);
    });
  }

  /** GET /safety-incidents — the dispatch review board, newest first. */
  async list(companyId: string, status?: string) {
    const wanted = status ? String(status).toUpperCase() : undefined;
    if (wanted && !(INCIDENT_STATUSES as readonly string[]).includes(wanted)) {
      throw new BadRequestException(`Unknown status "${status}"`);
    }

    return this.prisma.withTenant(companyId, async (tx) => {
      const rows = await tx.safetyIncident.findMany({
        where: { companyId, ...(wanted ? { status: wanted } : {}) },
        orderBy: [{ reportedAt: 'desc' }],
        take: 200,
      });

      // Names are resolved in one pass rather than per row. The ids are plain
      // columns, not relations — an incident outlives the driver record and the
      // user record behind it, so a join would either cascade or lie.
      const driverIds = [...new Set(rows.map((r) => r.reportedByDriverId).filter(Boolean))] as string[];
      const userIds = [
        ...new Set(
          rows
            .flatMap((r) => [r.reportedByUserId, r.verifiedByUserId, r.rejectedByUserId])
            .filter(Boolean),
        ),
      ] as string[];

      const drivers = driverIds.length
        ? await tx.driver.findMany({ where: { id: { in: driverIds } }, select: { id: true, name: true } })
        : [];
      const users = userIds.length
        ? await tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
        : [];

      const driverName = new Map(drivers.map((d) => [d.id, d.name]));
      const userName = new Map(users.map((u) => [u.id, u.name]));

      return rows.map((r) => this.present(r, driverName, userName));
    });
  }

  /**
   * PATCH /safety-incidents/:id/verdict — verify or reject a report.
   *
   * Only a report that is still open may be decided: re-deciding a verified
   * incident would overwrite who made the first call, which is the one thing
   * this table exists to preserve.
   */
  async decide(companyId: string, id: string, verdict: 'VERIFIED' | 'REJECTED', reason: string | undefined, user: any) {
    // COMPARE-AND-SET, not read-then-write.
    //
    // The previous version read the row, checked `status === 'VERIFIED' |
    // 'REJECTED'`, then updated. Two decisions in flight both read an OPEN
    // incident and both passed the check, so the second overwrote the first —
    // taking `verifiedByUserId` and `verifiedAt` with it. The error message
    // below promises that "the record of who made it survives"; as a read it
    // could not keep that promise. Only one caller can win a conditional write.
    return this.prisma.withTenant(companyId, async (tx) => {
      const claimed = await tx.safetyIncident.updateMany({
        where: { id, companyId, status: { notIn: ['VERIFIED', 'REJECTED'] } },
        data:
          verdict === 'VERIFIED'
            ? { status: 'VERIFIED', verifiedByUserId: user?.id ?? null, verifiedAt: new Date() }
            : {
                status: 'REJECTED',
                rejectedByUserId: user?.id ?? null,
                rejectedAt: new Date(),
                rejectionReason: reason ?? null,
              },
      });

      if (claimed.count === 0) {
        // Either the incident is not ours, or it was decided a moment ago.
        // Re-read to tell those apart: one is a 404, the other is a 409, and
        // collapsing them into one message would hide a real race as a typo.
        const current = await tx.safetyIncident.findFirst({
          where: { id, companyId },
          select: { status: true },
        });
        if (!current) throw new NotFoundException('Incident not found');
        throw new BadRequestException(
          `Incident is already ${current.status}; a decision is final so the record of who made it survives`,
        );
      }

      const updated = await tx.safetyIncident.findFirstOrThrow({ where: { id, companyId } });
      return this.present(updated, EMPTY_NAMES, EMPTY_NAMES);
    });
  }

  private present(row: any, driverName: Map<string, string>, userName: Map<string, string>) {
    return {
      id: row.id,
      companyId: row.companyId,
      type: row.type,
      severity: row.severity,
      status: row.status,
      reportedByDriverId: row.reportedByDriverId,
      reportedByDriverName: row.reportedByDriverId ? (driverName.get(row.reportedByDriverId) ?? null) : null,
      reportedByUserId: row.reportedByUserId,
      reportedByUserName: row.reportedByUserId ? (userName.get(row.reportedByUserId) ?? null) : null,
      reportedAt: this.iso(row.reportedAt),
      reportLat: row.reportLat,
      reportLng: row.reportLng,
      locationSource: row.locationSource,
      geohash6: row.geohash6,
      narrative: row.narrative,
      verifiedByUserId: row.verifiedByUserId,
      verifiedByUserName: row.verifiedByUserId ? (userName.get(row.verifiedByUserId) ?? null) : null,
      verifiedAt: this.iso(row.verifiedAt),
      rejectedByUserId: row.rejectedByUserId,
      rejectedByUserName: row.rejectedByUserId ? (userName.get(row.rejectedByUserId) ?? null) : null,
      rejectedAt: this.iso(row.rejectedAt),
      rejectionReason: row.rejectionReason,
      zoneId: row.zoneId,
      broadcastCount: row.broadcastCount,
      createdAt: this.iso(row.createdAt),
      updatedAt: this.iso(row.updatedAt),
    };
  }

  private iso(v: unknown): any {
    return v == null ? null : new Date(v as any).toISOString();
  }
}
