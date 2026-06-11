import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QuotesService {
  constructor(private prisma: PrismaService) {}

  async approveQuote(id: number, user?: any) {
    return (this.prisma as any).quoteSuggestion.update({
      where: { id },
      data: {
        status: 'APPROVED'
      },
    });
  }

  async rejectQuote(id: number, reason?: string, user?: any) {
    return (this.prisma as any).quoteSuggestion.update({
      where: { id },
      data: {
        status: 'REJECTED'
      },
    });
  }
}
