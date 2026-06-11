import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdvancedAnalyticsService {
  private readonly logger = new Logger(AdvancedAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 👑 ADMIN DASHBOARD - Strategic & Financial Metrics
   */
  async getAdminDashboard(companyId: number, period: '7d' | '30d' | '90d' = '30d') {
    const startDate = this.getStartDate(period);
    
    const [
      revenue,
      aiROI,
      customerInsights,
      fleetUtilization,
      growthMetrics,
      topClients,
    ] = await Promise.all([
      this.calculateRevenue(companyId, startDate),
      this.calculateAIROI(companyId, startDate),
      this.getCustomerInsights(companyId, startDate),
      this.getFleetUtilization(companyId, startDate),
      this.getGrowthMetrics(companyId, startDate),
      this.getTopClients(companyId, startDate),
    ]);

    return {
      period,
      revenue,
      aiROI,
      customerInsights,
      fleetUtilization,
      growthMetrics,
      topClients,
      generatedAt: new Date(),
    };
  }

  /**
   * 🎧 DISPATCHER DASHBOARD - Operational Metrics
   */
  async getDispatcherDashboard(companyId: number) {
    const [
      slaCompliance,
      exceptions,
      operationalVelocity,
      zoneHeatmap,
      hubBottlenecks,
      activeDeliveries,
    ] = await Promise.all([
      this.calculateSLACompliance(companyId),
      this.getActiveExceptions(companyId),
      this.getOperationalVelocity(companyId),
      this.getZoneHeatmap(companyId),
      this.getHubBottlenecks(companyId),
      this.getActiveDeliveries(companyId),
    ]);

    return {
      slaCompliance,
      exceptions,
      operationalVelocity,
      zoneHeatmap,
      hubBottlenecks,
      activeDeliveries,
      generatedAt: new Date(),
    };
  }

  // ============================================
  // ADMIN METRICS CALCULATIONS
  // ============================================

  private async calculateRevenue(companyId: number, startDate: Date) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        companyId,
        createdAt: { gte: startDate },
      },
      select: {
        total: true,
        status: true,
        paidAt: true,
      },
    });

    const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const paidRevenue = invoices
      .filter(inv => inv.status === 'PAID')
      .reduce((sum, inv) => sum + (inv.total || 0), 0);
    
    const outstandingRevenue = totalRevenue - paidRevenue;

    // Calculate previous period for comparison
    const previousPeriodStart = new Date(startDate);
    previousPeriodStart.setDate(previousPeriodStart.getDate() - (previousPeriodStart.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    
    const previousInvoices = await this.prisma.invoice.findMany({
      where: {
        companyId,
        createdAt: { gte: previousPeriodStart, lt: startDate },
      },
      select: { total: true },
    });

    const previousRevenue = previousInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const growthRate = previousRevenue > 0 
      ? ((totalRevenue - previousRevenue) / previousRevenue) * 100 
      : 0;

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      paidRevenue: Math.round(paidRevenue * 100) / 100,
      outstandingRevenue: Math.round(outstandingRevenue * 100) / 100,
      previousRevenue: Math.round(previousRevenue * 100) / 100,
      growthRate: Math.round(growthRate * 10) / 10,
      invoiceCount: invoices.length,
    };
  }

  private async calculateAIROI(companyId: number, startDate: Date) {
    const aiEvents = await this.prisma.aiEvent.findMany({
      where: {
        companyId,
        createdAt: { gte: startDate },
      },
      select: {
        eventType: true,
        result: true,
        payload: true,
      },
    });

    // Calculate savings from different AI features
    let fraudSavings = 0;
    let routingSavings = 0;
    let pricingRevenue = 0;

    aiEvents.forEach(event => {
      const payload = event.payload as any;
      
      if (event.eventType === 'FRAUD_DETECTED') {
        // Estimate R1,500 average loss per fraudulent delivery
        fraudSavings += 1500;
      } else if (event.eventType === 'ROUTE_OPTIMIZED') {
        // Estimate R50 average fuel savings per optimized route
        routingSavings += payload?.fuelSaved || 50;
      } else if (event.eventType === 'DYNAMIC_PRICING') {
        // Additional revenue from dynamic pricing
        pricingRevenue += payload?.additionalRevenue || 0;
      }
    });

    const totalSavings = fraudSavings + routingSavings + pricingRevenue;

    return {
      fraudSavings: Math.round(fraudSavings),
      routingSavings: Math.round(routingSavings),
      pricingRevenue: Math.round(pricingRevenue),
      totalSavings: Math.round(totalSavings),
      eventsProcessed: aiEvents.length,
      roiMultiple: totalSavings > 0 ? Math.round((totalSavings / 5000) * 10) / 10 : 0, // Assuming R5000/month platform cost
    };
  }

  private async getCustomerInsights(companyId: number, startDate: Date) {
    const waybills = await this.prisma.waybill.findMany({
      where: {
        companyId,
        createdAt: { gte: startDate },
      },
      select: {
        receiverPhone: true,
        status: true,
        deliveredAt: true,
        createdAt: true,
      },
    });

    const uniqueCustomers = new Set(waybills.map(w => w.receiverPhone).filter(Boolean));
    const deliveredWaybills = waybills.filter(w => w.status === 'DELIVERED');
    
    // Calculate average delivery time
    const deliveryTimes = deliveredWaybills
      .filter(w => w.deliveredAt)
      .map(w => {
        const diff = new Date(w.deliveredAt!).getTime() - new Date(w.createdAt).getTime();
        return diff / (1000 * 60 * 60); // hours
      });

    const avgDeliveryTime = deliveryTimes.length > 0
      ? deliveryTimes.reduce((sum, t) => sum + t, 0) / deliveryTimes.length
      : 0;

    return {
      totalCustomers: uniqueCustomers.size,
      totalWaybills: waybills.length,
      deliveredWaybills: deliveredWaybills.length,
      avgDeliveryTimeHours: Math.round(avgDeliveryTime * 10) / 10,
      deliverySuccessRate: waybills.length > 0
        ? Math.round((deliveredWaybills.length / waybills.length) * 100 * 10) / 10
        : 0,
    };
  }

  private async getFleetUtilization(companyId: number, startDate: Date) {
    const drivers = await this.prisma.driver.findMany({
      where: { companyId },
      include: {
        waybills: {
          where: { createdAt: { gte: startDate } },
          select: { status: true },
        },
      },
    });

    const activeDrivers = drivers.filter(d => 
      d.status === 'ON_DUTY' || d.status === 'EN_ROUTE'
    ).length;

    const totalDeliveries = drivers.reduce((sum, d) => sum + d.waybills.length, 0);
    const avgDeliveriesPerDriver = drivers.length > 0 ? totalDeliveries / drivers.length : 0;

    return {
      totalDrivers: drivers.length,
      activeDrivers,
      utilizationRate: drivers.length > 0
        ? Math.round((activeDrivers / drivers.length) * 100 * 10) / 10
        : 0,
      totalDeliveries,
      avgDeliveriesPerDriver: Math.round(avgDeliveriesPerDriver * 10) / 10,
    };
  }

  private async getGrowthMetrics(companyId: number, startDate: Date) {
    // Get current period waybills
    const currentWaybills = await this.prisma.waybill.count({
      where: {
        companyId,
        createdAt: { gte: startDate },
      },
    });

    // Get previous period waybills
    const daysDiff = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const previousStart = new Date(startDate);
    previousStart.setDate(previousStart.getDate() - daysDiff);

    const previousWaybills = await this.prisma.waybill.count({
      where: {
        companyId,
        createdAt: { gte: previousStart, lt: startDate },
      },
    });

    const growthRate = previousWaybills > 0
      ? ((currentWaybills - previousWaybills) / previousWaybills) * 100
      : 0;

    return {
      currentPeriodWaybills: currentWaybills,
      previousPeriodWaybills: previousWaybills,
      growthRate: Math.round(growthRate * 10) / 10,
      trend: growthRate > 0 ? 'UP' : growthRate < 0 ? 'DOWN' : 'STABLE',
    };
  }

  private async getTopClients(companyId: number, startDate: Date) {
    const clients = await this.prisma.client.findMany({
      where: { companyId },
    });

    const clientStats = await Promise.all(
      clients.map(async (client) => {
        const waybills = await this.prisma.waybill.count({
          where: {
            companyId,
            receiverPhone: client.phone,
            createdAt: { gte: startDate },
          },
        });

        const deliveredCount = await this.prisma.waybill.count({
          where: {
            companyId,
            receiverPhone: client.phone,
            status: 'DELIVERED',
            createdAt: { gte: startDate },
          },
        });

        return {
          id: client.id,
          name: client.name,
          waybillCount: waybills,
          deliveredCount,
        };
      })
    );

    return clientStats
      .sort((a, b) => b.waybillCount - a.waybillCount)
      .slice(0, 10);
  }

  // ============================================
  // DISPATCHER METRICS CALCULATIONS
  // ============================================

  private async calculateSLACompliance(companyId: number) {
    const waybills = await this.prisma.waybill.findMany({
      where: {
        companyId,
        status: 'DELIVERED',
        deliveredAt: { not: null },
      },
      select: {
        id: true,
        createdAt: true,
        deliveredAt: true,
      },
      take: 100, // Last 100 deliveries
    });

    let onTimeCount = 0;
    let lateCount = 0;

    waybills.forEach(w => {
      if (w.deliveredAt && w.createdAt) {
        const delivered = new Date(w.deliveredAt);
        const created = new Date(w.createdAt);
        const deliveryTimeHours = (delivered.getTime() - created.getTime()) / (1000 * 60 * 60);
        
        // Consider on-time if delivered within 24 hours (adjustable SLA)
        if (deliveryTimeHours <= 24) {
          onTimeCount++;
        } else {
          lateCount++;
        }
      }
    });

    const total = onTimeCount + lateCount;
    const onTimeRate = total > 0 ? (onTimeCount / total) * 100 : 0;

    return {
      onTimeRate: Math.round(onTimeRate * 10) / 10,
      onTimeDeliveries: onTimeCount,
      lateDeliveries: lateCount,
      totalDeliveries: total,
      slaTarget: 95, // Industry standard
      slaMet: onTimeRate >= 95,
    };
  }

  private async getActiveExceptions(companyId: number) {
    const exceptions = await this.prisma.waybill.findMany({
      where: {
        companyId,
        status: { in: ['EXCEPTION', 'FAILED'] },
      },
      select: {
        id: true,
        waybillNumber: true,
        status: true,
        receiverName: true,
        receiverPhone: true,
        origin: true,
        destination: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return {
      count: exceptions.length,
      exceptions,
    };
  }

  private async getOperationalVelocity(companyId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      pendingPickups,
      inTransit,
      deliveredToday,
      failedToday,
    ] = await Promise.all([
      this.prisma.waybill.count({
        where: { companyId, status: 'PENDING_COLLECTION' },
      }),
      this.prisma.waybill.count({
        where: { companyId, status: 'IN_TRANSIT' },
      }),
      this.prisma.waybill.count({
        where: {
          companyId,
          status: 'DELIVERED',
          deliveredAt: { gte: today },
        },
      }),
      this.prisma.waybill.count({
        where: {
          companyId,
          status: 'FAILED',
          updatedAt: { gte: today },
        },
      }),
    ]);

    return {
      pendingPickups,
      inTransit,
      deliveredToday,
      failedToday,
      successRate: (deliveredToday + failedToday) > 0
        ? Math.round((deliveredToday / (deliveredToday + failedToday)) * 100 * 10) / 10
        : 0,
    };
  }

  private async getZoneHeatmap(companyId: number) {
    const waybills = await this.prisma.waybill.findMany({
      where: { companyId },
      select: {
        origin: true,
        destination: true,
        status: true,
      },
      take: 500,
    });

    const zoneCounts: Record<string, { pickups: number; deliveries: number; failures: number }> = {};

    waybills.forEach(w => {
      if (w.origin) {
        if (!zoneCounts[w.origin]) {
          zoneCounts[w.origin] = { pickups: 0, deliveries: 0, failures: 0 };
        }
        zoneCounts[w.origin].pickups++;
      }
      if (w.destination) {
        if (!zoneCounts[w.destination]) {
          zoneCounts[w.destination] = { pickups: 0, deliveries: 0, failures: 0 };
        }
        zoneCounts[w.destination].deliveries++;
        if (w.status === 'FAILED') {
          zoneCounts[w.destination].failures++;
        }
      }
    });

    return Object.entries(zoneCounts).map(([zone, stats]) => ({
      zone,
      ...stats,
      totalActivity: stats.pickups + stats.deliveries,
    }));
  }

  private async getHubBottlenecks(companyId: number) {
    const collections = await this.prisma.collection.findMany({
      where: { companyId },
      include: {
        waybillsReal: {
          select: { status: true },
        },
      },
    });

    return collections.map(c => ({
      id: c.id,
      name: c.name,
      status: c.status,
      waybillCount: c.waybillsReal.length,
      pendingCount: c.waybillsReal.filter(w => w.status === 'PENDING_COLLECTION').length,
      inTransitCount: c.waybillsReal.filter(w => w.status === 'IN_TRANSIT').length,
    }));
  }

  private async getActiveDeliveries(companyId: number) {
    return this.prisma.waybill.findMany({
      where: {
        companyId,
        status: { in: ['IN_TRANSIT'] },
      },
      select: {
        id: true,
        waybillNumber: true,
        receiverName: true,
        receiverPhone: true,
        destination: true,
        status: true,
        driver: {
          select: {
            name: true,
            phone: true,
            lat: true,
            lng: true,
          },
        },
      },
      take: 50,
    });
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private getStartDate(period: '7d' | '30d' | '90d'): Date {
    const date = new Date();
    switch (period) {
      case '7d':
        date.setDate(date.getDate() - 7);
        break;
      case '30d':
        date.setDate(date.getDate() - 30);
        break;
      case '90d':
        date.setDate(date.getDate() - 90);
        break;
    }
    return date;
  }
}
