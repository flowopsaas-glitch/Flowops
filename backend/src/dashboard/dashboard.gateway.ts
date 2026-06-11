import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: { origin: '*' },
  transports: ['websocket']
})
export class DashboardGateway {
  private readonly logger = new Logger(DashboardGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private readonly prisma: PrismaService) {}

  @SubscribeMessage('joinCompanyDashboard')
  handleJoinRoom(
    @MessageBody() data: { companyId: number },
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = `company-${data.companyId}`;
    client.join(roomId);
    this.logger.log(`📡 Dashboard terminal client connected to monitoring stream room: ${roomId}`);
    return { success: true, joinedRoom: roomId };
  }

  @SubscribeMessage('updateDriverTelemetry')
  async handleDriverLocationUpdate(
    @MessageBody() payload: { driverId: number; companyId: number; lat: number; lng: number },
  ) {
    this.logger.debug(`🌍 Live location packet captured for driver ${payload.driverId}: [${payload.lat}, ${payload.lng}]`);

    try {
      // Find valid driver ID from recent database seed execution pass
      const targetDriverId = Number(payload.driverId);

      const updatedDriver = await this.prisma.driver.update({
        where: { id: targetDriverId },
        data: {
          lat: payload.lat,
          lng: payload.lng,
          availabilityStatus: 'AVAILABLE',
        },
      });

      const roomId = `company-${payload.companyId}`;
      this.server.to(roomId).emit('telemetryStreamUpdate', {
        driverId: updatedDriver.id,
        name: updatedDriver.name,
        vehicleReg: updatedDriver.vehicleReg,
        lat: updatedDriver.lat,
        lng: updatedDriver.lng,
        timestamp: new Date().toISOString(),
      });

      return { success: true };
    } catch (error: any) {
      this.logger.error(`❌ Telemetry streaming exception intercepted: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

