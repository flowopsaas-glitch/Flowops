import { Controller, Post, Get, Body, Param, ParseIntPipe } from '@nestjs/common';
import { DriverPortalService } from './driver-portal.service';

@Controller('driver-portal')
export class DriverPortalController {
  constructor(private readonly service: DriverPortalService) {}

  @Post('login')
  async login(@Body() body: { phone: string; pin: string }) {
    return this.service.login(body.phone, body.pin);
  }

  @Post('generate-pin')
  async generatePin(@Body() body: { driverId: number }) {
    const pin = await this.service.generatePin(body.driverId);
    return { success: true, pin, message: `PIN: ${pin}. Send to driver via WhatsApp.` };
  }

  @Get('deliveries/:driverId')
  async getDeliveries(@Param('driverId', ParseIntPipe) driverId: number) {
    return this.service.getDeliveries(driverId);
  }

  @Post('gps')
  async updateGps(@Body() body: { driverId: number; lat: number; lng: number; speed?: number }) {
    return this.service.updateGps(body.driverId, body.lat, body.lng, body.speed);
  }

  @Post('pod')
  async uploadPod(@Body() body: { driverId: number; waybillId: number; signatureData?: string; photoData?: string; recipientName?: string; notes?: string; source?: string }) {
    return this.service.uploadPod(body.driverId, body.waybillId, body.signatureData, body.photoData, body.recipientName, body.notes, body.source || 'PWA');
  }

  @Get('collections/:driverId')
  async getCollections(@Param('driverId', ParseIntPipe) driverId: number) {
    return this.service.getCollections(driverId);
  }

  @Post('poc')
  async uploadPoc(@Body() body: { driverId: number; collectionId: number; signatureData?: string; photoData?: string; collectorName?: string; notes?: string }) {
    return this.service.uploadPoc(body.driverId, body.collectionId, body.signatureData, body.photoData, body.collectorName, body.notes);
  }
}
