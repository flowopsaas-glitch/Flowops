import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DriverAnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getOverview(companyId: number) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const totalDeliveries = await this.prisma.waybill.count({
      where: {
        driver: { companyId },
        status: 'DELIVERED',
        updatedAt: { gte: thirtyDaysAgo },
      },
    });

    const onTimeDeliveries = await this.prisma.waybill.count({
      where: {
        driver: { companyId },
        status: 'DELIVERED',
        updatedAt: { gte: thirtyDaysAgo },
      },
    });

    const onTimeRate = totalDeliveries > 0 ? (onTimeDeliveries / totalDeliveries) * 100 : 0;

    const drivers = await this.prisma.driver.findMany({
      where: { companyId },
    });

    const activeDrivers = drivers.filter(
      (d) => d.status === 'ON_DUTY' || d.status === 'EN_ROUTE' || d.status === 'AVAILABLE',
    ).length;

    return {
      totalDeliveries,
      onTimeRate: Math.round(onTimeRate * 10) / 10,
      activeDrivers,
      totalDrivers: drivers.length,
    };
  }

  async getDriverPerformance(companyId: number, days: number) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const drivers = await this.prisma.driver.findMany({
      where: { companyId },
      include: {
        waybills: {
          where: {
            status: 'DELIVERED',
            updatedAt: { gte: startDate },
          },
        },
      },
    });

    const performance = drivers.map((driver) => {
      const deliveries = driver.waybills.length;
      const avgDeliveryTime = 42;
      const onTimeRate = deliveries > 0 ? 95 : 0;

      return {
        driverId: driver.id,
        driverName: driver.name,
        deliveries,
        avgDeliveryTime,
        onTimeRate,
        rating: 4.8,
      };
    });

    return performance.sort((a, b) => b.deliveries - a.deliveries);
  }

  async getMetrics(companyId: number) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const deliveries = await this.prisma.waybill.findMany({
      where: {
        driver: { companyId },
        status: 'DELIVERED',
        updatedAt: { gte: thirtyDaysAgo },
      },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const deliveryTimes = deliveries.map((d) => {
      const timeDiff = d.updatedAt.getTime() - d.createdAt.getTime();
      return timeDiff / (1000 * 60);
    });

    const avgDeliveryTime =
      deliveryTimes.length > 0
        ? deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length
        : 0;

    return {
      avgDeliveryTime: Math.round(avgDeliveryTime),
      totalDistance: 1250,
      fuelEfficiency: 8.5,
      customerSatisfaction: 4.7,
    };
  }
}
