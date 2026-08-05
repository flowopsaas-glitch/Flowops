import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StartTrackingDto, UpdateLocationDto, StopCompletedDto } from './dto/live-tracking.dto';

@Injectable()
export class LiveTrackingService {
  constructor(private readonly prisma: PrismaService) {}

  async startSession(companyId: string, dto: StartTrackingDto) {
    // End any existing active session for this driver
    await this.prisma.liveTrackingSession.updateMany({
      where: { companyId, driverId: dto.driverId, isActive: true },
      data: { isActive: false, endedAt: new Date() },
    });

    return this.prisma.liveTrackingSession.create({
      data: {
        companyId,
        driverId: dto.driverId,
        vehicleId: dto.vehicleId,
        manifestId: dto.manifestId,
        isActive: true,
        totalStops: dto.totalStops || 0,
      },
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
