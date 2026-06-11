import { Controller, Post, Body, Logger } from '@nestjs/common';
import { LocationGateway } from './location.gateway';
import { DriversService } from './drivers/drivers.service';

@Controller() // Removed 'api' from here to avoid 404/double-prefixing
export class LocationController {
  private readonly logger = new Logger('LocationController');

  constructor(
    private readonly locationGateway: LocationGateway,
    private readonly driversService: DriversService
  ) {}

  @Post('location-update')
  async updateLocation(
    @Body() body: { companyId: number; driverId: number; lat: number; lng: number }
  ) {
    const { companyId, driverId, lat, lng } = body;

    try {
      // 1. PERSIST TO DB: Updating schema fields lat and lng
      await this.driversService.update(Number(driverId), {
        lat: lat,
        lng: lng,
        availabilityStatus: 'ACTIVE', 
      });

      this.logger.log(`💾 DB SAVED: Driver ${driverId} updated at ${lat}, ${lng}`);

      // 2. BROADCAST LIVE: Emits to the /broadcast namespace
      this.locationGateway.sendLocationUpdate(companyId, {
        driverId,
        lat,
        lng,
        timestamp: new Date().toISOString(),
      });

      return { status: 'success', message: 'Database & UI updated' };
    } catch (error: any) {
      this.logger.error(`❌ Sync Failed: ${error?.message || 'Unknown Error'}`);
      return { status: 'error', message: 'Update failed' };
    }
  }
}
