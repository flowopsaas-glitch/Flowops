// src/services/collection.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CollectionService {
  constructor(private readonly prisma: PrismaService) {}

  async listByCompany(companyId: number) {
    return (this.prisma as any).collection.findMany({
      where: { companyId },
      include: {
        company: true,
        createdBy: true,
        dispatches: true,
        acks: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(id: number) {
    return (this.prisma as any).collection.findUnique({
      where: { id },
      include: {
        company: true,
        createdBy: true,
        dispatches: true,
        acks: { include: { user: true } },
      },
    });
  }
}