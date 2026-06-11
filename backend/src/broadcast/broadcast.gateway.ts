// /opt/Flowops/backend/src/broadcast/broadcast.gateway.ts
import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*', // Allow all origins for WebSockets
    credentials: true,
  },
  // ✅ FIX: Removed 'namespace: /broadcast' so it listens on the default '/' namespace.
  // This completely resolves the "Invalid namespace" error from the frontend.
  transports: ['websocket', 'polling'], // Ensure websocket is prioritized
})
export class BroadcastGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger('BroadcastGateway');

  afterInit(server: Server) { 
    this.logger.log('🚀 FLOWOPS BROADCAST SYSTEM LIVE (WebSockets Initialized)'); 
  }

  handleConnection(client: Socket, ...args: any[]) {
    this.logger.debug(`✅ Socket Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`❌ Socket Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinCompanyRoom')
  handleJoinCompanyRoom(client: Socket, payload: { companyId: number | string }) {
    if (payload && payload.companyId) {
      const roomName = `company_${payload.companyId}`;
      client.join(roomName);
      this.logger.log(`🏢 Socket ${client.id} joined room ${roomName}`);
      
      // Acknowledge to the client
      client.emit('joined-room', { room: roomName, status: 'success' });
    }
  }

  @SubscribeMessage('leaveCompanyRoom')
  handleLeaveCompanyRoom(client: Socket, payload: { companyId: number | string }) {
    if (payload && payload.companyId) {
      const roomName = `company_${payload.companyId}`;
      client.leave(roomName);
      this.logger.log(`🚪 Socket ${client.id} left room ${roomName}`);
    }
  }

  emitDriverLocationUpdate(companyId: number | string, payload: { driverId: any, lat: number | null, lng: number | null, name?: string }) {
    this.server.to(`company_${companyId}`).emit('driver-location-updated', payload);
  }

  emitGeoVerificationStatus(companyId: number | string, collectionId: number | string, payload: any) {
    this.server.to(`company_${companyId}`).emit('geo-verification-status', { collectionId, ...payload });
  }

  emitSearchResultsUpdated(companyId: number | string, payload: any) {
    this.server.to(`company_${companyId}`).emit('search-results-updated', payload);
  }

  emitWaybillInboxChanged(companyId: number | string, payload: any) {
    this.server.to(`company_${companyId}`).emit('waybills/inbox-changed', payload);
  }

  broadcastToCompany(companyId: number | string, event: string, payload: any) {
    this.server.to(`company_${companyId}`).emit(event, { 
      ...payload, 
      timestamp: new Date().toISOString()
    });
  }
  
  // Global broadcast (use sparingly)
  broadcastToAll(event: string, payload: any) {
    this.server.emit(event, {
      ...payload,
      timestamp: new Date().toISOString()
    });
  }
}
