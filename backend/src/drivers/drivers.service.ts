import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DriversService {
  private readonly logger = new Logger('DriversService');

  constructor(private prisma: PrismaService) {}

  async findAll(companyId: number) {
    return this.prisma.driver.findMany({
      where: {
        companyId,
      },
      include: {
        _count: {
          select: { waybills: true }, // Assuming the relation is named 'waybills'
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(companyId: number, data: any) {
    if (!data?.name?.trim()) {
      throw new BadRequestException('Driver name is required');
    }
    if (!data?.phone?.trim()) {
      throw new BadRequestException('Driver phone number is required');
    }

    try {
      const driver = await this.prisma.driver.create({
        data: {
          name: data.name.trim(),
          phone: data.phone.trim(),
          email: data.email?.trim() || null,
          vehicleReg: data.vehicleReg?.trim() || null,
          vehicleType: data.vehicleType?.trim() || null,
          zone: data.zone?.trim() || null,
          pin: data.pin?.trim() || null,
          whatsappOptIn: Boolean(data.whatsappOptIn),
          status: 'AVAILABLE',
          availabilityStatus: 'AVAILABLE',
          companyId,
        },
      });
      this.logger.log(`Created driver "${driver.name}" (ID: ${driver.id}) for company ${companyId}`);
      return driver;
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new BadRequestException('A driver with this phone number already exists');
      }
      this.logger.error(`Failed to create driver: ${err?.message}`);
      throw new BadRequestException('Failed to create driver');
    }
  }

  async update(id: number, data: any) {
    return this.prisma.driver.update({
      where: { id },
      data,
    });
  }

  async remove(id: number, companyId: number) {
    const driver = await this.prisma.driver.findFirst({ where: { id, companyId } });
    if (!driver) throw new BadRequestException('Driver not found');
    await this.prisma.driver.delete({ where: { id } });
    return { success: true, message: 'Driver removed' };
  }
}
