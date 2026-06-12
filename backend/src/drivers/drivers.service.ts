import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DriversService {
  constructor(private prisma: PrismaService) {}

  async findAll(companyId: string, query?: any) {
    const where: any = { companyId };
    if (query?.status) where.status = query.status;
    if (query?.branchId) where.branchId = query.branchId;
    return this.prisma.driver.findMany({ where, include: { branch: true }, orderBy: { name: 'asc' } });
  }

  async findOne(id: string, companyId: string) {
    const driver = await this.prisma.driver.findFirst({ where: { id, companyId } });
    if (!driver) throw new NotFoundException('Driver not found');
    return driver;
  }

  async create(companyId: string, dto: any) {
    return this.prisma.driver.create({ data: { ...dto, companyId } });
  }

  async update(id: string, companyId: string, dto: any) {
    await this.findOne(id, companyId);
    return this.prisma.driver.update({ where: { id }, data: dto });
  }

  async updateLocation(id: string, companyId: string, lat: number, lng: number) {
    return this.prisma.driver.update({
      where: { id },
      data: { lastLat: lat, lastLng: lng, lastSeen: new Date() },
    });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    return this.prisma.driver.update({ where: { id }, data: { isActive: false } });
  }
}
