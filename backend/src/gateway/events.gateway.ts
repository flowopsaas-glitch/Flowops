import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayConnection, OnGatewayDisconnect, ConnectedSocket, MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: (origin: string, cb: Function) => cb(null, true), // refined via CORS_ORIGINS at init
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);
  /** Map of socketId → companyId for targeted broadcasts. */
  private readonly socketCompany = new Map<string, string>();

  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth as any)?.token ??
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });

      if (payload.type !== 'tenant') {
        client.disconnect();
        return;
      }

      const companyId: string = payload.companyId;
      await client.join(`company:${companyId}`);
      this.socketCompany.set(client.id, companyId);
      this.logger.debug(`Socket connected: ${client.id} → company:${companyId}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.socketCompany.delete(client.id);
    this.logger.debug(`Socket disconnected: ${client.id}`);
  }

  /** Client emits this after login to join their company room. */
  @SubscribeMessage('joinCompanyDashboard')
  async joinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { companyId: string },
  ) {
    await client.join(`company:${data.companyId}`);
    this.socketCompany.set(client.id, data.companyId);
    return { joined: `company:${data.companyId}` };
  }

  /** Driver emits location updates. */
  @SubscribeMessage('driver-location')
  handleDriverLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { driverId: string; lat: number; lng: number },
  ) {
    const companyId = this.socketCompany.get(client.id);
    if (companyId) {
      this.emitToCompany(companyId, 'driver-location-updated', data);
    }
  }

  // ── Emit helpers (called by services) ────────────────────────────────

  emitToCompany(companyId: string, event: string, data: any) {
    this.server.to(`company:${companyId}`).emit(event, data);
  }

  emitWaybillInboxChanged(companyId: string, item: any) {
    this.emitToCompany(companyId, 'waybill-inbox-changed', item);
  }

  emitInboxItemStatus(companyId: string, itemId: string, status: string) {
    this.emitToCompany(companyId, 'inbox-item-status-changed', { itemId, status });
  }

  emitShipmentUpdate(companyId: string, shipment: any) {
    this.emitToCompany(companyId, 'shipment-status-changed', shipment);
  }

  emitDispatchAssigned(companyId: string, data: any) {
    this.emitToCompany(companyId, 'dispatch-assigned', data);
  }

  emitRiskScoreUpdated(companyId: string, data: any) {
    this.emitToCompany(companyId, 'risk-score-updated', data);
  }

  emitAutoInvoiceCompleted(companyId: string, invoiceId: string) {
    this.emitToCompany(companyId, 'auto-invoice-completed', { invoiceId });
  }

  emitSystemHeal(companyId: string, reason: string) {
    this.emitToCompany(companyId, 'system-ui-heal', { reason });
  }
}
