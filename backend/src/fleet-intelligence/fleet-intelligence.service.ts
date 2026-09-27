import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Fleet Intelligence — Tactical Network Balancing AI
 *
 * Analyzes medium-term delivery flows, zone demand patterns, driver workloads,
 * idle fleet detection, and capacity forecasting. Produces actionable
 * recommendations for fleet repositioning BEFORE imbalances impact service.
 *
 * This is FlowOps' answer to "NetworkFlow AI" — except it actually executes,
 * not just recommends.
 *
 * Analyses (runs daily at 05:00 + on-demand):
 *   1. Zone Demand Heatmap — which areas are generating the most collections/waybills
 *   2. Driver Utilization — stops/day, deliveries/week, efficiency scores
 *   3. Idle Fleet Detection — drivers with < threshold deliveries in N days
 *   4. Capacity Forecast — based on growth rate, when you'll need more drivers
 *   5. Branch Balancing — workload distribution across branches/depots
 *   6. Pre-positioning — where each driver should START based on demand patterns
 *   7. Repositioning Recommendations — move resources from low→high demand zones
 */
@Injectable()
export class FleetIntelligenceService {
  private readonly logger = new Logger('FLEET_INTELLIGENCE');

  constructor(private readonly prisma: PrismaService) {}

  // ── Scheduled daily analysis ────────────────────────────────────────────────
  @Cron('0 5 * * *') // Every day at 05:00
  async dailySweep() {
    this.logger.log('🧠 Fleet Intelligence: Starting daily network analysis...');
    const companies = await this.prisma.company.findMany({ select: { id: true } });
    for (const co of companies) {
      try {
        await this.generateReport(co.id);
      } catch (e: any) {
        this.logger.warn(`Fleet Intel failed for ${co.id}: ${e?.message}`);
      }
    }
    this.logger.log('✅ Fleet Intelligence: Daily sweep complete.');
  }

  // ── Full Report ─────────────────────────────────────────────────────────────

  async generateReport(companyId: string) {
    const [zones, drivers, idle, forecast, branches, repositioning] = await Promise.all([
      this.analyzeZoneDemand(companyId),
      this.analyzeDriverUtilization(companyId),
      this.detectIdleFleet(companyId),
      this.forecastCapacity(companyId),
      this.analyzeBranchBalance(companyId),
      this.generateRepositioningRecommendations(companyId),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      companyId,
      zones,
      drivers,
      idle,
      forecast,
      branches,
      repositioning,
      networkHealthScore: this.calculateNetworkHealth(zones, drivers, idle, branches),
    };
  }

  // ── 1. Zone Demand Heatmap ──────────────────────────────────────────────────

  async analyzeZoneDemand(companyId: string) {
    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * 86_400_000);
    const d60 = new Date(now.getTime() - 60 * 86_400_000);

    // Get all waybills from last 30 days with addresses
    const recent = await this.prisma.waybill.findMany({
      where: { companyId, createdAt: { gte: d30 } },
      select: { recipientAddress: true, senderAddress: true, createdAt: true, status: true },
    });

    // Get previous 30 days for trend comparison
    const previous = await this.prisma.waybill.findMany({
      where: { companyId, createdAt: { gte: d60, lt: d30 } },
      select: { recipientAddress: true, senderAddress: true },
    });

    // Extract city/zone from addresses
    const zoneMap = new Map<string, { pickups: number; deliveries: number; total: number }>();
    const prevZoneMap = new Map<string, number>();

    for (const wb of recent) {
      const pickupZone = this.extractZone(wb.senderAddress);
      const deliveryZone = this.extractZone(wb.recipientAddress);

      if (pickupZone) {
        const z = zoneMap.get(pickupZone) ?? { pickups: 0, deliveries: 0, total: 0 };
        z.pickups++;
        z.total++;
        zoneMap.set(pickupZone, z);
      }
      if (deliveryZone) {
        const z = zoneMap.get(deliveryZone) ?? { pickups: 0, deliveries: 0, total: 0 };
        z.deliveries++;
        z.total++;
        zoneMap.set(deliveryZone, z);
      }
    }

    for (const wb of previous) {
      const zone = this.extractZone(wb.recipientAddress) || this.extractZone(wb.senderAddress);
      if (zone) prevZoneMap.set(zone, (prevZoneMap.get(zone) ?? 0) + 1);
    }

    // Build zone array with growth trends
    const zones = [...zoneMap.entries()]
      .map(([zone, data]) => {
        const prevCount = prevZoneMap.get(zone) ?? 0;
        const growthPct = prevCount > 0
          ? Math.round(((data.total - prevCount) / prevCount) * 100)
          : data.total > 0 ? 100 : 0;
        return { zone, ...data, growthPct, trend: growthPct > 20 ? 'SURGING' : growthPct > 0 ? 'GROWING' : growthPct < -20 ? 'DECLINING' : 'STABLE' };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);

    const hotZones = zones.filter(z => z.trend === 'SURGING');
    const coldZones = zones.filter(z => z.trend === 'DECLINING');

    return {
      totalZones: zones.length,
      zones,
      hotZones,
      coldZones,
      concentration: zones.length > 0
        ? Math.round((zones[0]?.total / zones.reduce((s, z) => s + z.total, 0)) * 100)
        : 0,
      insight: hotZones.length > 0
        ? `${hotZones.map(z => z.zone).join(', ')} ${hotZones.length === 1 ? 'is' : 'are'} surging — consider pre-positioning drivers there.`
        : 'Demand is evenly distributed. No immediate rebalancing needed.',
    };
  }

  // ── 2. Driver Utilization ───────────────────────────────────────────────────

  async analyzeDriverUtilization(companyId: string) {
    const now = new Date();
    const d7 = new Date(now.getTime() - 7 * 86_400_000);
    const d30 = new Date(now.getTime() - 30 * 86_400_000);

    const drivers = await this.prisma.driver.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true, phone: true, vehicleType: true, status: true },
    });

    const shipments7d = await this.prisma.shipment.findMany({
      where: { companyId, createdAt: { gte: d7 } },
      select: { driverId: true, status: true, createdAt: true, deliveredAt: true },
    });

    const shipments30d = await this.prisma.shipment.findMany({
      where: { companyId, createdAt: { gte: d30 } },
      select: { driverId: true, status: true },
    });

    const driverStats = drivers.map(driver => {
      const week = shipments7d.filter(s => s.driverId === driver.id);
      const month = shipments30d.filter(s => s.driverId === driver.id);
      const delivered7d = week.filter(s => s.status === 'DELIVERED').length;
      const delivered30d = month.filter(s => s.status === 'DELIVERED').length;
      const avgPerDay = Math.round((delivered7d / 7) * 10) / 10;
      const failed = month.filter(s => s.status === 'FAILED').length;
      const successRate = month.length > 0 ? Math.round(((month.length - failed) / month.length) * 100) : 100;

      // Utilization score: 0-100 based on deliveries vs expected (target: 8/day)
      const TARGET_PER_DAY = 8;
      const utilization = Math.min(100, Math.round((avgPerDay / TARGET_PER_DAY) * 100));

      return {
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        vehicleType: driver.vehicleType,
        status: driver.status,
        delivered7d,
        delivered30d,
        avgPerDay,
        successRate,
        utilization,
        rating: utilization >= 80 ? 'HIGH' : utilization >= 40 ? 'MEDIUM' : 'LOW',
      };
    }).sort((a, b) => b.utilization - a.utilization);

    const avgUtilization = driverStats.length > 0
      ? Math.round(driverStats.reduce((s, d) => s + d.utilization, 0) / driverStats.length)
      : 0;

    return {
      totalDrivers: driverStats.length,
      avgUtilization,
      highPerformers: driverStats.filter(d => d.rating === 'HIGH').length,
      mediumPerformers: driverStats.filter(d => d.rating === 'MEDIUM').length,
      lowPerformers: driverStats.filter(d => d.rating === 'LOW').length,
      drivers: driverStats,
      insight: avgUtilization < 40
        ? 'Fleet is significantly underutilized. Consider reducing fleet size or acquiring more clients.'
        : avgUtilization > 85
          ? 'Fleet is near capacity. Consider hiring additional drivers before service quality drops.'
          : 'Fleet utilization is healthy. Monitor high-growth zones for potential bottlenecks.',
    };
  }

  // ── 3. Idle Fleet Detection ─────────────────────────────────────────────────

  async detectIdleFleet(companyId: string) {
    const now = new Date();
    const d3 = new Date(now.getTime() - 3 * 86_400_000);
    const d7 = new Date(now.getTime() - 7 * 86_400_000);

    const drivers = await this.prisma.driver.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true, phone: true, vehicleType: true },
    });

    const recentShipments = await this.prisma.shipment.findMany({
      where: { companyId, createdAt: { gte: d7 } },
      select: { driverId: true, createdAt: true },
    });

    const idle: Array<{ id: string; name: string; phone: string | null; vehicleType: string | null; lastDeliveryDaysAgo: number; severity: string }> = [];

    for (const driver of drivers) {
      const driverShipments = recentShipments
        .filter(s => s.driverId === driver.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const recentCount = driverShipments.filter(s => new Date(s.createdAt) >= d3).length;

      if (recentCount === 0) {
        const lastShipment = driverShipments[0];
        const daysAgo = lastShipment
          ? Math.floor((now.getTime() - new Date(lastShipment.createdAt).getTime()) / 86_400_000)
          : 999;

        idle.push({
          id: driver.id,
          name: driver.name,
          phone: driver.phone,
          vehicleType: driver.vehicleType,
          lastDeliveryDaysAgo: daysAgo,
          severity: daysAgo > 7 ? 'CRITICAL' : daysAgo > 3 ? 'WARNING' : 'MONITOR',
        });
      }
    }

    idle.sort((a, b) => b.lastDeliveryDaysAgo - a.lastDeliveryDaysAgo);

    const costPerIdleDay = 850; // R850/day estimated cost (fuel, insurance, depreciation)
    const wastedCapital = idle.reduce((s, d) => s + Math.min(d.lastDeliveryDaysAgo, 30) * costPerIdleDay, 0);

    return {
      idleCount: idle.length,
      totalDrivers: drivers.length,
      idleRatePct: drivers.length > 0 ? Math.round((idle.length / drivers.length) * 100) : 0,
      estimatedWaste: Math.round(wastedCapital),
      drivers: idle,
      insight: idle.length === 0
        ? 'No idle fleet detected. All drivers active in the last 72 hours.'
        : `${idle.length} driver${idle.length === 1 ? '' : 's'} idle for 3+ days. Estimated waste: R${Math.round(wastedCapital).toLocaleString()}. Reassign to high-demand zones or reduce fleet.`,
    };
  }

  // ── 4. Capacity Forecast ────────────────────────────────────────────────────

  async forecastCapacity(companyId: string) {
    const now = new Date();
    const months: Array<{ month: string; count: number }> = [];

    // Get last 6 months of waybill counts
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const count = await this.prisma.waybill.count({
        where: { companyId, createdAt: { gte: start, lt: end } },
      });
      months.push({
        month: start.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short' }),
        count,
      });
    }

    // Calculate growth rate (simple linear regression)
    const counts = months.map(m => m.count);
    const n = counts.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = counts.reduce((s, v) => s + v, 0);
    const sumXY = counts.reduce((s, v, i) => s + i * v, 0);
    const sumXX = counts.reduce((s, _, i) => s + i * i, 0);
    const slope = n > 1 ? (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX) : 0;
    const avgMonthly = sumY / n;
    const monthlyGrowthRate = avgMonthly > 0 ? slope / avgMonthly : 0;

    // Current capacity
    const activeDrivers = await this.prisma.driver.count({ where: { companyId, isActive: true } });
    const TARGET_PER_DRIVER_PER_MONTH = 160; // 8/day × 20 working days
    const currentCapacity = activeDrivers * TARGET_PER_DRIVER_PER_MONTH;
    const currentLoad = counts[counts.length - 1] ?? 0;
    const capacityUsedPct = currentCapacity > 0 ? Math.round((currentLoad / currentCapacity) * 100) : 0;

    // Forecast: when will you hit 90% capacity?
    let monthsUntilCapacity: number | null = null;
    if (slope > 0 && currentCapacity > 0) {
      const threshold = currentCapacity * 0.9;
      const remaining = threshold - currentLoad;
      monthsUntilCapacity = remaining > 0 ? Math.ceil(remaining / slope) : 0;
    }

    // Projected next 3 months
    const forecast = [1, 2, 3].map(i => ({
      month: new Date(now.getFullYear(), now.getMonth() + i, 1)
        .toLocaleDateString('en-ZA', { year: 'numeric', month: 'short' }),
      projected: Math.round(currentLoad + slope * i),
      capacityPct: currentCapacity > 0 ? Math.round(((currentLoad + slope * i) / currentCapacity) * 100) : 0,
    }));

    // Hiring recommendation
    const driversNeeded3mo = forecast[2].capacityPct > 90
      ? Math.ceil((forecast[2].projected - currentCapacity * 0.8) / TARGET_PER_DRIVER_PER_MONTH)
      : 0;

    return {
      history: months,
      currentLoad,
      currentCapacity,
      capacityUsedPct,
      activeDrivers,
      monthlyGrowthRate: Math.round(monthlyGrowthRate * 1000) / 10, // as percentage
      monthsUntilCapacity,
      forecast,
      driversNeeded3mo: Math.max(0, driversNeeded3mo),
      insight: monthsUntilCapacity !== null && monthsUntilCapacity <= 2
        ? `⚠️ Fleet will hit 90% capacity in ${monthsUntilCapacity} month${monthsUntilCapacity === 1 ? '' : 's'}. Hire ${driversNeeded3mo} driver${driversNeeded3mo === 1 ? '' : 's'} NOW to maintain service quality.`
        : capacityUsedPct > 80
          ? `Fleet at ${capacityUsedPct}% capacity. Monitor closely — consider hiring soon.`
          : monthlyGrowthRate > 0.15
            ? `Strong growth (${Math.round(monthlyGrowthRate * 100)}%/month). At this rate you'll need more drivers within ${monthsUntilCapacity ?? '6+'} months.`
            : 'Capacity is comfortable. No immediate hiring needed.',
    };
  }

  // ── 5. Branch Balancing ─────────────────────────────────────────────────────

  async analyzeBranchBalance(companyId: string) {
    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * 86_400_000);

    const branches = await this.prisma.branch.findMany({
      where: { companyId },
      select: { id: true, name: true, city: true },
    });

    if (branches.length === 0) {
      return {
        branchCount: 0,
        branches: [],
        imbalanceScore: 0,
        insight: 'Single-branch operation. Branch balancing not applicable.',
      };
    }

    const waybills = await this.prisma.waybill.findMany({
      where: { companyId, createdAt: { gte: d30 } },
      select: { originBranchId: true, status: true },
    });

    const branchStats = branches.map(branch => {
      const branchWaybills = waybills.filter(w => w.originBranchId === branch.id);
      const delivered = branchWaybills.filter(w => w.status === 'DELIVERED').length;
      return {
        id: branch.id,
        name: branch.name,
        city: branch.city,
        totalWaybills: branchWaybills.length,
        delivered,
        load: branchWaybills.length,
      };
    });

    const totalLoad = branchStats.reduce((s, b) => s + b.load, 0);
    const avgLoad = totalLoad / Math.max(branchStats.length, 1);
    const maxLoad = Math.max(...branchStats.map(b => b.load), 0);
    const minLoad = Math.min(...branchStats.map(b => b.load), 0);

    // Imbalance score: 0 = perfectly balanced, 100 = extremely imbalanced
    const imbalanceScore = avgLoad > 0
      ? Math.min(100, Math.round(((maxLoad - minLoad) / avgLoad) * 50))
      : 0;

    const overloaded = branchStats.filter(b => b.load > avgLoad * 1.5);
    const underloaded = branchStats.filter(b => b.load < avgLoad * 0.5);

    return {
      branchCount: branches.length,
      branches: branchStats.sort((a, b) => b.load - a.load),
      avgLoad: Math.round(avgLoad),
      imbalanceScore,
      overloaded,
      underloaded,
      insight: imbalanceScore > 60
        ? `Network imbalanced! ${overloaded.map(b => b.name).join(', ')} at ${Math.round((maxLoad / avgLoad) * 100)}% of average load. Redistribute ${underloaded.length} underutilized branch${underloaded.length === 1 ? '' : 'es'}.`
        : imbalanceScore > 30
          ? 'Moderate imbalance detected. Some branches are handling significantly more volume.'
          : 'Network is well-balanced across branches.',
    };
  }

  // ── 6. Repositioning Recommendations ────────────────────────────────────────

  async generateRepositioningRecommendations(companyId: string) {
    const [zones, drivers, idle] = await Promise.all([
      this.analyzeZoneDemand(companyId),
      this.analyzeDriverUtilization(companyId),
      this.detectIdleFleet(companyId),
    ]);

    const recommendations: Array<{
      type: 'REPOSITION' | 'HIRE' | 'REDUCE' | 'REASSIGN' | 'PREPOSITION';
      priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
      title: string;
      description: string;
      impact: string;
    }> = [];

    // Recommend repositioning idle drivers to hot zones
    if (idle.idleCount > 0 && zones.hotZones.length > 0) {
      for (const idleDriver of idle.drivers.slice(0, 3)) {
        const hotZone = zones.hotZones[0];
        recommendations.push({
          type: 'REPOSITION',
          priority: idleDriver.severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
          title: `Move ${idleDriver.name} to ${hotZone.zone}`,
          description: `${idleDriver.name} has been idle for ${idleDriver.lastDeliveryDaysAgo} days. ${hotZone.zone} demand is surging (+${hotZone.growthPct}%). Reassign immediately.`,
          impact: `Save ~R${(idleDriver.lastDeliveryDaysAgo * 850).toLocaleString()} in idle costs + capture demand in ${hotZone.zone}`,
        });
      }
    }

    // Pre-positioning based on demand concentration
    if (zones.concentration > 40) {
      const topZone = zones.zones[0];
      recommendations.push({
        type: 'PREPOSITION',
        priority: 'MEDIUM',
        title: `Pre-position 60% of fleet near ${topZone?.zone ?? 'top zone'}`,
        description: `${zones.concentration}% of demand originates from ${topZone?.zone}. Drivers starting nearby reduce empty miles and improve first-pickup speed.`,
        impact: 'Faster pickups, reduced fuel, higher customer satisfaction',
      });
    }

    // Hiring recommendations
    if (drivers.avgUtilization > 85) {
      recommendations.push({
        type: 'HIRE',
        priority: 'HIGH',
        title: 'Fleet at capacity — hire additional drivers',
        description: `Average utilization is ${drivers.avgUtilization}%. Service quality will degrade if volume increases without additional capacity.`,
        impact: 'Prevent delivery failures and maintain SLA',
      });
    }

    // Fleet reduction
    if (idle.idleRatePct > 40) {
      recommendations.push({
        type: 'REDUCE',
        priority: 'MEDIUM',
        title: 'Consider fleet reduction',
        description: `${idle.idleRatePct}% of fleet is idle. If demand doesn't justify current fleet size, reduce to cut fixed costs.`,
        impact: `Save ~R${idle.estimatedWaste.toLocaleString()}/month in idle vehicle costs`,
      });
    }

    // Cold zone warning
    for (const cold of zones.coldZones.slice(0, 2)) {
      recommendations.push({
        type: 'REASSIGN',
        priority: 'LOW',
        title: `Reduce focus on ${cold.zone}`,
        description: `${cold.zone} demand declining (${cold.growthPct}%). Consider reassigning drivers from this area to growing zones.`,
        impact: 'Better resource allocation',
      });
    }

    return {
      count: recommendations.length,
      recommendations: recommendations.sort((a, b) => {
        const pri = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return (pri[a.priority] ?? 4) - (pri[b.priority] ?? 4);
      }),
      insight: recommendations.length === 0
        ? 'Network is optimally balanced. No repositioning needed.'
        : `${recommendations.filter(r => r.priority === 'CRITICAL' || r.priority === 'HIGH').length} high-priority actions identified.`,
    };
  }

  // ── Network Health Score ────────────────────────────────────────────────────

  private calculateNetworkHealth(zones: any, drivers: any, idle: any, branches: any): number {
    let score = 100;

    // Penalize for idle fleet
    score -= Math.min(30, idle.idleRatePct * 0.6);

    // Penalize for low utilization
    if (drivers.avgUtilization < 40) score -= 20;
    else if (drivers.avgUtilization < 60) score -= 10;

    // Penalize for branch imbalance
    score -= Math.min(20, (branches.imbalanceScore ?? 0) * 0.2);

    // Penalize for over-concentration
    if (zones.concentration > 60) score -= 10;

    // Bonus for high utilization
    if (drivers.avgUtilization > 75 && idle.idleCount === 0) score += 5;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private extractZone(address?: string | null): string | null {
    if (!address) return null;
    // Extract city/suburb from address — last meaningful segment
    const parts = address.split(',').map(s => s.trim()).filter(Boolean);
    // Prefer the last or second-to-last part (usually city)
    if (parts.length >= 2) return parts[parts.length - 1];
    if (parts.length === 1) return parts[0];
    return null;
  }
}
