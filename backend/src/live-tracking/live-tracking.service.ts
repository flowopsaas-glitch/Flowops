import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StartTrackingDto, UpdateLocationDto, StopCompletedDto } from './dto/live-tracking.dto';

@Injectable()
export class LiveTrackingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Start a tracking session, ending any session already running for the driver.
   *
   * The rule is one active session per driver, and it has to be enforced by the
   * transaction, not by ordering two statements. Ending the old session and
   * creating the new one used to be two independent calls: two overlapping
   * starts both ended the old row and both inserted a new one, leaving the
   * driver live twice — two rows accumulating distance and a dispatch board
   * showing the same driver in two places.
   *
   * Inside withTenant they are one unit of work, and the driver's other sessions
   * cannot start one of their own in between.
   */
  async startSession(companyId: string, dto: StartTrackingDto) {
    return this.prisma.withTenant(companyId, async (tx) => {
      // A transaction on its own is not enough here. Two concurrent transactions
      // can both run the updateMany, both see nothing active, and both insert —
      // the default isolation level does not make the pair atomic against each
      // other. Serialise on the driver first.
      //
      // The durable fix is a partial unique index on (companyId, driverId) WHERE
      // is_active, which would make the second insert fail outright. That needs a
      // migration and a check for existing duplicates first; flagged, not done
      // blind. The lock gives the same guarantee today.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`live-track:${companyId}:${dto.driverId}`}))`;

      await tx.liveTrackingSession.updateMany({
        where: { companyId, driverId: dto.driverId, isActive: true },
        data: { isActive: false, endedAt: new Date() },
      });

      return tx.liveTrackingSession.create({
        data: {
          companyId,
          driverId: dto.driverId,
          vehicleId: dto.vehicleId,
          manifestId: dto.manifestId,
          isActive: true,
          totalStops: dto.totalStops || 0,
        },
      });
    });
  }

  async updateLocation(sessionId: string, companyId: string, dto: UpdateLocationDto) {
    const session = await this.prisma.liveTrackingSession.findFirst({
      where: { id: sessionId, companyId, isActive: true },
    });
    if (!session) throw new NotFoundException('Active tracking session not found');

    // Calculate distance increment
    let distanceIncrement = 0;
    if (session.currentLat && session.currentLng) {
      distanceIncrement = this.haversine(session.currentLat, session.currentLng, dto.lat, dto.lng);
    }

    return this.prisma.liveTrackingSession.update({
      where: { id: sessionId },
      data: {
        currentLat: dto.lat,
        currentLng: dto.lng,
        speed: dto.speed,
        heading: dto.heading,
        lastPingAt: new Date(),
        distanceCovered: { increment: distanceIncrement },
      },
    });
  }

  async stopCompleted(sessionId: string, companyId: string, dto: StopCompletedDto) {
    const session = await this.prisma.liveTrackingSession.findFirst({
      where: { id: sessionId, companyId, isActive: true },
    });
    if (!session) throw new NotFoundException('Active tracking session not found');

    return this.prisma.liveTrackingSession.update({
      where: { id: sessionId },
      data: {
        stopsCompleted: { increment: 1 },
        distanceCovered: dto.distanceCovered ?? session.distanceCovered,
      },
    });
  }

  async endSession(sessionId: string, companyId: string) {
    const session = await this.prisma.liveTrackingSession.findFirst({
      where: { id: sessionId, companyId, isActive: true },
    });
    if (!session) throw new NotFoundException('Active tracking session not found');

    return this.prisma.liveTrackingSession.update({
      where: { id: sessionId },
      data: { isActive: false, endedAt: new Date() },
    });
  }

  async getActiveSessions(companyId: string) {
    return this.prisma.liveTrackingSession.findMany({
      where: { companyId, isActive: true },
      orderBy: { lastPingAt: 'desc' },
    });
  }

  async getSession(sessionId: string, companyId: string) {
    const session = await this.prisma.liveTrackingSession.findFirst({
      where: { id: sessionId, companyId },
    });
    if (!session) throw new NotFoundException('Tracking session not found');
    return session;
  }

  async getDriverSession(driverId: string, companyId: string) {
    return this.prisma.liveTrackingSession.findFirst({
      where: { driverId, companyId, isActive: true },
    });
  }

  async getSessionHistory(companyId: string, query?: { driverId?: string; from?: string; to?: string }) {
    const where: any = { companyId, isActive: false };
    if (query?.driverId) where.driverId = query.driverId;
    if (query?.from || query?.to) {
      where.startedAt = {};
      if (query.from) where.startedAt.gte = new Date(query.from);
      if (query.to) where.startedAt.lte = new Date(query.to);
    }

    return this.prisma.liveTrackingSession.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
  }

  private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
