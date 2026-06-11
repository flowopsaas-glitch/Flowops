// @ts-nocheck
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service'; // Adjust path to your PrismaService

@Injectable()
export class HardwareService {
  constructor(private prisma: PrismaService) {}

  /**
   * Fetches all hardware nodes registered to a specific company.
   */
  async listTenantHardware(companyId: string) {
    return this.prisma.hardware.findMany({
      where: { companyId: Number(companyId) },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Registers or updates a device in the company's hardware mesh.
   */
  async autoRegisterDevice(companyId: string, data: any) {
    return this.prisma.hardware.upsert({
      where: {
        // This ensures we don't create duplicate entries for the same physical device
        id: `${companyId}-${data.vendorId}-${data.productId}-${data.serialNumber}`,
      },
      update: {
        name: data.name,
        status: 'ONLINE',
        updatedAt: new Date(),
      },
      create: {
        id: `${companyId}-${data.vendorId}-${data.productId}-${data.serialNumber}`,
        name: data.name,
        deviceType: data.deviceType,
        vendorId: data.vendorId,
        productId: data.productId,
        serialNumber: data.serialNumber,
        companyId: Number(companyId),
      },
    });
  }
}
