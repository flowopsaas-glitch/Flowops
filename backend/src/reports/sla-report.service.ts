// File: src/reports/sla-report.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SlaReportService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllCollections() {
    return (this.prisma as any).collection.findMany();
  }
}
