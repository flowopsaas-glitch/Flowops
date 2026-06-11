import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BroadcastGateway } from '../broadcast/broadcast.gateway';
import { GeoTrustService } from '../geo-trust/geo-trust.service';

@Injectable()
export class DriverTrackingService {
  private readonly logger = new Logger('DriverTrackingService');
  private lastBroadcastLocation: Map<number, { lat: number; lng: number }> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcast: BroadcastGateway,
    private readonly geoTrust: GeoTrustService,
  ) {}

  async recordCheckpoint(payload: any) {
    const checkpoint = await this.geoTrust.recordGpsCheckpoint(
      Number(payload.driverId),
      Number(payload.lat),
      Number(payload.lng),
      Number(payload.companyId || 1)
    );

    const lastLoc = this.lastBroadcastLocation.get(payload.driverId);
    if (!lastLoc || this.geoTrust.calculateDistance(lastLoc.lat, lastLoc.lng, payload.lat, payload.lng) > 50) {
      this.broadcast.emitDriverLocationUpdate(payload.companyId, {
        driverId: payload.driverId,
        lat: payload.lat,
        lng: payload.lng,
      });
      this.lastBroadcastLocation.set(payload.driverId, { lat: payload.lat, lng: payload.lng });
    }

    return { success: true, checkpointId: checkpoint.id };
  }

  async getLatestLocation(driverId: number) {
    return (this.prisma as any).driverLocation.findFirst({
      where: { driverId: Number(driverId) },
      orderBy: { timestamp: 'desc' },
    });
  }

  async getLocationHistory(driverId: number, hours: number, limit: number) {
    const since = new Date(Date.now() - hours * 3600000);
    return (this.prisma as any).driverLocation.findMany({
      where: { driverId: Number(driverId), timestamp: { gte: since } },
      orderBy: { timestamp: 'desc' },
      take: Number(limit),
    });
  }

  async getFleetLocations(companyId: number) {
    const query = `
      SELECT DISTINCT ON (dl."driverId")
        dl."driverId", dl.lat, dl.lng, dl.timestamp
      FROM "DriverLocation" dl
      WHERE dl."companyId" = $1
      ORDER BY dl."driverId", dl.timestamp DESC
    `;
    return (this.prisma as any).$queryRawUnsafe(query, Number(companyId));
  }

  async checkCollectionGeofence(driverId: number, lat: number, lng: number, colId: number, compId: number) {
    const status = await this.geoTrust.isInGeofence(driverId, lat, lng);
    
    // 🚀 FIXED: Added the required 'status' property (verified/failed)
    this.broadcast.emitGeoVerificationStatus(compId, colId, {
      driverId,
      status: status.inGeofence ? 'verified' : 'failed',
      verified: status.inGeofence,
      distance: status.distance
    });

    return status;
  }
}
