import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

interface PricingFactors {
  basePrice: number;           // ZAR
  distanceMultiplier: number;  // per km
  demandMultiplier: number;    // 0.8 - 2.0
  urgencyMultiplier: number;   // 1.0 - 1.5
  fuelSurcharge: number;       // ZAR
  timeOfDayMultiplier: number; // 0.9 - 1.3
  driverAvailability: number;  // 0.9 - 1.2
  routeComplexity: number;     // 1.0 - 1.3
  historicalAverage: number;   // ZAR
  confidence: number;          // 0-100
}

interface DynamicPrice {
  waybillId?: number;
  origin: string;
  destination: string;
  distanceKm: number;
  weight: number;
  finalPrice: number;
  breakdown: PricingFactors;
  explanation: string[];
  confidence: number;
  recommendedAt: Date;
  validUntil: Date;
}

@Injectable()
export class AiDynamicPricingService {
  private readonly logger = new Logger(AiDynamicPricingService.name);
  private readonly groqApiKey: string;
  
  // Base pricing constants (ZAR)
  private readonly BASE_PRICE = 50; // Minimum price
  private readonly PRICE_PER_KM = 8.50; // ZAR per km
  private readonly PRICE_PER_KG = 2.00; // ZAR per kg
  private readonly FUEL_PRICE_PER_LITER = 23.50;
  private readonly FUEL_CONSUMPTION_PER_100KM = 8; // liters

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.groqApiKey = this.config.get<string>('GROQ_API_KEY') || '';
  }

  /**
   * 🎯 Get pricing from RateCard (aligned with tenant's actual pricing)
   */
  private async getRateCardPricing(companyId: number): Promise<{
    baseFee: number;
    perKm: number;
    perKg: number;
    fuelSurchargePercent: number;
  }> {
    const rateCard = await this.prisma.rateCard.findFirst({
      where: { companyId, isActive: true },
    });

    // Fallback to market rates if no rate card
    return {
      baseFee: rateCard?.baseFee || 50,
      perKm: rateCard?.perKm || 8.50,
      perKg: rateCard?.perKg || 2.00,
      fuelSurchargePercent: rateCard?.fuelSurchargePercent || 0,
    };
  }

  /**
   * 💰 Calculate dynamic price for a delivery
   */
  async calculateDynamicPrice(params: {
    companyId: number;
    origin: string;
    destination: string;
    weight?: number;
    urgency?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    preferredDate?: Date;
  }): Promise<DynamicPrice> {
    this.logger.log(`💰 Calculating dynamic price: ${params.origin} → ${params.destination}`);

    const { companyId, origin, destination, weight = 1, urgency = 'MEDIUM' } = params;

    // 1. Calculate distance
    const distanceKm = await this.estimateDistance(origin, destination);

    // 2. Get tenant's actual pricing from RateCard
    const rateCardPricing = await this.getRateCardPricing(companyId);
    
    // 3. Base price calculation (using tenant's rates)
    const basePrice = this.calculateBasePrice(distanceKm, weight, rateCardPricing);

    // 3. Demand multiplier (based on current load)
    const demandMultiplier = await this.getDemandMultiplier(companyId);

    // 4. Urgency multiplier
    const urgencyMultiplier = this.getUrgencyMultiplier(urgency);

    // 5. Fuel surcharge
    const fuelSurcharge = this.calculateFuelSurcharge(distanceKm);

    // 6. Time of day multiplier
    const timeOfDayMultiplier = this.getTimeOfDayMultiplier(params.preferredDate);

    // 7. Driver availability
    const driverAvailability = await this.getDriverAvailabilityFactor(companyId);

    // 8. Route complexity
    const routeComplexity = this.getRouteComplexity(origin, destination);

    // 9. Historical average (for comparison)
    const historicalAverage = await this.getHistoricalAveragePrice(companyId, origin, destination);

    // 10. Calculate final price
    const finalPrice = Math.round(
      basePrice * demandMultiplier * urgencyMultiplier * timeOfDayMultiplier * 
      driverAvailability * routeComplexity + fuelSurcharge
    );

    // 11. Calculate confidence
    const confidence = this.calculateConfidence(distanceKm, historicalAverage, demandMultiplier);

    // 12. Generate explanation
    const explanation = this.generateExplanation({
      basePrice,
      distanceMultiplier: this.PRICE_PER_KM,
      demandMultiplier,
      urgencyMultiplier,
      fuelSurcharge,
      timeOfDayMultiplier,
      driverAvailability,
      routeComplexity,
      historicalAverage,
      confidence,
    });

    const breakdown: PricingFactors = {
      basePrice,
      distanceMultiplier: this.PRICE_PER_KM,
      demandMultiplier,
      urgencyMultiplier,
      fuelSurcharge,
      timeOfDayMultiplier,
      driverAvailability,
      routeComplexity,
      historicalAverage,
      confidence,
    };

    this.logger.log(`💰 Dynamic price: R${finalPrice} (${confidence}% confidence)`);

    return {
      origin,
      destination,
      distanceKm,
      weight,
      finalPrice,
      breakdown,
      explanation,
      confidence,
      recommendedAt: new Date(),
      validUntil: new Date(Date.now() + 30 * 60 * 1000), // Valid for 30 minutes
    };
  }

  /**
   * 📊 Get pricing analytics
   */
  async getPricingAnalytics(companyId: number, days: number = 30): Promise<any> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const waybills = await this.prisma.waybill.findMany({
      where: {
        companyId,
        createdAt: { gte: since },
        totalAmount: { not: null },
      },
      select: {
        totalAmount: true,
        distanceKm: true,
        origin: true,
        destination: true,
        createdAt: true,
      },
    });

    if (waybills.length === 0) {
      return {
        totalWaybills: 0,
        averagePrice: 0,
        pricePerKm: 0,
        revenue: 0,
        priceRange: { min: 0, max: 0 },
      };
    }

    const prices = waybills.map(wb => wb.totalAmount || 0);
    const totalRevenue = prices.reduce((sum, p) => sum + p, 0);
    const averagePrice = totalRevenue / waybills.length;
    const totalDistance = waybills.reduce((sum, wb) => sum + (wb.distanceKm || 0), 0);
    const pricePerKm = totalDistance > 0 ? totalRevenue / totalDistance : 0;

    return {
      totalWaybills: waybills.length,
      averagePrice: Math.round(averagePrice * 100) / 100,
      pricePerKm: Math.round(pricePerKm * 100) / 100,
      revenue: Math.round(totalRevenue * 100) / 100,
      priceRange: {
        min: Math.round(Math.min(...prices) * 100) / 100,
        max: Math.round(Math.max(...prices) * 100) / 100,
      },
      averageDistance: Math.round((totalDistance / waybills.length) * 10) / 10,
    };
  }

  /**
   * 🎯 Get price optimization recommendations
   */
  async getPriceRecommendations(companyId: number): Promise<any> {
    const analytics = await this.getPricingAnalytics(companyId, 30);
    
    const recommendations: string[] = [];

    // Analyze pricing patterns
    if (analytics.pricePerKm < 7) {
      recommendations.push('⚠️ Your price per km is below market average. Consider increasing base rates.');
    } else if (analytics.pricePerKm > 12) {
      recommendations.push('💡 Your price per km is above average. You may be losing customers to competitors.');
    }

    // Check demand patterns
    const recentWaybills = await this.prisma.waybill.count({
      where: {
        companyId,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    });

    if (recentWaybills < 10) {
      recommendations.push('📉 Low demand detected. Consider promotional pricing to attract more customers.');
    } else if (recentWaybills > 50) {
      recommendations.push('📈 High demand detected. You can increase prices by 10-15% without losing customers.');
    }

    return {
      analytics,
      recommendations,
      generatedAt: new Date(),
    };
  }

  // ========================================
  // PRIVATE HELPER METHODS
  // ========================================

  private calculateBasePrice(
    distanceKm: number, 
    weight: number,
    pricing?: { baseFee: number; perKm: number; perKg: number }
  ): number {
    const baseFee = pricing?.baseFee || this.BASE_PRICE;
    const perKm = pricing?.perKm || this.PRICE_PER_KM;
    const perKg = pricing?.perKg || this.PRICE_PER_KG;
    
    const distancePrice = distanceKm * perKm;
    const weightPrice = weight * perKg;
    return Math.max(baseFee, distancePrice + weightPrice);
  }

  private async estimateDistance(origin: string, destination: string): Promise<number> {
    // City distance matrix for SA
    const cityDistances: Record<string, Record<string, number>> = {
      'johannesburg': { 'pretoria': 60, 'cape town': 1400, 'durban': 600, 'port elizabeth': 1000 },
      'pretoria': { 'johannesburg': 60, 'cape town': 1400, 'durban': 650, 'port elizabeth': 1050 },
      'cape town': { 'johannesburg': 1400, 'pretoria': 1400, 'durban': 1500, 'port elizabeth': 750 },
      'durban': { 'johannesburg': 600, 'pretoria': 650, 'cape town': 1500, 'port elizabeth': 900 },
      'port elizabeth': { 'johannesburg': 1000, 'pretoria': 1050, 'cape town': 750, 'durban': 900 },
    };

    const originLower = origin.toLowerCase();
    const destLower = destination.toLowerCase();

    for (const [city1, distances] of Object.entries(cityDistances)) {
      if (originLower.includes(city1)) {
        for (const [city2, distance] of Object.entries(distances)) {
          if (destLower.includes(city2)) {
            return distance;
          }
        }
      }
    }

    // Default estimate
    return 50;
  }

  private async getDemandMultiplier(companyId: number): Promise<number> {
    // Check recent waybill volume
    const recentCount = await this.prisma.waybill.count({
      where: {
        companyId,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    // High demand: >20 waybills/day
    if (recentCount > 20) return 1.3;
    // Medium demand: 10-20 waybills/day
    if (recentCount > 10) return 1.1;
    // Low demand: <10 waybills/day
    if (recentCount < 5) return 0.9;
    
    return 1.0;
  }

  private getUrgencyMultiplier(urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'): number {
    switch (urgency) {
      case 'URGENT': return 1.5;
      case 'HIGH': return 1.3;
      case 'MEDIUM': return 1.1;
      case 'LOW': return 1.0;
      default: return 1.0;
    }
  }

  private calculateFuelSurcharge(distanceKm: number): number {
    const litersUsed = (distanceKm / 100) * this.FUEL_CONSUMPTION_PER_100KM;
    return litersUsed * this.FUEL_PRICE_PER_LITER * 0.1; // 10% of fuel cost as surcharge
  }

  private getTimeOfDayMultiplier(preferredDate?: Date): number {
    const hour = preferredDate ? preferredDate.getHours() : new Date().getHours();
    
    // Peak hours: 7-9 AM, 4-6 PM
    if ((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 18)) {
      return 1.2;
    }
    
    // Night hours: 10 PM - 5 AM
    if (hour >= 22 || hour <= 5) {
      return 1.3;
    }
    
    return 1.0;
  }

  private async getDriverAvailabilityFactor(companyId: number): Promise<number> {
    // Check how many drivers are available
    const activeDrivers = await this.prisma.user.count({
      where: {
        companyId,
        role: 'DRIVER',
      },
    });

    const busyDrivers = await this.prisma.waybill.count({
      where: {
        companyId,
        status: 'IN_TRANSIT',
      },
    });

    // If most drivers are busy, increase price
    if (activeDrivers > 0 && busyDrivers / activeDrivers > 0.8) {
      return 1.2;
    }
    
    return 1.0;
  }

  private getRouteComplexity(origin: string, destination: string): number {
    // Simple heuristic: cross-country routes are more complex
    const majorCities = ['johannesburg', 'pretoria', 'cape town', 'durban', 'port elizabeth'];
    
    const originLower = origin.toLowerCase();
    const destLower = destination.toLowerCase();
    
    const originIsMajor = majorCities.some(city => originLower.includes(city));
    const destIsMajor = majorCities.some(city => destLower.includes(city));
    
    // Cross-country route
    if (originIsMajor && destIsMajor && originLower !== destLower) {
      return 1.15;
    }
    
    return 1.0;
  }

  private async getHistoricalAveragePrice(companyId: number, origin: string, destination: string): Promise<number> {
    const similarWaybills = await this.prisma.waybill.findMany({
      where: {
        companyId,
        origin: { contains: origin, mode: 'insensitive' },
        destination: { contains: destination, mode: 'insensitive' },
        totalAmount: { not: null },
        createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      },
      select: { totalAmount: true },
      take: 10,
    });

    if (similarWaybills.length === 0) return 0;

    const avg = similarWaybills.reduce((sum, wb) => sum + (wb.totalAmount || 0), 0) / similarWaybills.length;
    return avg;
  }

  private calculateConfidence(distanceKm: number, historicalAvg: number, demandMultiplier: number): number {
    let confidence = 70;

    // More confidence with historical data
    if (historicalAvg > 0) confidence += 15;

    // More confidence with reasonable distance
    if (distanceKm > 0 && distanceKm < 2000) confidence += 10;

    // Less confidence with extreme demand
    if (demandMultiplier > 1.5 || demandMultiplier < 0.7) confidence -= 10;

    return Math.min(95, Math.max(50, confidence));
  }

  private generateExplanation(factors: PricingFactors): string[] {
    const explanation: string[] = [];

    explanation.push(`📏 Base price: R${factors.basePrice.toFixed(2)}`);
    explanation.push(`🛣️ Distance rate: R${factors.distanceMultiplier}/km`);

    if (factors.demandMultiplier !== 1.0) {
      const pct = Math.round((factors.demandMultiplier - 1) * 100);
      explanation.push(`📊 Demand adjustment: ${pct > 0 ? '+' : ''}${pct}%`);
    }

    if (factors.urgencyMultiplier !== 1.0) {
      const pct = Math.round((factors.urgencyMultiplier - 1) * 100);
      explanation.push(`⚡ Urgency surcharge: +${pct}%`);
    }

    if (factors.fuelSurcharge > 0) {
      explanation.push(`⛽ Fuel surcharge: R${factors.fuelSurcharge.toFixed(2)}`);
    }

    if (factors.timeOfDayMultiplier !== 1.0) {
      const pct = Math.round((factors.timeOfDayMultiplier - 1) * 100);
      explanation.push(`🕐 Time adjustment: ${pct > 0 ? '+' : ''}${pct}%`);
    }

    if (factors.historicalAverage > 0) {
      explanation.push(`📈 Historical average: R${factors.historicalAverage.toFixed(2)}`);
    }

    explanation.push(`🎯 Confidence: ${factors.confidence}%`);

    return explanation;
  }
}
