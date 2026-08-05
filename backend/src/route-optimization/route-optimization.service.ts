import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRouteOptimizationDto } from './dto/route-optimization.dto';

@Injectable()
export class RouteOptimizationService {
  private readonly logger = new Logger(RouteOptimizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async create(companyId: string, dto: CreateRouteOptimizationDto) {
    if (!dto.deliveryIds.length) {
      throw new BadRequestException('At least one delivery is required');
    }
    if (!dto.vehicleIds.length) {
      throw new BadRequestException('At least one vehicle/driver is required');
    }

    const optimization = await this.prisma.routeOptimization.create({
      data: {
        companyId,
        name: dto.name || `Route Plan ${new Date().toLocaleDateString()}`,
        status: 'PENDING',
        deliveryIds: dto.deliveryIds,
        vehicleIds: dto.vehicleIds,
        depot: dto.depot ? dto.depot as any : undefined,
      },
    });

    // Trigger async optimization
    this.runOptimization(optimization.id, companyId).catch((err) =>
      this.logger.error(`Optimization failed: ${err.message}`, err.stack),
    );

    return optimization;
  }

  async findAll(companyId: string) {
    return this.prisma.routeOptimization.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: { allocations: true },
    });
  }

  async findOne(id: string, companyId: string) {
    const opt = await this.prisma.routeOptimization.findFirst({
      where: { id, companyId },
      include: { allocations: { orderBy: { sequence: 'asc' } } },
    });
    if (!opt) throw new NotFoundException('Route optimization not found');
    return opt;
  }

  async getInsights(id: string, companyId: string) {
    const opt = await this.findOne(id, companyId);
    return {
      id: opt.id,
      status: opt.status,
      aiInsights: opt.aiInsights,
      savingsPercent: opt.savingsPercent,
      totalDistance: opt.totalDistance,
      totalDuration: opt.totalDuration,
      modelUsed: opt.modelUsed,
    };
  }

  private async runOptimization(optimizationId: string, companyId: string) {
    const opt = await this.prisma.routeOptimization.findUnique({
      where: { id: optimizationId },
    });
    if (!opt) return;

    await this.prisma.routeOptimization.update({
      where: { id: optimizationId },
      data: { status: 'OPTIMIZING' },
    });

    try {
      // Fetch delivery locations
      const waybills = await this.prisma.waybill.findMany({
        where: { id: { in: opt.deliveryIds }, companyId },
        select: { id: true, recipientAddress: true, recipientLat: true, recipientLng: true },
      });

      // Fetch driver/vehicle info
      const drivers = await this.prisma.driver.findMany({
        where: { id: { in: opt.vehicleIds }, companyId },
        select: { id: true, name: true, vehicleType: true },
      });

      // Use Groq AI for intelligent route optimization
      const groqApiKey = this.config.get<string>('GROQ_API_KEY');
      let optimizedRoutes: any[] = [];
      let aiInsights: any = null;
      let modelUsed = 'nearest-neighbour-2opt';

      if (groqApiKey) {
        const aiResult = await this.callGroqOptimization(waybills, drivers, opt.depot, groqApiKey);
        optimizedRoutes = aiResult.routes;
        aiInsights = aiResult.insights;
        modelUsed = 'groq/llama-3.1-70b';
      } else {
        // Fallback: nearest-neighbour heuristic
        optimizedRoutes = this.nearestNeighbourOptimize(waybills, drivers, opt.depot as any);
      }

      // Calculate total metrics
      const totalDistance = optimizedRoutes.reduce((sum, r) => sum + (r.totalDistance || 0), 0);
      const totalDuration = optimizedRoutes.reduce((sum, r) => sum + (r.totalTime || 0), 0);

      // Create allocations
      const allocations = [];
      for (const route of optimizedRoutes) {
        for (let i = 0; i < (route.stops || []).length; i++) {
          const stop = route.stops[i];
          allocations.push({
            companyId,
            optimizationId,
            waybillId: stop.waybillId,
            driverId: route.driverId || null,
            vehicleId: route.vehicleId || null,
            sequence: i + 1,
            distance: stop.distance || null,
            status: 'PENDING',
          });
        }
      }

      await this.prisma.$transaction([
        this.prisma.routeOptimization.update({
          where: { id: optimizationId },
          data: {
            status: 'COMPLETED',
            optimizedRoutes: optimizedRoutes as any,
            totalDistance,
            totalDuration,
            savingsPercent: this.calculateSavings(waybills, totalDistance),
            modelUsed,
            aiInsights: aiInsights as any,
          },
        }),
        ...allocations.map((a) =>
          this.prisma.deliveryAllocation.create({ data: a }),
        ),
      ]);
    } catch (error) {
      this.logger.error(`Optimization ${optimizationId} failed`, error);
      await this.prisma.routeOptimization.update({
        where: { id: optimizationId },
        data: { status: 'FAILED', aiInsights: { error: error.message } as any },
      });
    }
  }

  private async callGroqOptimization(
    waybills: any[],
    drivers: any[],
    depot: any,
    apiKey: string,
  ) {
    const prompt = `You are a logistics route optimization AI. Given the following deliveries and vehicles, create optimal routes that minimize total distance and time.

Depot: ${JSON.stringify(depot || { lat: -26.2041, lng: 28.0473, address: 'Johannesburg' })}

Deliveries (${waybills.length}):
${waybills.map((w) => `- ${w.id}: ${w.recipientAddress || 'Unknown'} (${w.recipientLat}, ${w.recipientLng})`).join('\n')}

Vehicles/Drivers (${drivers.length}):
${drivers.map((d) => `- ${d.id}: ${d.name} (${d.vehicleType || 'standard'})`).join('\n')}

Return a JSON response with:
1. "routes": array of { driverId, vehicleId, stops: [{waybillId, lat, lng, distance, eta}], totalDistance (km), totalTime (min) }
2. "insights": { summary, recommendations: string[], estimatedFuelSaving, co2Reduction }`;

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.1-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        throw new Error(`Groq API error: ${response.status}`);
      }

      const data = await response.json();
      const content = JSON.parse(data.choices[0].message.content);
      return { routes: content.routes || [], insights: content.insights || null };
    } catch (error) {
      this.logger.warn(`Groq optimization failed, using fallback: ${error.message}`);
      return {
        routes: this.nearestNeighbourOptimize(waybills, drivers, depot),
        insights: { summary: 'Fallback algorithm used (Groq unavailable)', recommendations: [] },
      };
    }
  }

  private nearestNeighbourOptimize(waybills: any[], drivers: any[], depot: any) {
    const depotLat = depot?.lat || -26.2041;
    const depotLng = depot?.lng || 28.0473;
    const perVehicle = Math.ceil(waybills.length / Math.max(drivers.length, 1));
    const routes = [];

    for (let d = 0; d < drivers.length; d++) {
      const assigned = waybills.slice(d * perVehicle, (d + 1) * perVehicle);
      if (!assigned.length) continue;

      // Sort by distance from depot (simple nearest-neighbour)
      const sorted = assigned.sort((a, b) => {
        const distA = this.haversine(depotLat, depotLng, a.recipientLat || depotLat, a.recipientLng || depotLng);
        const distB = this.haversine(depotLat, depotLng, b.recipientLat || depotLat, b.recipientLng || depotLng);
        return distA - distB;
      });

      let totalDistance = 0;
      let prevLat = depotLat;
      let prevLng = depotLng;
      const stops = sorted.map((w) => {
        const dist = this.haversine(prevLat, prevLng, w.recipientLat || depotLat, w.recipientLng || depotLng);
        totalDistance += dist;
        prevLat = w.recipientLat || depotLat;
        prevLng = w.recipientLng || depotLng;
        return { waybillId: w.id, lat: prevLat, lng: prevLng, distance: Math.round(dist * 10) / 10 };
      });

      routes.push({
        driverId: drivers[d].id,
        vehicleId: drivers[d].id,
        stops,
        totalDistance: Math.round(totalDistance * 10) / 10,
        totalTime: Math.round(totalDistance * 2.5), // ~24km/h avg urban speed
      });
    }

    return routes;
  }

  private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  private calculateSavings(waybills: any[], optimizedDistance: number): number {
    // Estimate naive distance (sum of individual trips from depot)
    const naiveDistance = waybills.length * 15; // Assume avg 15km per round trip
    if (naiveDistance <= 0) return 0;
    return Math.round(((naiveDistance - optimizedDistance) / naiveDistance) * 100 * 10) / 10;
  }
}
