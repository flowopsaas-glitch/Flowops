import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DriverPortalService {
  constructor(private prisma: PrismaService) {}

  async generatePin(driverId: number): Promise<string> {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Driver not found');
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    await this.prisma.driver.update({
      where: { id: driverId },
      data: { pin, whatsappOptIn: true },
    });
    return pin;
  }

  async login(phone: string, pin: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { phone, pin },
      include: { company: true },
    });
    if (!driver) throw new UnauthorizedException('Invalid phone number or PIN');
    return {
      driverId: driver.id,
      name: driver.name,
      companyId: driver.companyId,
      vehicleReg: driver.vehicleReg,
    };
  }

  async getDeliveries(driverId: number) {
    return this.prisma.waybill.findMany({
      where: { OR: [{ driverId }, { status: 'PENDING' }] },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  async updateGps(driverId: number, lat: number, lng: number, speed?: number) {
    await this.prisma.driver.update({ where: { id: driverId }, data: { lat, lng } });
    await this.prisma.driverLocation.create({
      data: { driverId, latitude: lat, longitude: lng, speed: speed || 0, timestamp: new Date() },
    });
    return { success: true };
  }

  async uploadPod(driverId: number, waybillId: number, signatureData?: string, photoData?: string, recipientName?: string, notes?: string, source: string = 'PWA') {
    const waybill = await this.prisma.waybill.findUnique({ where: { id: waybillId } });
    if (!waybill) throw new BadRequestException('Waybill not found');
    const pod = await this.prisma.proofOfDelivery.create({
      data: { driverId, waybillId, signatureData, photoData, recipientName, notes, source },
    });
    const newStatus = waybill.status === 'PENDING' ? 'IN_TRANSIT' : 'DELIVERED';
    await this.prisma.waybill.update({ where: { id: waybillId }, data: { status: newStatus } });
    return { success: true, podId: pod.id, newStatus };
  }
}
