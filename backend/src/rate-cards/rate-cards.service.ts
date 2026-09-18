import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { pickAllowed } from '../common/pick-allowed.util';

/** Client-writable RateCard fields (excludes id/companyId/timestamps). */
const RATE_CARD_FIELDS = [
  'name', 'fromZone', 'toZone', 'minWeight', 'maxWeight',
  'basePrice', 'pricePerKg', 'currency', 'isActive',
] as const;

@Injectable()
export class RateCardsService {
  constructor(private prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.rateCard.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
  }

  async create(companyId: string, dto: any) {
    // Allowlist client input — never let a client set id/companyId/timestamps.
    return this.prisma.rateCard.create({
      data: { ...pickAllowed(dto, RATE_CARD_FIELDS), companyId } as any,
    });
  }

  async update(id: string, companyId: string, dto: any) {
    // Tenant-scoped + allowlisted: only the owning company may edit, and only
    // whitelisted fields (no id/companyId/timestamp tampering).
    const res = await this.prisma.rateCard.updateMany({
      where: { id, companyId },
      data: pickAllowed(dto, RATE_CARD_FIELDS),
    });
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
