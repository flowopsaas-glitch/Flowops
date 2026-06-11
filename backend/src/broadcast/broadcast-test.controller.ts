import { Controller, Post, Body } from '@nestjs/common';
import { BroadcastGateway } from './broadcast.gateway';

@Controller('api/test-fleet')
export class BroadcastTestController {
  constructor(private readonly broadcast: BroadcastGateway) {}

  @Post('simulate')
  simulateMovement(@Body() body: { companyId: number }) {
    // Simulate movement for 3 drivers in the JHB/Randburg area
    const drivers = [
      { id: 1, name: 'Unit 01', lat: -26.09, lng: 27.99 },
      { id: 2, name: 'Unit 02', lat: -26.10, lng: 28.01 },
      { id: 3, name: 'Unit 03', lat: -26.11, lng: 27.98 },
    ];

    drivers.forEach((d, index) => {
      // Add a slight random offset to simulate actual driving
      const offsetLat = d.lat + (Math.random() - 0.5) * 0.01;
      const offsetLng = d.lng + (Math.random() - 0.5) * 0.01;

      this.broadcast.emitDriverLocationUpdate(body.companyId, {
        driverId: d.id,
        name: d.name,
        lat: offsetLat,
        lng: offsetLng,
      });
    });

    return { success: true, message: 'Tactical signal broadcasted' };
  }
}
