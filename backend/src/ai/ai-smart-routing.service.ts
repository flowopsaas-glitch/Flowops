import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

interface RoutePoint {
  id: number;
  lat: number;
  lng: number;
  address: string;
  waybillId: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  timeWindow?: { start: string; end: string };
}

interface OptimizedRoute {
  routeId: string;
  driverId: number;
  points: RoutePoint[];
  totalDistance: number; // km
  totalDuration: number; // minutes
  estimatedFuelCost: number; // ZAR
  estimatedTimeSavings: number; // minutes vs unoptimized
  optimizedAt: Date;
}

@Injectable()
export class AiSmartRoutingService {
  private readonly logger = new Logger(AiSmartRoutingService.name);
  private readonly groqApiKey: string;
  private readonly fuelPricePerLiter = 23.50; // ZAR per liter (SA average)
  private readonly averageFuelConsumption = 8; // liters per 100km

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.groqApiKey = this.config.get<string>('GROQ_API_KEY') || '';
  }

  /**
   * 🗺️ Optimize route for a driver with multiple deliveries
   */
  async optimizeRoute(driverId: number, companyId: number): Promise<OptimizedRoute> {
    this.logger.log(`🗺️ Optimizing route for driver ${driverId}`);

    // 1. Get all pending deliveries for this driver
    const pendingDeliveries = await this.prisma.waybill.findMany({
      where: {
        driverId,
        companyId,
        status: { in: ['IN_TRANSIT', 'PENDING_COLLECTION'] },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (pendingDeliveries.length === 0) {
      return {
        routeId: `route-${driverId}-${Date.now()}`,
        driverId,
        points: [],
        totalDistance: 0,
        totalDuration: 0,
        estimatedFuelCost: 0,
        estimatedTimeSavings: 0,
        optimizedAt: new Date(),
      };
    }

    // 2. Convert to route points
    const routePoints: RoutePoint[] = await Promise.all(
      pendingDeliveries.map(async (wb, index) => {
        const coords = await this.geocodeAddress(wb.destination || '');
        return {
          id: wb.id,
          lat: coords.lat,
          lng: coords.lng,
          address: wb.destination || '',
          waybillId: wb.id,
          priority: this.calculatePriority(wb),
          timeWindow: wb.deliveredAt ? undefined : this.estimateTimeWindow(wb),
        };
      })
    );

    // 3. Optimize route order using nearest neighbor + 2-opt improvement
    const optimizedPoints = this.optimizeRouteOrder(routePoints);

    // 4. Calculate total distance and duration
    const { totalDistance, totalDuration } = await this.calculateRouteMetrics(optimizedPoints);

    // 5. Calculate fuel cost
    const estimatedFuelCost = this.calculateFuelCost(totalDistance);

    // 6. Calculate time savings vs unoptimized
    const unoptimizedDuration = await this.calculateUnoptimizedDuration(routePoints);
    const estimatedTimeSavings = unoptimizedDuration - totalDuration;

    // 7. Store optimized route
    const routeId = `route-${driverId}-${Date.now()}`;
    
    // Update waybills with optimized order
    for (let i = 0; i < optimizedPoints.length; i++) {
      await this.prisma.waybill.update({
        where: { id: optimizedPoints[i].waybillId },
        data: { 
          notes: `Route position: ${i + 1}/${optimizedPoints.length}`,
        },
      });
    }

    this.logger.log(`✅ Route optimized: ${totalDistance.toFixed(1)}km, ${totalDuration}min, Save ${estimatedTimeSavings}min`);

    return {
      routeId,
      driverId,
      points: optimizedPoints,
      totalDistance,
      totalDuration,
      estimatedFuelCost,
      estimatedTimeSavings,
      optimizedAt: new Date(),
    };
  }

  /**
   * 🔄 Re-optimize route with real-time traffic
   */
  async reoptimizeWithTraffic(driverId: number, currentLat: number, currentLng: number): Promise<OptimizedRoute> {
    this.logger.log(`🔄 Re-optimizing route for driver ${driverId} with traffic data`);

    // Get current route
    // Get active waybills for this driver directly
    const activeWaybills = await this.prisma.waybill.findMany({
      where: {
        driverId,
        status: { in: ['IN_TRANSIT', 'PENDING_COLLECTION'] },
      },
    });

    if (activeWaybills.length === 0) {
      throw new Error('No active deliveries for this driver');
    }

    // Get current route
    const routePoints: RoutePoint[] = await Promise.all(
      activeWaybills.map(async (wb) => {
        const coords = await this.geocodeAddress(wb.destination || '');
        return {
          id: wb.id,
          lat: coords.lat,
          lng: coords.lng,
          address: wb.destination || '',
          waybillId: wb.id,
          priority: this.calculatePriority(wb),
        };
      })
    );

    // Add current location as starting point
    const startPoint: RoutePoint = {
      id: 0,
      lat: currentLat,
      lng: currentLng,
      address: 'Current Location',
      waybillId: 0,
      priority: 'HIGH',
    };

    // Optimize with current location
    const optimizedPoints = this.optimizeRouteOrder([startPoint, ...routePoints]);

    // Calculate with traffic
    const { totalDistance, totalDuration } = await this.calculateRouteMetrics(optimizedPoints, true);
    const estimatedFuelCost = this.calculateFuelCost(totalDistance);

    return {
      routeId: `route-traffic-${driverId}-${Date.now()}`,
      driverId,
      points: optimizedPoints.slice(1), // Remove start point from response
      totalDistance,
      totalDuration,
      estimatedFuelCost,
      estimatedTimeSavings: 0, // Can't calculate without baseline
      optimizedAt: new Date(),
    };
  }

  /**
   * 📊 Get routing analytics
   */
  async getRoutingAnalytics(companyId: number, days: number = 30): Promise<any> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const deliveredWaybills = await this.prisma.waybill.findMany({
      where: {
        companyId,
        status: 'DELIVERED',
        deliveredAt: { gte: since },
      },
      select: {
        distanceKm: true,
        driverId: true,
        deliveredAt: true,
        createdAt: true,
      },
    });

    if (deliveredWaybills.length === 0) {
      return {
        totalDeliveries: 0,
        averageDistance: 0,
        totalDistance: 0,
        estimatedFuelCost: 0,
        deliveriesPerDay: 0,
      };
    }

    const totalDistance = deliveredWaybills.reduce((sum, wb) => sum + (wb.distanceKm || 0), 0);
    const averageDistance = totalDistance / deliveredWaybills.length;
    const estimatedFuelCost = this.calculateFuelCost(totalDistance);
    const deliveriesPerDay = deliveredWaybills.length / days;

    return {
      totalDeliveries: deliveredWaybills.length,
      averageDistance: Math.round(averageDistance * 10) / 10,
      totalDistance: Math.round(totalDistance * 10) / 10,
      estimatedFuelCost: Math.round(estimatedFuelCost * 100) / 100,
      deliveriesPerDay: Math.round(deliveriesPerDay * 10) / 10,
    };
  }

  // ========================================
  // PRIVATE HELPER METHODS
  // ========================================

  private async geocodeAddress(address: string): Promise<{ lat: number; lng: number }> {
    // In production, use Google Maps Geocoding API
    // For now, return mock coordinates based on city
    const cityCoords: Record<string, { lat: number; lng: number }> = {
      'johannesburg': { lat: -26.2041, lng: 28.0473 },
      'pretoria': { lat: -25.7479, lng: 28.2293 },
      'cape town': { lat: -33.9249, lng: 18.4241 },
      'durban': { lat: -29.8587, lng: 31.0218 },
      'port elizabeth': { lat: -33.9608, lng: 25.6022 },
    };

    const addressLower = address.toLowerCase();
    for (const [city, coords] of Object.entries(cityCoords)) {
      if (addressLower.includes(city)) {
        // Add some randomness for different addresses in same city
        return {
          lat: coords.lat + (Math.random() - 0.5) * 0.1,
          lng: coords.lng + (Math.random() - 0.5) * 0.1,
        };
      }
    }

    // Default: Johannesburg
    return { lat: -26.2041, lng: 28.0473 };
  }

  private calculatePriority(waybill: any): 'HIGH' | 'MEDIUM' | 'LOW' {
    // High priority: urgent, express, or time-sensitive
    if (waybill.notes?.toLowerCase().includes('urgent') || 
        waybill.notes?.toLowerCase().includes('express')) {
      return 'HIGH';
    }

    // Medium priority: standard deliveries
    return 'MEDIUM';
  }

  private estimateTimeWindow(waybill: any): { start: string; end: string } | undefined {
    // If waybill has specific delivery time requirements
    if (waybill.deliveredAt) {
      const time = new Date(waybill.deliveredAt);
      const start = new Date(time.getTime() - 60 * 60 * 1000); // 1 hour before
      const end = new Date(time.getTime() + 60 * 60 * 1000); // 1 hour after
      return {
        start: start.toISOString(),
        end: end.toISOString(),
      };
    }
    return undefined;
  }

  private optimizeRouteOrder(points: RoutePoint[]): RoutePoint[] {
    if (points.length <= 2) return points;

    // Nearest neighbor algorithm
    const optimized: RoutePoint[] = [points[0]];
    const remaining = points.slice(1);

    while (remaining.length > 0) {
      const lastPoint = optimized[optimized.length - 1];
      let nearestIndex = 0;
      let nearestDistance = Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const distance = this.calculateDistance(
          lastPoint.lat, lastPoint.lng,
          remaining[i].lat, remaining[i].lng
        );
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = i;
        }
      }

      optimized.push(remaining[nearestIndex]);
      remaining.splice(nearestIndex, 1);
    }

    // 2-opt improvement (simplified)
    return this.twoOptImprovement(optimized);
  }

  private twoOptImprovement(route: RoutePoint[]): RoutePoint[] {
    let improved = true;
    let bestRoute = [...route];

    while (improved) {
      improved = false;
      for (let i = 1; i < bestRoute.length - 1; i++) {
        for (let j = i + 1; j < bestRoute.length; j++) {
          const newRoute = this.twoOptSwap(bestRoute, i, j);
          if (this.calculateTotalDistance(newRoute) < this.calculateTotalDistance(bestRoute)) {
            bestRoute = newRoute;
            improved = true;
          }
        }
      }
    }

    return bestRoute;
  }

  private twoOptSwap(route: RoutePoint[], i: number, j: number): RoutePoint[] {
    const newRoute = [...route];
    const reversed = newRoute.slice(i, j + 1).reverse();
    newRoute.splice(i, j - i + 1, ...reversed);
    return newRoute;
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    // Haversine formula
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  private calculateTotalDistance(route: RoutePoint[]): number {
    let total = 0;
    for (let i = 0; i < route.length - 1; i++) {
      total += this.calculateDistance(
        route[i].lat, route[i].lng,
        route[i + 1].lat, route[i + 1].lng
      );
    }
    return total;
  }

  private async calculateRouteMetrics(points: RoutePoint[], withTraffic = false): Promise<{
    totalDistance: number;
    totalDuration: number;
  }> {
    const totalDistance = this.calculateTotalDistance(points);
    
    // Base duration: 40 km/h average speed
    let baseDuration = (totalDistance / 40) * 60; // minutes
    
    // Add traffic multiplier
    if (withTraffic) {
      const hour = new Date().getHours();
      if ((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 18)) {
        baseDuration *= 1.5; // Peak hours
      } else if ((hour >= 10 && hour <= 15) || (hour >= 19 && hour <= 21)) {
        baseDuration *= 1.2; // Moderate traffic
      }
    }
    
    // Add stop time (5 minutes per delivery)
    const stopTime = (points.length - 1) * 5;
    
    return {
      totalDistance: Math.round(totalDistance * 10) / 10,
      totalDuration: Math.round(baseDuration + stopTime),
    };
  }

  private async calculateUnoptimizedDuration(points: RoutePoint[]): Promise<number> {
    // Simulate unoptimized route (random order)
    const unoptimized = [...points].sort(() => Math.random() - 0.5);
    const { totalDuration } = await this.calculateRouteMetrics(unoptimized);
    return totalDuration;
  }

  private calculateFuelCost(distanceKm: number): number {
    const litersUsed = (distanceKm / 100) * this.averageFuelConsumption;
    return litersUsed * this.fuelPricePerLiter;
  }
}
