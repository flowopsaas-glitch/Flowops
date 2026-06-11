import { Controller, Post, Get, Param, Body, UseGuards, Request, ParseIntPipe, Query } from '@nestjs/common';
import { DriverTrackingService } from './driver-tracking.service';
import { AppAuthGuard } from '../auth/app-auth.guard';

/**
 * GPS Checkpoint Endpoints for Driver Apps
 * Used by mobile apps to stream real-time driver locations
 */
@Controller('driver-tracking')
@UseGuards(AppAuthGuard)
export class DriverTrackingController {
  constructor(private readonly tracking: DriverTrackingService) {}

  /**
   * POST /driver-tracking/checkpoint
   * Record GPS checkpoint from driver app (requires auth)
   *
   * Body:
   * {
   *   "lat": 28.7041,
   *   "lng": 77.1025,
   *   "accuracy": 5.0,
   *   "heading": 45,
   *   "speed": 25.5
   * }
   */
  @Post('checkpoint')
  async recordCheckpoint(
    @Request() req: any,
    @Body()
    body: {
      lat: number;
      lng: number;
      accuracy?: number;
      altitude?: number;
      heading?: number;
      speed?: number;
    },
  ) {
    const driverId = req.user?.id;
    const companyId = req.user?.companyId;

    if (!driverId || !companyId) {
      return { success: false, reason: 'Authentication required' };
    }

    return this.tracking.recordCheckpoint({
      driverId,
      companyId,
      ...body,
    });
  }

  /**
   * GET /driver-tracking/latest
   * Get current driver's latest location
   */
  @Get('latest')
  async getLatestLocation(@Request() req: any) {
    const driverId = req.user?.id;

    if (!driverId) {
      return { success: false, reason: 'Authentication required' };
    }

    const location = await this.tracking.getLatestLocation(driverId);
    return { success: !!location, data: location };
  }

  /**
   * GET /driver-tracking/history?hours=24&limit=100
   * Get driver's location history
   */
  @Get('history')
  async getLocationHistory(
    @Request() req: any,
    @Query('hours', new ParseIntPipe({ optional: true })) hours: number = 24,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 100,
  ) {
    const driverId = req.user?.id;

    if (!driverId) {
      return { success: false, reason: 'Authentication required' };
    }

    const history = await this.tracking.getLocationHistory(driverId, hours, limit);
    return { success: true, data: history };
  }

  /**
   * GET /driver-tracking/fleet
   * Get all drivers' latest locations (admin only)
   */
  @Get('fleet')
  async getFleetLocations(@Request() req: any) {
    const companyId = req.user?.companyId;

    if (!companyId) {
      return { success: false, reason: 'Authentication required' };
    }

    const locations = await this.tracking.getFleetLocations(companyId);
    return { success: true, data: locations, count: locations.length };
  }

  /**
   * GET /driver-tracking/:driverId
   * Get specific driver's latest location (admin only)
   */
  @Get(':driverId')
  async getDriverLocation(
    @Request() req: any,
    @Param('driverId', ParseIntPipe) driverId: number,
  ) {
    // TODO: Add permission check - only allow if user is admin or owns this driver

    const location = await this.tracking.getLatestLocation(driverId);
    return { success: !!location, data: location };
  }

  /**
   * POST /driver-tracking/:driverId/geofence-check
   * Check if driver is within geofence of collection point
   */
  @Post(':driverId/geofence-check')
  async checkGeofence(
    @Request() req: any,
    @Param('driverId', ParseIntPipe) driverId: number,
    @Body()
    body: {
      collectionLat: number;
      collectionLng: number;
      collectionId: number;
    },
  ) {
    const companyId = req.user?.companyId;

    if (!companyId) {
      return { success: false, reason: 'Authentication required' };
    }

    const { inGeofence, distance } = await this.tracking.checkCollectionGeofence(
      driverId,
      body.collectionLat,
      body.collectionLng,
      body.collectionId,
      companyId,
    );

    return { success: true, inGeofence, distance };
  }
}
