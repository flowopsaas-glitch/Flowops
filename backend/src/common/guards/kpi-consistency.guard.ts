import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * PRODUCTION FIX (2026-10-07):
 * KPI Consistency Guard — Reliable Dashboard Metrics
 * 
 * Ensures KPI calculations are consistent, resilient to partial data, and audit-friendly.
 * All dashboard queries MUST use this guard to ensure correctness.
 */

@Injectable()
export class KpiConsistencyGuard {
  private readonly logger = new Logger('KPI_GUARD');

  constructor(private prisma: PrismaService) {}

  /**
   * Safe on-time percentage calculation.
   * Filters to only arrived+planned consignments to prevent skewed results.
   */
  async onTimePercentage(companyId: string, limit = 1000): Promise<{ percentage: number | null; count: number }> {
    const rows = await this.prisma.railConsignment.findMany({
      where: {
        companyId,
        actualArrival: { not: null },
        plannedArrival: { not: null },
      },
      select: { actualArrival: true, plannedArrival: true },
      take: limit,
    });

    if (rows.length === 0) return { percentage: null, count: 0 };

    const onTime = rows.filter(
      (c) => c.actualArrival!.getTime() <= c.plannedArrival!.getTime(),
    );

    return {
      percentage: Math.round((onTime.length / rows.length) * 100),
      count: rows.length,
    };
  }

  /**
   * Safe average transit time calculation.
   * Only includes consignments with both departure and arrival times.
   */
  async avgTransitHours(companyId: string, limit = 1000): Promise<{ hours: number | null; count: number }> {
    const rows = await this.prisma.railConsignment.findMany({
      where: {
        companyId,
        actualDeparture: { not: null },
        actualArrival: { not: null },
      },
      select: { actualDeparture: true, actualArrival: true },
      take: limit,
    });

    if (rows.length === 0) return { hours: null, count: 0 };

    const totalHours = rows.reduce(
      (s, c) => s + (c.actualArrival!.getTime() - c.actualDeparture!.getTime()) / 3_600_000,
      0,
    );

    return {
      hours: Math.round(totalHours / rows.length),
      count: rows.length,
    };
  }

  /**
   * Safe dwell hours calculation (interchange time).
   * Only includes legs with recorded dwell, filters outliers.
   */
  async avgDwellHours(companyId: string): Promise<{ hours: number | null; count: number }> {
    const agg = await this.prisma.intermodalLeg.aggregate({
      where: {
        dwellHours: { not: null, lte: 120 }, // Filter outliers (>5 days unrealistic)
        consignment: { companyId },
      },
      _avg: { dwellHours: true },
      _count: { _all: true },
    });

    return {
      hours: agg._avg.dwellHours != null ? Math.round(agg._avg.dwellHours * 10) / 10 : null,
      count: agg._count._all,
    };
  }
}
