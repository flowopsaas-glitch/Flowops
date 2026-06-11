import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BroadcastGateway } from '../broadcast/broadcast.gateway';

@Injectable()
export class DriversDispatchService {
  private readonly logger = new Logger('DriversDispatchService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcast: BroadcastGateway
  ) {}

  async assignBulk(driverId: number, collectionIds: number[]) {
    await this.prisma.waybill.updateMany({
      where: { id: { in: collectionIds } },
      data: { driverId, status: 'IN_TRANSIT' }
    });

    this.broadcast.emitWaybillInboxChanged(1, { reason: 'BULK_ASSIGN' });
    return { success: true, message: `${collectionIds.length} waybills assigned to driver ${driverId}` };
  }

  async updateDriverLocation(phone: string, lat: number, lng: number) {
    const driverRecord = await this.prisma.driver.findFirst({ where: { phone } });
    if (!driverRecord) return { success: false, message: "Driver not found." };

    const updated = await this.prisma.driver.update({
      where: { id: driverRecord.id },
      data: { lat, lng }
    });

    // 📡 Live Telemetry Broadcast
    this.broadcast.emitDriverLocationUpdate(1, {
      driverId: updated.id,
      lat: updated.lat,
      lng: updated.lng
    });

    return { success: true, driverId: updated.id, lat, lng };
  }
}
