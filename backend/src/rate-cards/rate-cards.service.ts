import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RateCardsService {
  private readonly logger = new Logger(RateCardsService.name);
  constructor(private prisma: PrismaService) {}

  private rateCardDelegate() {
    const delegate = (this.prisma as any).rateCard;
    if (!delegate) {
      this.logger.warn(
        'Prisma delegate "rateCard" is unavailable (schema/client mismatch). Returning safe fallback.',
      );
      return null;
    }
    return delegate;
  }

  async create(dto: any) {
    const rateCard = this.rateCardDelegate();
    if (!rateCard) return { ok: false, message: 'Rate cards are not configured in this deployment.' };

    return rateCard.create({
      data: {
        name: dto.name || 'Standard Rates',
        companyId: dto.companyId,
        baseFee: Number(dto.baseFee) || 0,
        perKm: Number(dto.perKm) || 0,
        perKg: Number(dto.perKg) || 0,
        fuelSurchargePercent: Number(dto.fuelSurchargePercent) || 0,
        vatPercent: Number(dto.vatPercent) || 15,
        targetMarginPercent: Number(dto.targetMarginPercent) || 20,
        isActive: true,
      },
      include: { company: true }
    });
  }

  async findAll() {
    const rateCard = this.rateCardDelegate();
    if (!rateCard) return [];

    return rateCard.findMany({
      include: { company: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }
    });
  }

  async findOne(id: string) {
    const rateCard = this.rateCardDelegate();
    if (!rateCard) throw new NotFoundException('Rate card not found');

    const card = await rateCard.findUnique({
      where: { id },
      include: { company: true }
    });
    if (!card) throw new NotFoundException('Rate card not found');
    return card;
  }

  async update(id: string, dto: any) {
    const rateCard = this.rateCardDelegate();
    if (!rateCard) throw new NotFoundException('Rate card not found');

    return rateCard.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.baseFee !== undefined && { baseFee: Number(dto.baseFee) }),
        ...(dto.perKm !== undefined && { perKm: Number(dto.perKm) }),
        ...(dto.perKg !== undefined && { perKg: Number(dto.perKg) }),
        ...(dto.fuelSurchargePercent !== undefined && { fuelSurchargePercent: Number(dto.fuelSurchargePercent) }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      }
    });
  }

  async remove(id: string) {
    const rateCard = this.rateCardDelegate();
    if (!rateCard) throw new NotFoundException('Rate card not found');
    return rateCard.delete({ where: { id } });
  }
}
