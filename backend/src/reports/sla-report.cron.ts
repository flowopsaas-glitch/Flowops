import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SlaReportCron {
  constructor(private readonly prisma: PrismaService) {}

  async generateReport() {
    // Only uses existing fields
    const companies = await (this.prisma as any).company.findMany({
      select: {
        id: true,
        name: true,
        
      },
    });

    // Placeholder: iterate companies
    for (const company of companies) {
      console.log(`Generating report for ${company.name}`);
    }

    return companies;
  }
}
