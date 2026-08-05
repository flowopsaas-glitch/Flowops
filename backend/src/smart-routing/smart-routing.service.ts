import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoutePlanDto, UpdateRoutePlanDto } from './dto/smart-routing.dto';

@Injectable()
export class SmartRoutingService {
  private readonly logger = new Logger(SmartRoutingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createPlan(companyId: string, dto: CreateRoutePlanDto) {
    if (!dto.stops?.length) {
      throw new BadRequestException('At least one stop is required');
    }

    // Calculate route metrics using smart ordering
    const optimizedStops = await this.optimizeStopOrder(dto.stops);
    const metrics = this.calculateRouteMetrics(optimizedStops);

    const plan = await this.prisma.routePlan.create({
      data: {
        companyId,
        name: dto.name || `Route ${new Date().toLocaleDateString()}`,
        status: 'DRAFT',
        vehicleId: dto.vehicleId,
        driverId: dto.driverId,
        stops: optimizedStops as any,
        totalStops: dto.stops.length,
        routeCoordinates: optimizedStops.map((s: any) => ({ lat: s.lat, lng: s.lng })) as any,
        estimatedTime: metrics.totalTime,
        estimatedDistance: metrics.totalDistance,
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : null,
        vehicleCapacity: dto.vehicleCapacity,
      },
    });

    return plan;
  }

  async findAll(companyId: string, query?: { status?: string; driverId?: string; date?: string }) {
    const where: any = { companyId };
    if (query?.status) where.status = query.status;
    if (query?.driverId) where.driverId = query.driverId;
    if (query?.date) {
      const date = new Date(query.date);
      where.scheduledDate = {
        gte: new Date(date.setHours(0, 0, 0, 0)),
        lt: new Date(date.setHours(23, 59, 59, 999)),
      };
    }

    return this.prisma.routePlan.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const plan = await this.prisma.routePlan.findFirst({ where: { id, companyId } });
    if (!plan) throw new NotFoundException('Route plan not found');
    return plan;
  }

  async update(id: string, companyId: string, dto: UpdateRoutePlanDto) {
    await this.findOne(id, companyId);

    const data: any = {};
    if (dto.name) data.name = dto.name;
    if (dto.vehicleId) data.vehicleId = dto.vehicleId;
    if (dto.driverId) data.driverId = dto.driverId;
    if (dto.status) data.status = dto.status;

    if (dto.stops) {
      const optimizedStops = await this.optimizeStopOrder(dto.stops);
      const metrics = this.calculateRouteMetrics(optimizedStops);
      data.stops = optimizedStops as any;
      data.totalStops = dto.stops.length;
      data.routeCoordinates = optimizedStops.map((s: any) => ({ lat: s.lat, lng: s.lng })) as any;
      data.estimatedTime = metrics.totalTime;
      data.estimatedDistance = metrics.totalDistance;
    }

    return this.prisma.routePlan.update({ where: { id }, data });
  }

  async activatePlan(id: string, companyId: string) {
    const plan = await this.findOne(id, companyId);
    if (plan.status !== 'DRAFT') {
      throw new BadRequestException('Only draft plans can be activated');
    }
    return this.prisma.routePlan.update({
      where: { id },
      data: { status: 'ACTIVE', startTime: new Date() },
    });
  }

  async completePlan(id: string, companyId: string) {
    const plan = await this.findOne(id, companyId);
    if (plan.status !== 'ACTIVE') {
      throw new BadRequestException('Only active plans can be completed');
    }
    const startTime = plan.startTime || plan.createdAt;
    const actualTime = (Date.now() - startTime.getTime()) / 60000; // minutes

    return this.prisma.routePlan.update({
      where: { id },
      data: { status: 'COMPLETED', endTime: new Date(), actualTime },
    });
  }

  async cancelPlan(id: string, companyId: string) {
    const plan = await this.findOne(id, companyId);
    if (plan.status === 'COMPLETED') {
      throw new BadRequestException('Cannot cancel a completed plan');
    }
    return this.prisma.routePlan.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  async getSchedule(companyId: string, date: string) {
    const targetDate = new Date(date);
    return this.prisma.routePlan.findMany({
      where: {
        companyId,
        scheduledDate: {
          gte: new Date(targetDate.setHours(0, 0, 0, 0)),
          lt: new Date(targetDate.setHours(23, 59, 59, 999)),
        },
      },
      orderBy: { startTime: 'asc' },
    });
  }

  private async optimizeStopOrder(stops: any[]): Promise<any[]> {
    if (stops.length <= 2) return stops;

    // 2-opt improvement heuristic
    const ordered = [...stops];
    let improved = true;

    while (improved) {
      improved = false;
      for (let i = 0; i < ordered.length - 1; i++) {
        for (let j = i + 2; j < ordered.length; j++) {
          const currentDist =
            this.distance(ordered[i], ordered[i + 1]) + this.distance(ordered[j], ordered[(j + 1) % ordered.length]);
          const newDist =
            this.distance(ordered[i], ordered[j]) + this.distance(ordered[i + 1], ordered[(j + 1) % ordered.length]);

          if (newDist < currentDist) {
            // Reverse the segment between i+1 and j
            const segment = ordered.splice(i + 1, j - i);
            ordered.splice(i + 1, 0, ...segment.reverse());
            improved = true;
          }
        }
      }
    }

    return ordered;
  }

  private calculateRouteMetrics(stops: any[]) {
    let totalDistance = 0;
    for (let i = 0; i < stops.length - 1; i++) {
      totalDistance += this.distance(stops[i], stops[i + 1]);
    }
    const totalTime = totalDistance * 2.5; // Avg urban speed ~24km/h
    const serviceTime = stops.reduce((sum, s) => sum + (s.serviceTime || 5), 0);

    return {
      totalDistance: Math.round(totalDistance * 10) / 10,
      totalTime: Math.round(totalTime + serviceTime),
    };
  }

  private distance(a: any, b: any): number {
    if (!a?.lat || !b?.lat) return 5; // default 5km if coords missing
    const R = 6371;
    const dLat = this.deg2rad(b.lat - a.lat);
    const dLon = this.deg2rad(b.lng - a.lng);
    const x =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(a.lat)) * Math.cos(this.deg2rad(b.lat)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}
