// File: src/approvals/approvals.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionStatus } from '@prisma/client';

@Injectable()
export class ApprovalsService {
  constructor(private readonly prisma: PrismaService) {}

  async approveCollection(id: string) {
    return this.prisma.collection.update({
      where: { id },
      data: { status: CollectionStatus.APPROVED },
    });
  }

  async getAllPending() {
    return this.prisma.collection.findMany({
      where: { status: CollectionStatus.PENDING },
    });
  }
}
