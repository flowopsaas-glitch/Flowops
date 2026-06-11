import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RatingService {
  constructor(private prisma: PrismaService) {}

  async calculateAndSaveRate(waybillId: number): Promise<any> {
    const waybill = await this.prisma.waybill.findUnique({
      where: { id: waybillId },
      include: { company: true, originBranch: true, destinationBranch: true },
    });

    if (!waybill || !waybill.company) return null;

    // 1. Get the active RateCard for this company
    const rateCard = await this.prisma.rateCard.findFirst({
      where: { companyId: waybill.companyId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!rateCard) return { message: 'No active rate card found' };

    // 2. Calculate Volumetric Weight (L x W x H / 5000)
    let volumetricWeight = 0;
    if (waybill.dimensions) {
      const parts = waybill.dimensions.split('x').map(Number);
      if (parts.length === 3) {
        volumetricWeight = (parts[0] * parts[1] * parts[2]) / 5000;
      }
    }

    // 3. Determine Chargeable Weight (Max of Actual vs Volumetric)
    const actualWeight = waybill.weightKg || waybill.weight || 0;
    const chargeableWeight = Math.max(actualWeight, volumetricWeight);

    // 4. Calculate Base Cost
    let totalCost = rateCard.baseFee;
    totalCost += chargeableWeight * rateCard.perKg;

    // Add distance cost if available
    if (waybill.distanceKm && rateCard.perKm) {
      totalCost += waybill.distanceKm * rateCard.perKm;
    }

    // 5. Apply Fuel Surcharge
    const fuelSurcharge = totalCost * (rateCard.fuelSurchargePercent / 100);
    totalCost += fuelSurcharge;

    // 6. Enforce Min/Max Charges
    if (rateCard.minCharge && totalCost < rateCard.minCharge) totalCost = rateCard.minCharge;
    if (rateCard.maxCharge && totalCost > rateCard.maxCharge) totalCost = rateCard.maxCharge;

    // 7. Save the calculated amount back to the Waybill
    await this.prisma.waybill.update({
      where: { id: waybillId },
      data: {
        totalAmount: totalCost,
        amount: totalCost,
      },
    });

    return {
      waybillId,
      chargeableWeight,
      baseFee: rateCard.baseFee,
      fuelSurcharge,
      totalCost,
      rateCardName: rateCard.name,
    };
  }
}
