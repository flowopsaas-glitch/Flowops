import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);
  constructor(private prisma: PrismaService) {}

  async calculateWaybillPrice(companyId: number, weight: number, distance: number) {
    const rateCard = await this.prisma.rateCard.findFirst({
      where: { companyId: Number(companyId), isActive: true },
    });

    if (!rateCard) return 0;

    const base = Number(rateCard.baseFee || 0);
    const distanceCost = Number(rateCard.perKm || 0) * distance;
    const weightCost = Number(rateCard.perKg || 0) * weight;
    
    const subtotal = base + distanceCost + weightCost;
    
    // 🚀 FIXED: Changed // to / to prevent syntax error
    const fuelMultiplier = 1 + (Number(rateCard.fuelSurchargePercent || 0) / 100);

    const finalTotal = subtotal * fuelMultiplier;
    return parseFloat(finalTotal.toFixed(2));
  }
}
