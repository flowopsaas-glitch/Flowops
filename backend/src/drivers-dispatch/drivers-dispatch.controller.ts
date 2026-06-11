import { Controller, Post, Body, Param, ParseIntPipe } from '@nestjs/common';
import { DriversDispatchService } from './drivers-dispatch.service';

@Controller('drivers-dispatch')
export class DriversDispatchController {
  constructor(private readonly dispatchService: DriversDispatchService) {}

  /**
   * 📦 ASSIGN BULK
   * POST /api/drivers-dispatch/:driverId/assign-bulk
   */
  @Post(':driverId/assign-bulk')
  async assignBulk(
    @Param('driverId', ParseIntPipe) driverId: number,
    @Body() body: { collectionIds: number[] }
  ) {
    return this.dispatchService.assignBulk(driverId, body.collectionIds || []);
  }

  /**
   * 📡 INBOUND TELEMETRY WEBHOOK
   * POST /api/drivers-dispatch/update-location
   */
  @Post('update-location')
  async updateLocation(@Body() body: { phone: string; lat: number; lng: number }) {
    if (!body.phone || body.lat === undefined || body.lng === undefined) {
      return { success: false, message: "Missing required telemetry data (phone, lat, lng)" };
    }

    return this.dispatchService.updateDriverLocation(body.phone, Number(body.lat), Number(body.lng));
  }
}
