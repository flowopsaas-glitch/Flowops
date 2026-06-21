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
    origin: (origin: string, cb: (err: Error | null, allow?: boolean) => void) => cb(null, true), // refined via CORS_ORIGINS at init
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
    // Extract the JWT from either the socket auth object or the HTTP header.
    const token =
      (client.handshake.auth as any)?.token ??
      client.handshake.headers?.authorization?.replace('Bearer ', '');

    // ── No token (page load before login, /track, /driver portal, etc.) ──
    // Do NOT disconnect — disconnecting during handleConnection makes the
    // Socket.IO client fire connect_error("Invalid namespace"), which floods
    // the browser console with red errors on every page load.  Instead, let
    // the socket stay connected but silently unsubscribed from any room.
    // The client emits 'joinCompanyDashboard' after login, which adds it to
    // the correct company room at that point.
    if (!token) {
      this.logger.debug(`Socket ${client.id} connected (no token – pre-login)`);
      return;
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });

      // Owner/driver tokens are valid JWTs but don't belong to a tenant room.
      // Connect them silently — they won't receive company-scoped events.
      if (payload.type !== 'tenant') {
        this.logger.debug(
          `Socket ${client.id} connected as ${payload.type} (no company room)`,
        );
        return;
      }

      const companyId: string = payload.companyId;
      await client.join(`company:${companyId}`);
      this.socketCompany.set(client.id, companyId);
      this.logger.debug(
        `Socket connected: ${client.id} → company:${companyId}`,
      );
    } catch {
      // Invalid / expired token — connect silently, no room access.
      // Same reasoning as the no-token case: don't disconnect here.
      this.logger.debug(
        `Socket ${client.id} connected with invalid/expired token (unauthenticated)`,
      );
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

  /**
   * broadcastToCompany — called by the 6-Claw AI services.
   * Accepts number OR string companyId for compatibility.
   */
  broadcastToCompany(companyId: number | string, event: string, data: any) {
    this.server.to(`company:${String(companyId)}`).emit(event, data);
  }
}
