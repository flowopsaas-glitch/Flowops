// src/ai/features/delay-predictor.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WaybillStatus } from '@prisma/client';

export interface DelayPrediction {
  waybillId: number;
  waybillNumber: string;
  predictedDelayMinutes: number;
  confidence: 'low' | 'medium' | 'high';
  reason: string;
  suggestedAction: string;
}

@Injectable()
export class DelayPredictorService {
  private readonly logger = new Logger(DelayPredictorService.name);
  
  // Historical averages by route (in minutes) - would be ML model in production
  private readonly routeAverages: Record<string, number> = {
    'Johannesburg:Cape Town': 720,    // 12 hours
    'Johannesburg:Durban': 480,       // 8 hours
    'Cape Town:Durban': 900,          // 15 hours
    'Pretoria:Port Elizabeth': 600,   // 10 hours
    // Add more routes as data accumulates
  };

  constructor(private prisma: PrismaService) {}

  /**
   * Predict delays for in-transit waybills
   */
  async predictDelays(companyId: number): Promise<DelayPrediction[]> {
    // Get in-transit waybills with location/timing data
    const waybills = await this.prisma.waybill.findMany({
      where: {
        companyId,
        status: WaybillStatus.IN_TRANSIT,
        createdAt: {
          // Only check waybills created in last 48 hours
          gte: new Date(Date.now() - 48 * 60 * 60 * 1000),
        },
      },
      include: {
        driver: true,
        collection: true,
      },
    });

    const predictions: DelayPrediction[] = [];

    for (const wb of waybills) {
      try {
        const prediction = await this.analyzeWaybill(wb);
        
        if (prediction && prediction.predictedDelayMinutes > 30) {
          predictions.push(prediction);
        }
      } catch (error: any) {
        this.logger.error(`Failed to analyze waybill ${wb.id}: ${error.message}`);
      }
    }

    // Sort by delay severity
    predictions.sort((a, b) => b.predictedDelayMinutes - a.predictedDelayMinutes);

    return predictions;
  }

  /**
   * Analyze a single waybill for delay risk
   */
  private async analyzeWaybill(waybill: any): Promise<DelayPrediction | null> {
    const { id, waybillNumber, origin, destination, createdAt, driver } = waybill;
    
    // Calculate elapsed time
    const elapsedMinutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
    
    // Get historical average for this route
    const routeKey = `${origin}:${destination}`;
    const historicalAvg = this.routeAverages[routeKey] || 600; // Default 10 hours
    
    // Simple rule-based prediction (upgrade to ML later)
    let predictedDelay = 0;
    let confidence: 'low' | 'medium' | 'high' = 'low';
    let reason = '';
    let suggestedAction = '';

    // Rule 1: Exceeding historical average
    if (elapsedMinutes > historicalAvg * 1.5) {
      predictedDelay = Math.round(elapsedMinutes - historicalAvg);
      confidence = 'high';
      reason = `Exceeding historical average by ${Math.round((elapsedMinutes / historicalAvg - 1) * 100)}%`;
      suggestedAction = 'Contact driver for status update';
    }
    // Rule 2: No location update in 2+ hours
    else if (driver?.lastSeenAt) {
      const lastSeenMinutes = Math.floor((Date.now() - new Date(driver.lastSeenAt).getTime()) / 60000);
      if (lastSeenMinutes > 120) {
        predictedDelay = Math.round(lastSeenMinutes * 0.5); // Estimate
        confidence = 'medium';
        reason = `Driver location not updated in ${lastSeenMinutes} minutes`;
        suggestedAction = 'Request driver check-in via WhatsApp';
      }
    }
    // Rule 3: Weather/traffic flags (would integrate external APIs)
    // TODO: Add weather API integration for rain/flood delays
    // TODO: Add traffic API for route congestion

    if (predictedDelay === 0) {
      return null; // No significant delay predicted
    }

    return {
      waybillId: id,
      waybillNumber,
      predictedDelayMinutes: predictedDelay,
      confidence,
      reason,
      suggestedAction,
    };
  }

  /**
   * Send proactive alerts for predicted delays
   */
  async sendDelayAlerts(companyId: number): Promise<{ alerted: number }> {
    const predictions = await this.predictDelays(companyId);
    
    let alerted = 0;
    
    for (const pred of predictions) {
      try {
        // Create AI event for audit trail
        await (this.prisma as any).aiEvent.create({
          data: {
            companyId,
            type: 'DELAY_PREDICTION',
            title: `Predicted delay for waybill ${pred.waybillNumber}`,
            summary: pred.reason,
            severity: pred.confidence === 'high' ? 'HIGH' : 'MEDIUM',
            payload: {
              waybillId: pred.waybillId,
              predictedDelayMinutes: pred.predictedDelayMinutes,
              suggestedAction: pred.suggestedAction,
            },
          },
        });
        
        // TODO: Send WhatsApp/email alert to ops team
        // await this.notificationService.sendDelayAlert(pred, companyId);
        
        alerted++;
        
      } catch (error: any) {
        this.logger.error(`Failed to send alert for waybill ${pred.waybillId}: ${error.message}`);
      }
    }
    
    this.logger.log(`Sent ${alerted} delay prediction alerts for company ${companyId}`);
    return { alerted };
  }

  /**
   * Update route averages from completed waybills (learning)
   */
  async updateRouteAverages(companyId: number): Promise<{ updated: number }> {
    // Get completed waybills with timing data
    const completed = await this.prisma.waybill.findMany({
      where: {
        companyId,
        status: WaybillStatus.DELIVERED,
        deliveredAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
        origin: { not: null },
        destination: { not: null },
      },
    });

    // Group by route and calculate averages
    const routeStats: Record<string, { total: number; count: number }> = {};
    
    for (const wb of completed) {
      if (!wb.origin || !wb.destination || !wb.deliveredAt) continue;
      
      const routeKey = `${wb.origin}:${wb.destination}`;
      const duration = Math.floor((new Date(wb.deliveredAt).getTime() - new Date(wb.createdAt).getTime()) / 60000);
      
      if (!routeStats[routeKey]) {
        routeStats[routeKey] = { total: 0, count: 0 };
      }
      routeStats[routeKey].total += duration;
      routeStats[routeKey].count += 1;
    }
    
    // Update in-memory averages (would persist to DB in production)
    let updated = 0;
    for (const [route, stats] of Object.entries(routeStats)) {
      if (stats.count >= 5) { // Only update with sufficient data
        const avg = Math.round(stats.total / stats.count);
        this.routeAverages[route] = avg;
        updated++;
        this.logger.debug(`Updated route average: ${route} = ${avg} minutes`);
      }
    }
    
    return { updated };
  }
}
