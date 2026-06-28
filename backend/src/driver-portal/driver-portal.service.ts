import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventsGateway } from '../gateway/events.gateway';

@Injectable()
export class DriverPortalService {
  private readonly logger = new Logger(DriverPortalService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private gateway: EventsGateway,
  ) {}

  /**
   * Returns all active jobs for a driver as a flat array.
   * The driver portal dashboard filters this array:
   *   - status === 'PENDING'    → rendered as "Collections"
   *   - status !== 'PENDING'    → rendered as "Deliveries"
   */
  async getDriverJobs(driverId: string) {
    const [collections, shipments] = await Promise.all([
      this.prisma.collection.findMany({
        where: { driverId, status: { in: ['ASSIGNED', 'PENDING', 'IN_PROGRESS'] } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.shipment.findMany({
        where: { driverId, status: { in: ['PENDING', 'IN_TRANSIT'] } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Fetch waybill details separately (avoids Prisma include type issues)
    const wbIds = shipments.map(s => s.waybillId);
    const waybills = wbIds.length
      ? await this.prisma.waybill.findMany({
          where: { id: { in: wbIds } },
          select: {
            id: true, trackingNumber: true, status: true,
            recipientName: true, recipientPhone: true, recipientAddress: true,
            recipientLat: true, recipientLng: true,
            senderName: true, senderAddress: true,
            weight: true, totalAmount: true, codAmount: true, codCollected: true,
          },
        })
      : [];
    const wbMap = Object.fromEntries(waybills.map(w => [w.id, w]));

    const collectionJobs = collections.map(c => ({
      id: c.id,
      type: 'collection',
      status: 'PENDING',
      trackingNumber: `COL-${c.id.slice(-6).toUpperCase()}`,
      recipientName: c.clientName ?? 'Client',
      recipientPhone: c.clientPhone,
      recipientAddress: c.pickupAddress,
      recipientLat: c.pickupLat,
      recipientLng: c.pickupLng,
      notes: c.notes,
      scheduledAt: c.scheduledAt,
      createdAt: c.createdAt,
      // ── Backward-compatible aliases ──────────────────────────────────────
      waybillNumber: `COL-${c.id.slice(-6).toUpperCase()}`,
      receiverName:  c.clientName ?? 'Client',
      receiverPhone: c.clientPhone,
      destination:   c.pickupAddress,
    }));

    const deliveryJobs = shipments.map(s => {
      const wb = wbMap[s.waybillId] ?? {};
      const tnum = (wb as any).trackingNumber ?? s.id;
      const rname = (wb as any).recipientName ?? 'Recipient';
      const rphone = (wb as any).recipientPhone ?? null;
      const raddress = (wb as any).recipientAddress ?? null;
      return {
        id: s.id,
        type: 'delivery',
        status: s.status,
        // Canonical fields
        trackingNumber: tnum,
        recipientName:  rname,
        recipientPhone: rphone,
        recipientAddress: raddress,
        recipientLat: (wb as any).recipientLat ?? s.currentLat,
        recipientLng: (wb as any).recipientLng ?? s.currentLng,
        senderName:    (wb as any).senderName,
        senderAddress: (wb as any).senderAddress,
        weight:      (wb as any).weight,
        totalAmount: (wb as any).totalAmount,
        codAmount:   (wb as any).codAmount,
        codCollected:(wb as any).codCollected,
        waybillId:   s.waybillId,
        createdAt:   s.createdAt,
        // ── Backward-compatible aliases used by the standalone driver portal ──
        waybillNumber: tnum,          // Dashboard reads w.waybillNumber
        receiverName:  rname,         // Dashboard reads w.receiverName
        receiverPhone: rphone,        // Dashboard reads w.receiverPhone
        destination:   raddress,      // Dashboard reads w.destination
      };
    });

    return [...collectionJobs, ...deliveryJobs];
  }

  async updateGps(driverId: string, lat: number, lng: number) {
    return this.prisma.driver.update({
      where: { id: driverId },
      data: { lastLat: lat, lastLng: lng, lastSeen: new Date() },
    });
  }

  async recordPod(body: {
    waybillId: string;
    signatureUrl?: string;
    imageUrl?: string;
    recipientName?: string;
    notes?: string;
  }) {
    const updated = await this.prisma.waybill.update({
      where: { id: body.waybillId },
      data: {
        status: 'DELIVERED',
        podSignatureUrl: body.signatureUrl,
        podImageUrl: body.imageUrl,
        podRecipient: body.recipientName,
      },
    });

    // ── Close the loop ───────────────────────────────────────────────────
    // A field POD is a real DELIVERED event. Mirror the office delivery path:
    // notify the customer, request a rating, and live-refresh the dispatch
    // board. All best-effort — none of this can break the POD write itself.
    void this.notifications.notifyWaybillStatus(updated as any);
    void this.notifications.sendRatingRequest(updated as any);
    try {
      this.gateway.emitShipmentUpdate(updated.companyId, {
        waybillId: updated.id,
        trackingNumber: updated.trackingNumber,
        status: 'DELIVERED',
        source: 'driver-pod',
      });
    } catch (err: any) {
      this.logger.warn(`POD realtime emit failed: ${err?.message ?? err}`);
    }

    return updated;
  }

  async getMessages(driverId: string, limit = 50, skip = 0) {
    const msgs = await this.prisma.driverChatMessage.findMany({
      where: { driverId },
      orderBy: { createdAt: 'asc' },
      take: limit,
      skip,
    });
    return msgs;
  }

  async sendMessage(driverId: string, companyId: string, message: string, senderType = 'driver', attachmentUrl?: string, attachmentType?: string) {
    return this.prisma.driverChatMessage.create({
      data: { driverId, companyId, message, senderType, attachmentUrl, attachmentType },
    });
  }

  async markRead(id: string) {
    // The driver portal frontend passes the driverId (not a messageId) to this
    // endpoint. Detect which case we're in: if the id matches a driver record,
    // bulk-mark all unread dispatch messages for that driver as read.
    const driver = await this.prisma.driver.findUnique({ where: { id }, select: { id: true } });
    if (driver) {
      const result = await this.prisma.driverChatMessage.updateMany({
        where: { driverId: id, senderType: 'dispatch', readAt: null },
        data: { readAt: new Date() },
      });
      return { ok: true, marked: result.count };
    }
    // Fallback: treat as a single messageId (original behavior)
    return this.prisma.driverChatMessage.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  /** Typing state kept in-memory (ephemeral — no DB write needed) */
  private typingMap = new Map<string, { isTyping: boolean; updatedAt: Date }>();

  setTyping(driverId: string, isTyping: boolean) {
    this.typingMap.set(driverId, { isTyping, updatedAt: new Date() });
    return { ok: true };
  }

  getTypingStatus(driverId: string) {
    const entry = this.typingMap.get(driverId);
    if (!entry) return { isTyping: false };
    // Expire typing status after 4 s
    const expired = (Date.now() - entry.updatedAt.getTime()) > 4000;
    return { isTyping: expired ? false : entry.isTyping };
  }

  /** Dispatch-side: list drivers with their most recent message + unread count */
  async getDriverConversations(companyId: string) {
    const drivers = await this.prisma.driver.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true, vehicleReg: true, status: true, lastSeen: true },
    });

    const convos = await Promise.all(drivers.map(async d => {
      const unread = await this.prisma.driverChatMessage.count({
        where: { driverId: d.id, senderType: 'driver', readAt: null },
      });
      const last = await this.prisma.driverChatMessage.findFirst({
        where: { driverId: d.id },
        orderBy: { createdAt: 'desc' },
      });
      return { ...d, unreadCount: unread, lastMessage: last?.message, lastMessageAt: last?.createdAt };
    }));

    return convos.sort((a, b) => {
      if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
      if (a.lastMessageAt && b.lastMessageAt) return b.lastMessageAt.getTime() - a.lastMessageAt.getTime();
      return 0;
    });
  }

  /** Dispatch sends a message to a specific driver */
  async dispatchSend(driverId: string, companyId: string, message: string) {
    return this.prisma.driverChatMessage.create({
      data: { driverId, companyId, message, senderType: 'dispatch' },
    });
  }
}
