import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway()
export class CollectionsGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('joinCompanyRoom')
  handleJoin(client: Socket, payload: { companyId: string }) {
    client.join(`company_${payload.companyId}`);
  }

  broadcastCompanyUnlocked(companyId: string) {
    this.server.to(`company_${companyId}`).emit('company-unlocked', { companyId });
  }

  broadcastDriverLocation(driverId: string, latitude: number, longitude: number) {
    this.server.emit('driver-location-update', { driverId, latitude, longitude });
  }
}
