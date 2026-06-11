import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WarehouseClerkService {
  private readonly logger = new Logger(WarehouseClerkService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getWarehouseOverview(warehouseId: number, companyId: number) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, companyId },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const [totalParcels, pendingPickup, pendingCollection, todayIn, todayOut] = await Promise.all([
      this.prisma.waybill.count({
        where: { warehouseId, status: { in: ['RECEIVED', 'IN_WAREHOUSE'] as any } },
      }),
      this.prisma.waybill.count({
        where: { warehouseId, status: 'RECEIVED' as any },
      }),
      this.prisma.waybill.count({
        where: { warehouseId, status: 'READY_FOR_COLLECTION' as any },
      }),
      this.prisma.waybill.count({
        where: {
          warehouseId,
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
          status: { in: ['RECEIVED', 'IN_WAREHOUSE'] as any },
        },
      }),
      this.prisma.waybill.count({
        where: {
          warehouseId,
          updatedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
          status: { in: ['DELIVERED', 'COLLECTED'] as any },
        },
      }),
    ]);

    return {
      warehouse,
      stats: { totalParcels, pendingPickup, pendingCollection, todayIn, todayOut },
    };
  }

  async checkInParcel(data: any) {
    this.logger.log(`📦 Checking in parcel at warehouse ${data.warehouseId}`);

    const waybillNumber = data.waybillNumber || 
      `WH-${data.warehouseId}-${Date.now().toString().slice(-8)}`;

    const existing = await this.prisma.waybill.findUnique({ where: { waybillNumber } });
    if (existing) throw new BadRequestException(`Waybill ${waybillNumber} already exists`);

    const waybill = await this.prisma.waybill.create({
      data: {
        waybillNumber,
        companyId: data.companyId,
        warehouseId: data.warehouseId,
        storageLocation: data.storageLocation,
        senderName: data.senderName,
        senderPhone: data.senderPhone,
        receiverName: data.receiverName,
        receiverPhone: data.receiverPhone,
        destination: data.destination,
        notes: data.description,
        weight: data.weight,
        status: 'RECEIVED' as any,
        signatureData: data.signatureData,
        signatureCapturedAt: new Date(),
        signatureCapturedBy: data.clerkId.toString(),
      },
    });

    this.logger.log(`✅ Parcel ${waybillNumber} checked in`);
    return { success: true, waybill, message: `Parcel ${waybillNumber} received` };
  }

  async checkOutParcel(data: any) {
    this.logger.log(`📤 Checking out waybill ${data.waybillId}`);

    const waybill = await this.prisma.waybill.findFirst({
      where: { id: data.waybillId, warehouseId: data.warehouseId, companyId: data.companyId },
    });

    if (!waybill) throw new NotFoundException('Waybill not found');
    if (waybill.status === 'DELIVERED' || waybill.status === 'COLLECTED') {
      throw new BadRequestException('Waybill already collected');
    }

    const updated = await this.prisma.waybill.update({
      where: { id: data.waybillId },
      data: {
        status: 'COLLECTED' as any,
        deliveredAt: new Date(),
        signatureData: data.signatureData,
        signatureCapturedAt: new Date(),
        signatureCapturedBy: data.clerkId.toString(),
      },
    });

    this.logger.log(`✅ Waybill ${waybill.waybillNumber} collected`);
    return { success: true, waybill: updated, message: `Parcel collected by ${data.collectorName}` };
  }

  async searchParcels(warehouseId: number, companyId: number, query: string) {
    const where: any = { warehouseId, companyId };
    if (query) {
      where.OR = [
        { waybillNumber: { contains: query, mode: 'insensitive' } },
        { senderName: { contains: query, mode: 'insensitive' } },
        { receiverName: { contains: query, mode: 'insensitive' } },
        { senderPhone: { contains: query } },
        { receiverPhone: { contains: query } },
      ];
    }
    return this.prisma.waybill.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 50 });
  }

  async getParcelsForCollection(warehouseId: number, companyId: number) {
    return this.prisma.waybill.findMany({
      where: { warehouseId, companyId, status: 'READY_FOR_COLLECTION' as any },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getRecentParcels(warehouseId: number, companyId: number, limit = 20) {
    return this.prisma.waybill.findMany({
      where: { warehouseId, companyId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
