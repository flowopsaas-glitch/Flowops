import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventsGateway } from '../gateway/events.gateway';
import { DriverSafetyService } from '../driver-safety/driver-safety.service';

@Injectable()
export class DriverPortalService {
  private readonly logger = new Logger(DriverPortalService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private gateway: EventsGateway,
    private safety: DriverSafetyService,
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

    // ── Linehaul manifests assigned to this driver ──────────────────────────
    const manifests = await this.prisma.manifest.findMany({
      where: { driverId, dispatched: false },
      include: {
        branch: { select: { name: true, address: true } },
        _count: { select: { waybills: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const linehaulJobs = manifests.map(m => ({
      id: m.id,
      type: 'linehaul',
      status: 'IN_TRANSIT',
      trackingNumber: m.code,
      recipientName: m.branch?.name ?? 'Destination Hub',
      recipientPhone: null,
      recipientAddress: m.branch?.address ?? 'Inter-branch transfer',
      recipientLat: null,
      recipientLng: null,
      senderName: 'FlowOps Hub',
      senderAddress: null,
      weight: null,
      totalAmount: null,
      codAmount: null,
      codCollected: false,
      waybillId: null,
      manifestId: m.id,
      manifestCode: m.code,
      parcelCount: m._count.waybills,
      destinationBranch: m.branch?.name ?? 'Unknown Branch',
      createdAt: m.createdAt,
      // Backward-compatible aliases
      waybillNumber: m.code,
      receiverName: m.branch?.name ?? 'Destination Hub',
      receiverPhone: null,
      destination: m.branch?.address ?? 'Inter-branch transfer',
    }));

    return [...collectionJobs, ...deliveryJobs, ...linehaulJobs];
  }

  /**
   * POST /driver-portal/manifest/:id/deliver — driver confirms linehaul arrival
   * at the destination branch. Marks manifest as dispatched and updates all
   * waybills to COLLECTED (received at destination hub, ready for last-mile).
   */
  async confirmLinehaulDelivery(manifestId: string, driverId: string, companyId: string) {
    const manifest = await this.prisma.manifest.findFirst({
      where: { id: manifestId, driverId, dispatched: false },
      include: { waybills: true, branch: { select: { name: true } } },
    });

    if (!manifest) {
      throw new Error('Manifest not found, already delivered, or not assigned to you');
    }

    // Mark manifest as delivered
    await this.prisma.manifest.update({
      where: { id: manifestId },
      data: { dispatched: true, dispatchedAt: new Date() },
    });

    // Update all waybills in the manifest to AT_DESTINATION_HUB (arrived at receiving branch)
    const waybillIds = manifest.waybills.map((mw: any) => mw.waybillId);
    if (waybillIds.length > 0) {
      await this.prisma.waybill.updateMany({
        where: { id: { in: waybillIds } },
        data: { status: 'AT_DESTINATION_HUB' },
      });

      // Auto-reassign each waybill to the nearest available driver at the destination branch
      for (const wbId of waybillIds) {
        const availableDriver = await this.prisma.driver.findFirst({
          where: { companyId, isActive: true, status: 'AVAILABLE', id: { not: driverId } },
          orderBy: { lastSeen: 'desc' },
        });
        if (availableDriver) {
          const existingShipment = await this.prisma.shipment.findFirst({ where: { waybillId: wbId, companyId } });
          if (existingShipment) {
            await this.prisma.shipment.update({ where: { id: existingShipment.id }, data: { driverId: availableDriver.id, status: 'PENDING' } });
          } else {
            await this.prisma.shipment.create({ data: { waybillId: wbId, companyId, driverId: availableDriver.id, status: 'PENDING' } });
          }
        }
      }
    }

    this.logger.log(
      `Linehaul ${manifest.code} delivered by driver ${driverId} to branch ${manifest.branch?.name ?? manifestId}. ` +
      `${waybillIds.length} waybills marked AT_DESTINATION_HUB (ready for last-mile).`,
    );

    return {
      success: true,
      manifestCode: manifest.code,
      destinationBranch: manifest.branch?.name ?? 'Unknown',
      waybillsDelivered: waybillIds.length,
    };
  }

  async updateGps(driverId: string, lat: number, lng: number, speed?: number) {
    const driver = await this.prisma.driver.update({
      where: { id: driverId },
      data: { lastLat: lat, lastLng: lng, lastSeen: new Date() },
    });

    // ── AI SAFETY SUPERVISOR: Check crime hotspots on every GPS update ────
    // Non-blocking — safety alerts fire asynchronously without slowing GPS response.
    void this.safety.checkPosition(
      driverId, driver.companyId, lat, lng, speed, driver.name,
    ).catch((err) => {
      this.logger.warn(`Safety check failed (non-blocking): ${err?.message}`);
    });

    return driver;
  }

  /**
   * confirmCollection — driver marks a collection as picked up.
   *
   * Lifecycle (chain of custody — no longer auto-dispatches for delivery):
   * 1. Marks Collection status → COLLECTED + pickedUpAt = now
   * 2. Creates a Waybill at status COLLECTED (NOT IN_TRANSIT)
   * 3. Creates a Shipment (PENDING) against the collecting driver for custody
   * 4. Parcel now awaits depot receive (AT_ORIGIN_HUB) before any onward leg
   */
  async confirmCollection(
    collectionId: string,
    driverId: string,
    companyId: string,
    body: { parcelCount?: number; notes?: string },
  ) {
    // 1. Find and validate the collection
    const collection = await this.prisma.collection.findFirst({
      where: { id: collectionId, driverId, companyId },
    });
    if (!collection) {
      throw new Error('Collection not found or not assigned to this driver');
    }
    // Idempotent: if this collection was already confirmed (e.g. an offline
    // action being replayed by the driver app's sync engine after a flaky
    // connection), don't error and don't create a second waybill — just report
    // success so the queued mutation is cleared.
    if (collection.status === 'COLLECTED') {
      const existing = await this.prisma.waybill.findFirst({
        where: { companyId, senderName: collection.clientName, status: { not: 'DELIVERED' } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, trackingNumber: true, status: true },
      });
      return {
        success: true,
        alreadyConfirmed: true,
        collection: { id: collectionId, status: 'COLLECTED' },
        waybill: existing ? { id: existing.id, trackingNumber: existing.trackingNumber, status: existing.status } : null,
        message: 'Collection was already confirmed.',
      };
    }

    // 2. Mark as COLLECTED
    await this.prisma.collection.update({
      where: { id: collectionId },
      data: {
        status: 'COLLECTED',
        pickedUpAt: new Date(),
        notes: body.notes ? `${collection.notes ?? ''}\nDriver: ${body.notes}`.trim() : collection.notes,
      },
    });

    // 3. Auto-create a Waybill from the collection data.
    //    IMPORTANT (chain of custody): a freshly-collected parcel is NOT yet
    //    "in transit". It becomes COLLECTED and must be RECEIVED at the depot
    //    (warehouse clerk check-in → AT_ORIGIN_HUB) before it can be loaded
    //    onto a linehaul or sent out for local delivery. We no longer jump it
    //    straight to IN_TRANSIT and auto-assign a final-mile driver, because
    //    that bypassed the depot + linehaul steps of real freight procedure.
    const trackingNumber = `FO${Date.now().toString().slice(-8)}`;
    const waybill = await this.prisma.waybill.create({
      data: {
        trackingNumber,
        companyId,
        status: 'COLLECTED',
        senderName: collection.clientName,
        senderPhone: collection.clientPhone,
        senderAddress: collection.pickupAddress,
        recipientName: collection.clientName, // same client — dispatch sets the real recipient on dispatch
        recipientPhone: collection.clientPhone,
        recipientAddress: collection.pickupAddress, // placeholder until dispatch sets delivery address
        weight: 0,
        totalAmount: 0,
        description: `Collection pickup — ${body.parcelCount ?? 1} parcel(s). ${body.notes ?? ''}`.trim(),
      },
    });

    // 4. Create the Shipment record linking waybill ↔ collecting driver, but as
    //    PENDING (not auto-dispatched). The parcel is in the collecting driver's
    //    possession en route to the depot; the depot receive step + dispatch
    //    decide the onward leg. We keep the collecting driver on the shipment so
    //    the parcel's current custody is traceable.
    await this.prisma.shipment.create({
      data: {
        waybillId: waybill.id,
        companyId,
        driverId,
        status: 'PENDING',
      },
    });

    this.logger.log(`Collection ${collectionId} confirmed → Waybill ${trackingNumber} created as COLLECTED (awaiting depot receive) by driver ${driverId}`);

    // 5. Emit real-time update to dispatch board
    try {
      this.gateway.emitToCompany(companyId, 'collection-confirmed', {
        collectionId,
        waybillId: waybill.id,
        trackingNumber,
        driverId,
        status: 'COLLECTED',
        awaitingDepotReceive: true,
      });
    } catch { /* best-effort */ }

    return {
      success: true,
      collection: { id: collectionId, status: 'COLLECTED' },
      waybill: { id: waybill.id, trackingNumber, status: 'COLLECTED' },
      message: `Collected! Waybill ${trackingNumber} created. Take it to the depot to be received before it's loaded or delivered.`,
    };
  }

  async recordPod(body: {
    waybillId: string;
    driverId?: string;
    companyId?: string;
    signatureUrl?: string;
    imageUrl?: string;
    recipientName?: string;
    notes?: string;
  }) {
    // Chain of custody + tenant isolation: a driver may only POD a waybill that
    // belongs to their company AND is dispatched to them. Previously this
    // updated ANY waybill by client-supplied id → any driver could mark any
    // tenant's parcel DELIVERED. driverId/companyId come from the driver token.
    const waybill = await this.prisma.waybill.findFirst({
      where: {
        id: body.waybillId,
        ...(body.companyId ? { companyId: body.companyId } : {}),
        ...(body.driverId ? { shipments: { some: { driverId: body.driverId } } } : {}),
      },
      select: { id: true },
    });
    if (!waybill) {
      throw new NotFoundException('Waybill not found or not assigned to you');
    }

    const updated = await this.prisma.waybill.update({
      where: { id: body.waybillId },
      data: {
        status: 'DELIVERED',
        podSignatureUrl: body.signatureUrl,
        podImageUrl: body.imageUrl,
        podRecipient: body.recipientName,
      },
    });

    // ── Update the linked Shipment to DELIVERED ─────────────────────────
    // The Shipment model has its own status field. Without this update, the
    // Shipments page keeps showing IN_TRANSIT even after POD is captured.
    await this.prisma.shipment.updateMany({
      where: { waybillId: body.waybillId },
      data: { status: 'DELIVERED', deliveredAt: new Date() },
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

  /**
   * Tenant-scoped chat read for the DISPATCH side. Dispatch users may only read
   * the thread of a driver in THEIR company (the driverId is a route param, so
   * without this scope a tenant could read another tenant's driver chat).
   */
  async getMessagesForCompany(driverId: string, companyId: string, limit = 50, skip = 0) {
    return this.prisma.driverChatMessage.findMany({
      where: { driverId, companyId },
      orderBy: { createdAt: 'asc' },
      take: limit,
      skip,
    });
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

  /** Dispatch sends a message to a specific driver, scoped to the tenant. */
  async dispatchSend(driverId: string, companyId: string, message: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, companyId, isActive: true },
      select: { id: true },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    return this.prisma.driverChatMessage.create({
      data: { driverId: driver.id, companyId, message, senderType: 'dispatch' },
    });
  }
}
