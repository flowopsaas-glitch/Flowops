import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SlaLeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get SLA leaderboard for a specific company
   */
  async getLeaderboard(companyId: number) {
    // Example: fetch collections for this company and order by createdAt descending
    return (this.prisma as any).collection.findMany({
      where: { companyId },
      orderBy: { id: 'desc' }, // Prisma requires a real column (use 'id' if 'createdAt' missing)
    });
  }
}