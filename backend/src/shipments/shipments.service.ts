// backend/src/shipments/shipments.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ShipmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async getShipmentById(id: number) {
    return (this.prisma as any).shipment.findUnique({
      where: { id },
    });
  }

  async createShipment(data: any) {
    return (this.prisma as any).shipment.create({
      data: {
        ...data,
      },
    });
  }

  async updateShipment(id: number, data: any) {
    return (this.prisma as any).shipment.update({
      where: { id },
      data,
    });
  }

  async deleteShipment(id: number) {
    return (this.prisma as any).shipment.delete({
      where: { id },
    });
  }
}
