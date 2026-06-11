import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DriversService {
  constructor(private prisma: PrismaService) {}

  async findAll(companyId: number) {
    return this.prisma.driver.findMany({
      where: { 
        companyId,
        // We fetch everyone, but the frontend will badge them based on status
      },
      include: {
        _count: {
          select: { waybills: true } // Assuming the relation is named 'waybills'
        }
      }
    });
  }

  async update(id: number, data: any) {
    return this.prisma.driver.update({
      where: { id },
      data,
    });
  }
}
