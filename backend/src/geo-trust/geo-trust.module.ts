import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BroadcastModule } from '../broadcast/broadcast.module';
import { AuthModule } from '../auth/auth.module';
import { GeoTrustService } from './geo-trust.service';
import { DriverTrackingService } from '../driver-tracking/driver-tracking.service';
import { DriverTrackingController } from '../driver-tracking/driver-tracking.controller';

/**
 * GEO-TRUST MODULE - Premium GPS geofencing & verification
 *
 * Provides:
 * - Haversine distance calculations
 * - Geofence validation for dispatch assignment gating
 * - GPS audit trail for compliance
 * - Real-time location broadcasting
 *
 * Feature Gate: Behind subscription tier check
 * if (company.enabledFeatures.includes('geo-trust')) { ... }
 */
@Module({
  imports: [PrismaModule, BroadcastModule, AuthModule],
  providers: [GeoTrustService, DriverTrackingService],
  controllers: [DriverTrackingController],
  exports: [GeoTrustService, DriverTrackingService],
})
export class GeoTrustModule {}
