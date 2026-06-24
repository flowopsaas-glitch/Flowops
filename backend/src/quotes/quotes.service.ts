import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QuotesService {
  constructor(private prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.quote.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async create(companyId: string, dto: { fromAddress: string; toAddress: string; weight: number; clientName?: string }) {
    // Simple pricing calculation — replace with rate-card lookup in production
    const basePrice = 80;
    const pricePerKg = 15;
    const price = basePrice + pricePerKg * (dto.weight || 1);

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    return this.prisma.quote.create({
      data: {
        fromAddress: dto.fromAddress,
        toAddress:   dto.toAddress,
        weight:      dto.weight,
        clientName:  dto.clientName ?? null,
        price,
        expiresAt,
        companyId,
        breakdown: { base: basePrice, perKg: pricePerKg * dto.weight, total: price },
      },
    });
  }

  async accept(id: string, companyId: string) {
    return this.prisma.quote.update({ where: { id }, data: { accepted: true } });
  }
}
