import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
    // `weight` arrives on an untyped body. Left unvalidated it reached Prisma as
    // `lte: undefined`, which Prisma drops — turning the filter into
    // "every active card" and pricing the job off whichever row came back first.
    const raw: unknown = dto?.weight;
    const weight = Number(typeof raw === 'string' ? raw.trim() : raw);
    const blank = raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '');
    if (blank || !Number.isFinite(weight) || weight < 0) {
      throw new BadRequestException('weight must be a non-negative number');
    }

    const cards = await this.prisma.rateCard.findMany({
      where: {
        companyId,
        isActive: true,
        ...(dto.fromZone && { fromZone: dto.fromZone }),
        ...(dto.toZone && { toZone: dto.toZone }),
        AND: [
          { OR: [{ minWeight: null }, { minWeight: { lte: weight } }] },
          // The upper bound was missing entirely. A 500 kg consignment matched a
          // 0-5 kg parcel card, because only `minWeight <= weight` was checked.
          { OR: [{ maxWeight: null }, { maxWeight: { gte: weight } }] },
        ],
      },
    });

    if (!cards.length) return { price: 0, rateCardId: null, message: 'No matching rate card' };

    // Ranked rather than `cards[0]`: row order from the database is not a
    // contract. Narrowest band wins — highest floor, then lowest ceiling — so
    // an overlapping specific card beats a generic catch-all.
    const card = [...cards].sort(
      (a, b) =>
        (b.minWeight ?? -Infinity) - (a.minWeight ?? -Infinity) ||
        (a.maxWeight ?? Infinity) - (b.maxWeight ?? Infinity) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    )[0];

    const price = card.basePrice + card.pricePerKg * weight;
    return {
      price,
      rateCardId: card.id,
      breakdown: { base: card.basePrice, perKg: card.pricePerKg * weight },
    };
  }
}
