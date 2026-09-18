import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RateCardsService {
  constructor(private prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.rateCard.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
  }

  async create(companyId: string, dto: any) {
    return this.prisma.rateCard.create({ data: { ...dto, companyId } });
  }

  async update(id: string, companyId: string, dto: any) {
    // Tenant-scoped: only the owning company may edit its rate card.
    const res = await this.prisma.rateCard.updateMany({ where: { id, companyId }, data: dto });
    if (res.count === 0) throw new NotFoundException('Rate card not found');
    return this.prisma.rateCard.findFirst({ where: { id, companyId } });
  }

  async remove(id: string, companyId: string) {
    const res = await this.prisma.rateCard.deleteMany({ where: { id, companyId } });
    if (res.count === 0) throw new NotFoundException('Rate card not found');
    return { deleted: true };
  }

  async calculate(companyId: string, dto: { fromZone?: string; toZone?: string; weight: number }) {
    const cards = await this.prisma.rateCard.findMany({
      where: {
        companyId,
        isActive: true,
        ...(dto.fromZone && { fromZone: dto.fromZone }),
        ...(dto.toZone && { toZone: dto.toZone }),
        OR: [
          { minWeight: null },
          { minWeight: { lte: dto.weight } },
        ],
      },
    });

    if (!cards.length) return { price: 0, rateCardId: null, message: 'No matching rate card' };

    const card = cards[0];
    const price = card.basePrice + (card.pricePerKg * dto.weight);
    return { price, rateCardId: card.id, breakdown: { base: card.basePrice, perKg: card.pricePerKg * dto.weight } };
  }
}
