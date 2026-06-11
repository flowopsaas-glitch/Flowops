import { WebSocketGateway, WebSocketServer, SubscribeMessage } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway()
export class CollectionsGateway {
  @WebSocketServer()
  server: Server;

  /** Client joins company room */
  @SubscribeMessage('joinCompanyRoom')
  handleJoinCompanyRoom(client: Socket, payload: { companyId: string }) {
    const room = `company_${payload.companyId}`;
    client.join(room);
    console.log(`Client ${client.id} joined room ${room}`);
    client.emit('joinedRoom', { room });
  }

  /** Broadcasts company unlocked event */
  broadcastCompanyUnlocked(companyId: string) {
    const room = `company_${companyId}`;
    this.server.to(room).emit('company-unlocked', { companyId });
    console.log(`Broadcasted company-unlocked to room ${room}`);
  }
}
