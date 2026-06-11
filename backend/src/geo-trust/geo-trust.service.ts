import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GeoTrustService {
  private readonly logger = new Logger('GeoTrustService');
  private readonly defaultGeofenceRadiusMeters = 500;
  private readonly collectionVerificationRadiusMeters = 500;

  constructor(private readonly prisma: PrismaService) {}

  private toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000; // Earth radius in meters
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  async isInGeofence(
    driverId: number,
    targetLat: number,
    targetLng: number,
    radiusMeters: number = this.defaultGeofenceRadiusMeters,
  ): Promise<{ inGeofence: boolean; distance: number; accuracy?: string }> {
    try {
      const lastLocation = await (this.prisma as any).driverLocation.findFirst({
        where: { driverId },
        orderBy: { timestamp: 'desc' },
      });

      if (!lastLocation) {
        return { inGeofence: false, distance: Infinity, accuracy: 'NO_DATA' };
      }

      const distance = this.calculateDistance(
        lastLocation.lat,
        lastLocation.lng,
        targetLat,
        targetLng,
      );

      const inGeofence = distance <= radiusMeters;
      return { inGeofence, distance, accuracy: inGeofence ? 'WITHIN_RADIUS' : 'OUTSIDE_RADIUS' };
    } catch (err: any) {
      this.logger.error(`Geofence error: ${err.message}`);
      return { inGeofence: false, distance: Infinity };
    }
  }

  async recordGpsCheckpoint(driverId: number, lat: number, lng: number, companyId?: number): Promise<any> {
    return (this.prisma as any).driverLocation.create({
      data: {
        driverId,
        lat,
        lng,
        companyId: companyId || 1,
        timestamp: new Date(),
      },
    });
  }
}
