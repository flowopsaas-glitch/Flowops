import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DispatchChatService {
  constructor(private prisma: PrismaService) {}

  async getActiveDrivers(companyId: number) {
    return this.prisma.driver.findMany({
      where: {
        companyId,
        status: { in: ['ON_DUTY', 'EN_ROUTE', 'AVAILABLE'] },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        status: true,
        vehicleReg: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async getMessages(driverId: number, limit: number = 50) {
    return this.prisma.dispatchMessage.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async sendMessage(
    driverId: number,
    senderId: number,
    senderType: string,
    message: string,
    type: string = 'text',
  ) {
    return this.prisma.dispatchMessage.create({
      data: {
        driverId,
        senderId,
        senderType,
        message,
        type,
      },
    });
  }
}
