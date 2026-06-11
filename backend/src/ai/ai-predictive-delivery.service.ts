import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

interface PredictionFactors {
  baseTravelTime: number;      // minutes based on distance
  trafficMultiplier: number;   // 1.0 - 2.0
  weatherImpact: number;       // 0 - 30 minutes
  driverPerformance: number;   // 0.8 - 1.2 multiplier
  timeOfDay: number;           // 0 - 20 minutes
  historicalAccuracy: number;  // 0 - 1
  distance: number;            // km
  stops: number;               // number of stops
}

interface PredictionResult {
  predictedEta: Date;
  confidence: number;
  estimatedMinutes: number;
  factors: PredictionFactors;
  explanation: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

@Injectable()
export class AiPredictiveDeliveryService {
  private readonly logger = new Logger(AiPredictiveDeliveryService.name);
  private readonly groqApiKey: string;
  private readonly weatherApiKey: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.groqApiKey = this.config.get<string>('GROQ_API_KEY') || '';
    this.weatherApiKey = this.config.get<string>('OPENWEATHER_API_KEY') || '';
  }

  /**
   * 🎯 Predict delivery time for a waybill
   */
  async predictDeliveryTime(waybillId: number, companyId: number): Promise<PredictionResult> {
    this.logger.log(`🔮 Predicting delivery time for waybill ${waybillId}`);

    const waybill = await this.prisma.waybill.findUnique({
      where: { id: waybillId },
      include: {
        driver: true,
      },
    });

    if (!waybill) {
      throw new Error('Waybill not found');
    }

    // 1. Calculate base travel time from distance
    const distance = waybill.distanceKm || await this.estimateDistance(waybill.origin || '', waybill.destination || '');
    const baseTravelTime = this.calculateBaseTravelTime(distance);

    // 2. Get traffic multiplier
    const trafficMultiplier = await this.getTrafficMultiplier(waybill.destination || '');

    // 3. Get weather impact
    const weatherImpact = await this.getWeatherImpact(waybill.destination || '');

    // 4. Get driver performance factor
    const driverPerformance = await this.getDriverPerformanceFactor(waybill.driverId || 0, companyId);

    // 5. Time of day impact
    const timeOfDay = this.getTimeOfDayImpact();

    // 6. Calculate total estimated minutes
    const estimatedMinutes = Math.round(
      (baseTravelTime * trafficMultiplier * driverPerformance) + weatherImpact + timeOfDay
    );

    // 7. Calculate confidence based on data quality
    const confidence = this.calculateConfidence(waybill, distance);

    // 8. Predicted ETA
    const predictedEta = new Date(Date.now() + estimatedMinutes * 60 * 1000);

    // 9. Risk level
    const riskLevel = this.calculateRiskLevel(confidence, estimatedMinutes, trafficMultiplier, weatherImpact);

    // 10. Generate explanation
    const explanation = this.generateExplanation({
      baseTravelTime,
      trafficMultiplier,
      weatherImpact,
      driverPerformance,
      timeOfDay,
      historicalAccuracy: confidence / 100,
      distance,
      stops: 1,
    });

    const factors: PredictionFactors = {
      baseTravelTime,
      trafficMultiplier,
      weatherImpact,
      driverPerformance,
      timeOfDay,
      historicalAccuracy: confidence / 100,
      distance,
      stops: 1,
    };

    // 11. Store prediction in database
    await this.prisma.waybill.update({
      where: { id: waybillId },
      data: {
        predictedEta,
        etaConfidence: confidence,
        etaFactors: factors as any,
        lastEtaUpdate: new Date(),
        originalEta: waybill.originalEta || predictedEta,
      },
    });

    this.logger.log(`🔮 Prediction: ${estimatedMinutes} min, ${confidence}% confidence, ETA: ${predictedEta.toISOString()}`);

    return {
      predictedEta,
      confidence,
      estimatedMinutes,
      factors,
      explanation,
      riskLevel,
    };
  }

  /**
   * 🔄 Update prediction based on driver location
   */
  async updatePredictionWithLocation(waybillId: number, driverLat: number, driverLng: number): Promise<PredictionResult> {
    this.logger.log(`📍 Updating prediction for waybill ${waybillId} with driver location`);

    const waybill = await this.prisma.waybill.findUnique({
      where: { id: waybillId },
    });

    if (!waybill) {
      throw new Error('Waybill not found');
    }

    // Calculate remaining distance
    const remainingDistance = await this.calculateRemainingDistance(
      driverLat, driverLng,
      waybill.destination || ''
    );

    // Recalculate with remaining distance
    const baseTravelTime = this.calculateBaseTravelTime(remainingDistance);
    const trafficMultiplier = await this.getTrafficMultiplier(waybill.destination || '');
    const weatherImpact = await this.getWeatherImpact(waybill.destination || '');
    const driverPerformance = await this.getDriverPerformanceFactor(waybill.driverId || 0, waybill.companyId);
    const timeOfDay = this.getTimeOfDayImpact();

    const estimatedMinutes = Math.round(
      (baseTravelTime * trafficMultiplier * driverPerformance) + weatherImpact + timeOfDay
    );

    const confidence = Math.min(95, ((waybill.etaConfidence || 70) + 10)); // Increase confidence as driver gets closer
    const predictedEta = new Date(Date.now() + estimatedMinutes * 60 * 1000);
    const riskLevel = this.calculateRiskLevel(confidence, estimatedMinutes, trafficMultiplier, weatherImpact);

    const factors: PredictionFactors = {
      baseTravelTime,
      trafficMultiplier,
      weatherImpact,
      driverPerformance,
      timeOfDay,
      historicalAccuracy: confidence / 100,
      distance: remainingDistance,
      stops: 1,
    };

    const explanation = this.generateExplanation(factors);

    // Update database
    await this.prisma.waybill.update({
      where: { id: waybillId },
      data: {
        predictedEta,
        etaConfidence: confidence,
        etaFactors: factors as any,
        lastEtaUpdate: new Date(),
      },
    });

    return {
      predictedEta,
      confidence,
      estimatedMinutes,
      factors,
      explanation,
      riskLevel,
    };
  }

  /**
   * 📊 Get prediction accuracy metrics
   */
  async getPredictionAccuracy(companyId: number, days: number = 30): Promise<any> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const deliveredWaybills = await this.prisma.waybill.findMany({
      where: {
        companyId,
        status: 'DELIVERED',
        deliveredAt: { gte: since },
        predictedEta: { not: null },
      },
      select: {
        predictedEta: true,
        deliveredAt: true,
        etaConfidence: true,
      },
    });

    if (deliveredWaybills.length === 0) {
      return {
        totalPredictions: 0,
        averageAccuracy: 0,
        onTimeRate: 0,
        earlyRate: 0,
        lateRate: 0,
        averageDeviation: 0,
      };
    }

    let totalDeviation = 0;
    let onTime = 0;
    let early = 0;
    let late = 0;

    for (const wb of deliveredWaybills) {
      if (wb.predictedEta && wb.deliveredAt) {
        const deviation = Math.abs(
          (wb.deliveredAt.getTime() - wb.predictedEta.getTime()) / (60 * 1000)
        );
        totalDeviation += deviation;

        const diffMinutes = (wb.deliveredAt.getTime() - wb.predictedEta.getTime()) / (60 * 1000);
        if (Math.abs(diffMinutes) <= 15) onTime++;
        else if (diffMinutes < 0) early++;
        else late++;
      }
    }

    const avgDeviation = totalDeviation / deliveredWaybills.length;
    const accuracy = Math.max(0, 100 - (avgDeviation / 2)); // Rough accuracy calculation

    return {
      totalPredictions: deliveredWaybills.length,
      averageAccuracy: Math.round(accuracy),
      onTimeRate: Math.round((onTime / deliveredWaybills.length) * 100),
      earlyRate: Math.round((early / deliveredWaybills.length) * 100),
      lateRate: Math.round((late / deliveredWaybills.length) * 100),
      averageDeviation: Math.round(avgDeviation),
    };
  }

  // ========================================
  // PRIVATE HELPER METHODS
  // ========================================

  private calculateBaseTravelTime(distanceKm: number): number {
    // Average speed in urban SA: 40 km/h (considering stops, traffic lights)
    const averageSpeedKmh = 40;
    return (distanceKm / averageSpeedKmh) * 60; // Convert to minutes
  }

  private async estimateDistance(origin: string, destination: string): Promise<number> {
    // Simple distance estimation based on city names
    // In production, use Google Maps API or similar
    const cityDistances: Record<string, Record<string, number>> = {
      'johannesburg': { 'pretoria': 60, 'cape town': 1400, 'durban': 600 },
      'pretoria': { 'johannesburg': 60, 'cape town': 1400, 'durban': 650 },
      'cape town': { 'johannesburg': 1400, 'pretoria': 1400, 'durban': 1500 },
      'durban': { 'johannesburg': 600, 'pretoria': 650, 'cape town': 1500 },
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

    // Default estimate: 50km
    return 50;
  }

  private async getTrafficMultiplier(destination: string): Promise<number> {
    const hour = new Date().getHours();
    
    // Peak hours in SA: 7-9 AM and 4-6 PM
    if ((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 18)) {
      return 1.5; // 50% longer during peak hours
    }
    
    // Moderate traffic
    if ((hour >= 10 && hour <= 15) || (hour >= 19 && hour <= 21)) {
      return 1.2;
    }
    
    // Light traffic
    return 1.0;
  }

  private async getWeatherImpact(destination: string): Promise<number> {
    if (!this.weatherApiKey) {
      return 0; // No weather data available
    }

    try {
      // In production, call OpenWeatherMap API
      // For now, return 0 (no weather impact)
      return 0;
    } catch (error: any) {
      this.logger.warn(`Weather API failed: ${error.message}`);
      return 0;
    }
  }

  private async getDriverPerformanceFactor(driverId: number, companyId: number): Promise<number> {
    if (!driverId) return 1.0;

    // Get driver's historical delivery performance
    const recentDeliveries = await this.prisma.waybill.findMany({
      where: {
        driverId,
        companyId,
        status: 'DELIVERED',
        deliveredAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
      },
      select: {
        predictedEta: true,
        deliveredAt: true,
      },
    });

    if (recentDeliveries.length < 5) {
      return 1.0; // Not enough data, use default
    }

    // Calculate average performance
    let totalDeviation = 0;
    for (const delivery of recentDeliveries) {
      if (delivery.predictedEta && delivery.deliveredAt) {
        const deviation = (delivery.deliveredAt.getTime() - delivery.predictedEta.getTime()) / (60 * 1000);
        totalDeviation += deviation;
      }
    }

    const avgDeviation = totalDeviation / recentDeliveries.length;
    
    // Adjust factor: positive = slower than predicted, negative = faster
    if (avgDeviation > 15) return 1.2;  // 20% slower
    if (avgDeviation > 5) return 1.1;   // 10% slower
    if (avgDeviation < -15) return 0.85; // 15% faster
    if (avgDeviation < -5) return 0.95;  // 5% faster
    
    return 1.0; // On average, on time
  }

  private getTimeOfDayImpact(): number {
    const hour = new Date().getHours();
    
    // Night deliveries take longer (reduced visibility, fatigue)
    if (hour >= 20 || hour <= 5) {
      return 15; // Add 15 minutes
    }
    
    return 0;
  }

  private calculateConfidence(waybill: any, distance: number): number {
    let confidence = 70; // Base confidence

    // Increase confidence with more data
    if (waybill.driverId) confidence += 10;
    if (waybill.origin && waybill.destination) confidence += 5;
    if (distance > 0) confidence += 5;

    // Cap at 95%
    return Math.min(95, confidence);
  }

  private calculateRiskLevel(confidence: number, minutes: number, traffic: number, weather: number): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (confidence < 60 || traffic > 1.5 || weather > 20) {
      return 'HIGH';
    }
    if (confidence < 75 || traffic > 1.2 || weather > 10) {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  private generateExplanation(factors: PredictionFactors): string[] {
    const explanation: string[] = [];

    explanation.push(`📏 Base travel time: ${Math.round(factors.baseTravelTime)} min (${factors.distance}km)`);

    if (factors.trafficMultiplier > 1.0) {
      explanation.push(`🚗 Traffic impact: +${Math.round((factors.trafficMultiplier - 1) * 100)}% (current conditions)`);
    }

    if (factors.weatherImpact > 0) {
      explanation.push(`🌧️ Weather impact: +${factors.weatherImpact} min`);
    }

    if (factors.driverPerformance !== 1.0) {
      const diff = Math.round((factors.driverPerformance - 1) * 100);
      if (diff > 0) {
        explanation.push(`👤 Driver tends to be ${diff}% slower than average`);
      } else {
        explanation.push(`👤 Driver tends to be ${Math.abs(diff)}% faster than average`);
      }
    }

    if (factors.timeOfDay > 0) {
      explanation.push(`🌙 Night delivery: +${factors.timeOfDay} min`);
    }

    explanation.push(`🎯 Confidence: ${Math.round(factors.historicalAccuracy * 100)}%`);

    return explanation;
  }

  private async calculateRemainingDistance(driverLat: number, driverLng: number, destination: string): Promise<number> {
    // In production, use Google Maps Distance Matrix API
    // For now, estimate based on simple calculation
    // Default: 25km remaining
    return 25;
  }
}
