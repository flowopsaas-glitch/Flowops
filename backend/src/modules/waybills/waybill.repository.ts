import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class WaybillRepository {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.waybill.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }
}
