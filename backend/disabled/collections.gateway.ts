// src/collections/collections.gateway.ts
import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable } from '@nestjs/common';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*', // Allow all origins for simplicity, adjust in production
  },
})
export class CollectionsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server; // Added '!' for definite assignment assertion

  handleConnection(client: Socket, ...args: any[]) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('message')
  handleMessage(client: Socket, payload: any): string {
    console.log(`Message from client ${client.id}: `, payload);
    return 'Hello world!'; // Echo message back
  }

  // Example: Emitting events to clients
  sendCollectionUpdate(collectionId: string, data: any) {
    this.server.emit(`collection_update_${collectionId}`, data);
  }

  sendCollectionsToAll(data: any) {
    this.server.emit('collections_updated', data);
  }

  // Method to broadcast when a company is unlocked (for ACKs)
  broadcastCompanyUnlocked(companyId: string) {
    this.server.emit(`company_${companyId}_unlocked`, { companyId, message: 'Company unlocked and ready for new collections.' });
  }
}