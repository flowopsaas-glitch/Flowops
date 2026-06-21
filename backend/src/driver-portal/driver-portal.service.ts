import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DriverPortalService {
  constructor(private prisma: PrismaService) {}

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
    }));

    const deliveryJobs = shipments.map(s => {
      const wb = wbMap[s.waybillId] ?? {};
      return {
        id: s.id,
        type: 'delivery',
        status: s.status,
        trackingNumber: (wb as any).trackingNumber ?? s.id,
        recipientName: (wb as any).recipientName ?? 'Recipient',
        recipientPhone: (wb as any).recipientPhone,
        recipientAddress: (wb as any).recipientAddress,
        recipientLat: (wb as any).recipientLat ?? s.currentLat,
        recipientLng: (wb as any).recipientLng ?? s.currentLng,
        senderName: (wb as any).senderName,
        senderAddress: (wb as any).senderAddress,
        weight: (wb as any).weight,
        totalAmount: (wb as any).totalAmount,
        codAmount: (wb as any).codAmount,
        codCollected: (wb as any).codCollected,
        waybillId: s.waybillId,
        createdAt: s.createdAt,
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
    return this.prisma.waybill.update({
      where: { id: body.waybillId },
      data: {
        status: 'DELIVERED',
        podSignatureUrl: body.signatureUrl,
        podImageUrl: body.imageUrl,
        podRecipient: body.recipientName,
      },
    });
  }

  async getMessages(driverId: string, limit = 50, _skip = 0) {
    // Return empty array until a proper chat system is wired up.
    // The driver portal handles this gracefully and shows an empty chat.
    void driverId; void limit;
    return [];
  }
}
