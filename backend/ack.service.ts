import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionsGateway } from '../collections/collections.gateway';
import axios from 'axios';
import { CollectionStatus } from '@prisma/client'; // Prisma enum

@Injectable()
export class AckService {
  private allowedTransitions = {
    pending: [CollectionStatus.ACKNOWLEDGED, CollectionStatus.CANCELLED],
    acknowledged: [CollectionStatus.PICKED_UP],
    pickedUp: [CollectionStatus.DELIVERED],
  };

  constructor(
    private prisma: PrismaService,
    private collectionsGateway: CollectionsGateway,
  ) {}

  /** Update collection status with enum-safe typing */
  async updateStatus(collectionId: string, newStatus: CollectionStatus) {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });
    if (!collection) return null;

    const allowed = this.allowedTransitions[collection.status];
    if (!allowed || !allowed.includes(newStatus)) return null;

    return this.prisma.collection.update({
      where: { id: collectionId },
      data: { status: newStatus },
    });
  }

  /** Notify driver via WhatsApp (replace URL with your WhatsApp API) */
  async notifyDriverWhatsApp(driverId: string, collectionId: string, status: CollectionStatus) {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver || !driver.phone) return;

    await axios.post('https://your-whatsapp-api/send', {
      to: driver.phone,
      message: `Collection ${collectionId} status updated to "${status}" ✅`,
    });
  }

  /** Programmatic method for webhook or other service calls */
  async markCollectionAcknowledged(collectionId: string) {
    const updated = await this.updateStatus(collectionId, CollectionStatus.ACKNOWLEDGED);
    if (!updated) return null;

    // Broadcast to company room
    this.collectionsGateway.broadcastCompanyUnlocked(updated.companyId);

    return updated;
  }
}
