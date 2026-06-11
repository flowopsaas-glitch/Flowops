import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*', // Ensures localhost:5173 can connect without CORS blocks
  },
})
export class LocationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('LocationGateway');

  handleConnection(client: Socket) {
    this.logger.log(`🔗 Client Connected to Broadcast: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`❌ Client Disconnected: ${client.id}`);
  }

  // Matches the socket.emit("joinCompanyRoom") in your useSocket hook
  @SubscribeMessage('joinCompanyRoom')
  handleJoinRoom(client: Socket, payload: { companyId: number | string }) {
    const room = `company_${payload.companyId}`;
    client.join(room);
    this.logger.log(`👥 Client ${client.id} joined room: ${room}`);
  }

  sendLocationUpdate(companyId: number | string, data: any) {
    const room = `company_${companyId}`;
    // Matches the 'driver-location-updated' listener in your frontend
    this.server.to(room).emit('driver-location-updated', data);
    this.logger.log(`📡 Broadcast to ${room}: ${JSON.stringify(data)}`);
  }


  /**
   * 🚀 Broadcast live driver location to company room
   */
  @SubscribeMessage('broadcastLocation')
  broadcastLocation(companyId: number, data: any) {
    this.server.to(`company_${companyId}`).emit('driverLocationUpdate', data);
  }

  /**
   * 🚀 Broadcast ETA updates
   */
  @SubscribeMessage('broadcastETAUpdate')
  broadcastETAUpdate(companyId: number, data: any) {
    this.server.to(`company_${companyId}`).emit('etaUpdate', data);
  }

  /**
   * 🚀 Broadcast geofence alerts
   */
  @SubscribeMessage('broadcastGeofenceAlert')
  broadcastGeofenceAlert(companyId: number, data: any) {
    this.server.to(`company_${companyId}`).emit('geofenceAlert', data);
  }

  /**
   * 🚀 Broadcast route deviation alerts
   */
  @SubscribeMessage('broadcastRouteDeviation')
  broadcastRouteDeviation(companyId: number, data: any) {
    this.server.to(`company_${companyId}`).emit('routeDeviation', data);
  }
}