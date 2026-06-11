// @ts-nocheck
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { RouteOptimizerService } from './route-optimizer.service';
import { DispatchStatus, WaybillStatus } from '@prisma/client';

@Injectable()
export class CollectionsService {
  private readonly logger = new Logger(CollectionsService.name);

  constructor(
    private prisma: PrismaService,
    private whatsapp: WhatsAppService,
    private routeOptimizer: RouteOptimizerService,
  ) {}

  async findAll(companyId: number) {
    return this.prisma.collection.findMany({
      where: { companyId: Number(companyId) },
      include: {
        dispatches: { include: { driver: true } },
        emailHubItems: true,
        company: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number, companyId: number) {
    const item = await this.prisma.collection.findFirst({ 
      where: { id: Number(id), companyId: Number(companyId) },
      include: { emailHubItems: true, dispatches: true }
    });
    if (!item) throw new NotFoundException('Collection not found');
    return item;
  }

  async assignDriver(id: number, driverId: number, companyId: number) {
    return this.prisma.$transaction(async (tx) => {
      const dispatch = await tx.dispatch.create({
        data: {
          collectionId: Number(id),
          driverId: Number(driverId),
          companyId: Number(companyId),
          status: DispatchStatus.ASSIGNED,
        },
        include: { collection: true, driver: true },
      });

      if (dispatch.driver?.phone) {
        const identifier = dispatch.collection?.referenceNo || `COL-${id}`;
        const msg = `📦 *NEW PICKUP:* ${identifier}\n📍 *Addr:* ${dispatch.collection?.collectionAddress || 'N/A'}`;
        // Ensure companyId is passed as number to WhatsApp service
        await this.whatsapp.sendMessage(dispatch.driver.phone, msg, Number(companyId));
      }
      return dispatch;
    });
  }

  async getSmartSuggestion(id: number, companyId: number) {
    const collection = await this.findOne(id, companyId);
    
    const availableDrivers = await this.prisma.driver.findMany({
      where: {
        companyId: Number(companyId),
        status: 'AVAILABLE', 
      },
      include: { _count: { select: { dispatches: true } } },
    });
    
    return this.routeOptimizer.suggestBestDriver(collection, availableDrivers);
  }

  async processPocCollection(data: any) {
    const companyId = Number(data.companyId);
    return this.prisma.$transaction(async (tx) => {
      const waybill = await tx.waybill.upsert({
        where: { waybillNumber: data.waybillNumber },
        update: {
          status: WaybillStatus.PENDING_COLLECTION,
          imageUrl: data.imageUrl,
          signatureUrl: data.signatureUrl,
          collectedAt: new Date(),
          recipient: data.recipientName,
          weightKg: data.weight,
        },
        create: {
          waybillNumber: data.waybillNumber,
          status: WaybillStatus.PENDING_COLLECTION,
          recipient: data.recipientName,
          weightKg: data.weight || 0,
          companyId: companyId,
        },
      });

      const collection = await tx.collection.create({
        data: {
          referenceNo: data.waybillNumber,
          collectionAddress: data.notes || `Lat: ${data.collectionLat}, Lng: ${data.collectionLng}`,
          companyId: companyId,
        },
      });

      await tx.aiEvent.create({
        data: {
          title: `Waybill Collected: ${data.waybillNumber}`,
          summary: `Successful extraction via Driver App. Ready for automated billing audit.`,
          source: 'DRIVER_APP',
          type: 'COLLECTION',
          severity: 'LOW',
          initiator: 'CLAW_1',
          companyId: companyId,
          payload: { waybillId: waybill.id, collectionId: collection.id } as any
        },
      });

      return { success: true, waybill, collection };
    });
  }

  async confirmCollection(collectionId: number, companyId: number) {
    const collection = await this.prisma.collection.findFirst({ 
      where: { id: Number(collectionId), companyId: Number(companyId) } 
    });
    if (!collection) throw new NotFoundException(`Collection ${collectionId} not found`);
    
    if (collection.referenceNo) {
      await this.prisma.waybill.updateMany({
        where: { waybillNumber: collection.referenceNo, companyId: Number(companyId) },
        data: { status: WaybillStatus.IN_TRANSIT },
      });
    }
    return { success: true };
  }
}
