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
    origin: (origin: string, cb: (err: Error | null, allow?: boolean) => void) => {
      // In production, only allow configured origins. In dev, allow all.
      const allowed = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map(o => o.trim());
      if (!origin || allowed.includes(origin) || process.env.NODE_ENV !== 'production') {
        cb(null, true);
      } else {
        cb(new Error(`WebSocket origin ${origin} not allowed`), false);
      }
    },
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

  /** Client emits this after login to join their company room.
   * The companyId from the JWT token is always used — the client-supplied
   * companyId is validated against the token claim to prevent a client from
   * joining another tenant's room.
   */
  @SubscribeMessage('joinCompanyDashboard')
  async joinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { companyId: string },
  ) {
    // Extract and re-verify the token to get the authoritative companyId.
    const token =
      (client.handshake.auth as any)?.token ??
      client.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      this.logger.warn(`Socket ${client.id} tried joinCompanyDashboard without a token — rejected`);
      return { error: 'Not authenticated' };
    }

    let verifiedCompanyId: string | undefined;
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
      // Only tenant tokens belong to a company room.
      if (payload.type === 'tenant' && payload.companyId) {
        verifiedCompanyId = payload.companyId;
      }
    } catch {
      this.logger.warn(`Socket ${client.id} tried joinCompanyDashboard with invalid token — rejected`);
      return { error: 'Invalid token' };
    }

    if (!verifiedCompanyId) {
      return { error: 'Not a tenant session' };
    }

    // Reject if the client is trying to join a different company's room.
    if (data?.companyId && data.companyId !== verifiedCompanyId) {
      this.logger.warn(
        `Socket ${client.id} tried to join company:${data.companyId} but token says ${verifiedCompanyId} — rejected`,
      );
      return { error: 'Forbidden' };
    }

    await client.join(`company:${verifiedCompanyId}`);
    this.socketCompany.set(client.id, verifiedCompanyId);
    this.logger.debug(`Socket ${client.id} joined company:${verifiedCompanyId}`);
    return { joined: `company:${verifiedCompanyId}` };
  }

  /** Driver emits location updates.
   * Only forwarded if the socket is already in a verified company room
   * (i.e. joined via joinCompanyDashboard with a valid token).
   */
  @SubscribeMessage('driver-location')
  handleDriverLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { driverId: string; lat: number; lng: number },
  ) {
    const companyId = this.socketCompany.get(client.id);
    if (!companyId) {
      // Not in a verified room — silently ignore
      return;
    }
    this.emitToCompany(companyId, 'driver-location-updated', data);
  }

  // ── Emit helpers (called by services) ────────────────────────────────

  emitToCompany(companyId: string, event: string, data: any) {
    this.server.to(`company:${companyId}`).emit(event, data);
  }

  /**
   * Emit to a company room AND report what we can honestly prove about it.
   *
   * A plain `emit` is fire-and-forget: it tells you nothing about whether a
   * browser ever saw the event, so a caller that records "notified" on the
   * strength of an emit is recording a hope. This variant uses Socket.IO's
   * per-emit acknowledgement with a timeout, which gives a real transport-level
   * receipt from each client whose callback fired.
   *
   * The distinction the callers must keep:
   *   dispatched       — we handed the event to Socket.IO (always true here)
   *   connectedClients — sockets in the room at emit time (0 = nobody to tell)
   *   receipts         — clients that confirmed receipt (this is DELIVERED;
   *                      dispatched-but-no-receipt is only ever SENT)
   *
   * A receipt is transport confirmation from the browser, NOT a human
   * acknowledging anything — acknowledgement is a separate, recorded act.
   *
   * Never throws: realtime is a best-effort accelerator over the pull channels,
   * and a socket failure must not roll back a window change that is already
   * committed.
   */
  async emitToCompanyWithReceipt(
    companyId: string,
    event: string,
    data: any,
    timeoutMs = 4000,
  ): Promise<{ dispatched: boolean; connectedClients: number; receipts: number }> {
    const room = `company:${companyId}`;
    let connectedClients = 0;
    try {
      connectedClients = (await this.server.in(room).fetchSockets()).length;
    } catch (err: any) {
      // A non-memory adapter or a shutdown race can make this unavailable.
      // Unknown is reported as unknown, not as zero-connected.
      this.logger.debug(`fetchSockets unavailable for ${room}: ${err?.message ?? err}`);
      connectedClients = -1;
    }

    const receipts = await new Promise<number>((resolve) => {
      let settled = false;
      const finish = (n: number) => {
        if (settled) return;
        settled = true;
        resolve(n);
      };
      // Hard backstop: the Socket.IO callback should always fire (with a
      // TimeoutError when clients do not respond), but a gateway that is
      // closing or a server that was never initialised must not hang the
      // caller forever.
      const backstop = setTimeout(() => finish(0), timeoutMs + 500);
      try {
        this.server
          .to(room)
          .timeout(timeoutMs)
          .emit(event, data, (err: any, responses: any) => {
            clearTimeout(backstop);
            finish(Array.isArray(responses) ? responses.length : 0);
          });
      } catch (err: any) {
        clearTimeout(backstop);
        this.logger.debug(`emit to ${room} failed: ${err?.message ?? err}`);
        finish(0);
      }
    });

    return { dispatched: true, connectedClients, receipts };
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

  /** Emit to a specific driver (if they have a socket connected via driver portal). */
  emitToDriver(driverId: string, event: string, data: any) {
    this.server.to(`driver:${driverId}`).emit(event, data);
  }

  emitDispatchAssigned(companyId: string, data: any) {
    this.emitToCompany(companyId, 'dispatch-assigned', data);
  }

  emitRiskScoreUpdated(companyId: string, data: any) {
    this.emitToCompany(companyId, 'risk-score-updated', data);
  }

  emitAutoInvoiceCompleted(
    companyId: string,
    invoice: { id: string; invoiceNumber?: string; total?: number; deliveryCount?: number },
  ) {
    this.emitToCompany(companyId, 'auto-invoice-completed', invoice);
  }

  // emitSystemHeal REMOVED — this dead-code path allowed any backend service
  // to force a full browser reload on all connected clients of a company,
  // causing severe UX degradation (page "jumping"). The frontend listener
  // has also been removed. If a real hot-update mechanism is ever needed,
  // use the PWA service-worker update flow instead.

  /**
   * broadcastToCompany — called by the 6-Claw AI services.
   * Accepts number OR string companyId for compatibility.
   */
  broadcastToCompany(companyId: number | string, event: string, data: any) {
    this.server.to(`company:${String(companyId)}`).emit(event, data);
  }
}
