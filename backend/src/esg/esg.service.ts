import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

// SA vehicle emission factors (kg CO2 per km) — source: DEA National GHG Inventory
const EMISSION_FACTORS: Record<string, number> = {
  van: 0.21,        // light delivery van (diesel)
  truck: 0.29,      // medium truck
  motorbike: 0.08,  // motorcycle/scooter
  car: 0.17,        // sedan/hatchback
  electric: 0.0,    // BEV — zero tailpipe
};

@Injectable()
export class EsgService {
  private readonly logger = new Logger(EsgService.name);

  constructor(private prisma: PrismaService) {}

  /** Daily cron: recompute current month's carbon report for all active companies. */
  @Cron('0 6 * * *') // 06:00 daily
  async scheduledCompute() {
    try { await this.computeAll(); }
    catch (err) { this.logger.warn(`ESG compute failed: ${err}`); }
  }

  async computeAll() {
    const companies = await this.prisma.company.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    // Batch process companies (5 at a time) instead of sequential
    for (let i = 0; i < companies.length; i += 5) {
      const batch = companies.slice(i, i + 5);
      await Promise.allSettled(batch.map(c => this.computeForCompany(c.id)));
    }
  }

  async computeForCompany(companyId: string, period?: string) {
    const targetPeriod = period || this.currentPeriod();
    const { start, end } = this.periodRange(targetPeriod);

    // Count deliveries this period
    const totalDeliveries = await this.prisma.waybill.count({
      where: { companyId, status: 'DELIVERED', updatedAt: { gte: start, lt: end } },
    });

    // Use groupBy for fleet composition (DB-level aggregation, no unbounded fetch)
    const fleetGroups = await this.prisma.driver.groupBy({
      by: ['vehicleType'],
      where: { companyId, isActive: true },
      _count: { _all: true },
    });

    const fleet = { petrol: 0, diesel: 0, electric: 0, motorbike: 0 };
    let totalVehicles = 0;
    for (const entry of fleetGroups) {
      const vt = (entry.vehicleType || '').toLowerCase();
      const count = entry._count._all;
      totalVehicles += count;
      if (vt.includes('electric') || vt.includes('ev')) fleet.electric += count;
      else if (vt.includes('motorbike') || vt.includes('scooter') || vt.includes('bike')) fleet.motorbike += count;
      else if (vt.includes('truck') || vt.includes('van')) fleet.diesel += count;
      else fleet.petrol += count;
    }
    if (totalVehicles === 0) totalVehicles = 1;

    // Estimate total km from route data (avg 15km per delivery in SA metro areas)
    const avgKmPerDelivery = 15; // conservative SA metro estimate
    const totalKmDriven = totalDeliveries * avgKmPerDelivery;

    // Weighted emission factor based on fleet mix
    const weightedFactor =
      (fleet.diesel * EMISSION_FACTORS.van +
       fleet.petrol * EMISSION_FACTORS.car +
       fleet.motorbike * EMISSION_FACTORS.motorbike +
       fleet.electric * EMISSION_FACTORS.electric) / totalVehicles;

    const co2PerKm = weightedFactor || 0.18; // fallback if no fleet data
    const totalCo2Kg = Math.round(totalKmDriven * co2PerKm * 100) / 100;
    const co2PerDelivery = totalDeliveries > 0 ? Math.round((totalCo2Kg / totalDeliveries) * 100) / 100 : 0;

    // Previous period for comparison
    const prevPeriod = this.prevPeriod(targetPeriod);
    const prev = await this.prisma.carbonReport.findUnique({
      where: { companyId_period: { companyId, period: prevPeriod } },
    });
    const changePercent = prev && prev.totalCo2Kg > 0
      ? Math.round(((totalCo2Kg - prev.totalCo2Kg) / prev.totalCo2Kg) * 100)
      : null;

    const data = {
      totalKmDriven,
      totalDeliveries,
      avgKmPerDelivery,
      totalCo2Kg,
      co2PerDelivery,
      co2PerKm,
      petrolVehicles: fleet.petrol,
      dieselVehicles: fleet.diesel,
      electricVehicles: fleet.electric,
      motorbikeCount: fleet.motorbike,
      offsetKg: 0,
      netEmissionsKg: totalCo2Kg,
      prevPeriodCo2Kg: prev?.totalCo2Kg ?? null,
      changePercent,
    };

    return this.prisma.carbonReport.upsert({
      where: { companyId_period: { companyId, period: targetPeriod } },
      create: { companyId, period: targetPeriod, ...data },
      update: data,
    });
  }

  async getReport(companyId: string, period?: string) {
    const targetPeriod = period || this.currentPeriod();
    let report = await this.prisma.carbonReport.findUnique({
      where: { companyId_period: { companyId, period: targetPeriod } },
    });
    if (!report) {
      report = await this.computeForCompany(companyId, targetPeriod);
    }
    return report;
  }

  async getTrends(companyId: string) {
    const periods = this.lastNPeriods(6);
    const reports = await this.prisma.carbonReport.findMany({
      where: { companyId, period: { in: periods } },
      orderBy: { period: 'asc' },
    });
    return periods.map(p => reports.find(r => r.period === p) || { period: p, totalCo2Kg: 0, totalDeliveries: 0, co2PerDelivery: 0 });
  }

  // Helpers
  private currentPeriod() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`; }
  private prevPeriod(period: string) { const [y,m] = period.split('-').map(Number); const d = new Date(y, m-2, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
  private lastNPeriods(n: number) { const ps: string[] = []; const now = new Date(); for (let i=n-1;i>=0;i--) { const d = new Date(now.getFullYear(), now.getMonth()-i, 1); ps.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`); } return ps; }
  private periodRange(period: string) { const [y,m] = period.split('-').map(Number); return { start: new Date(y,m-1,1), end: new Date(y,m,1) }; }
}
