import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { GROQ_MODEL } from '../ai/groq-model';
import { Money } from '../common/money.util';

@Injectable()
export class LogisticsAnalyticsService {
  private readonly logger = new Logger(LogisticsAnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Returns the analytics snapshot for a given period (defaults to current month).
   * If no snapshot exists yet, computes one on-the-fly.
   */
  async getAnalytics(companyId: string, period?: string) {
    const targetPeriod = period || this.currentPeriod();

    let snapshot = await this.prisma.logisticsAnalytics.findUnique({
      where: { companyId_period: { companyId, period: targetPeriod } },
    });

    if (!snapshot) {
      snapshot = await this.computeAndStore(companyId, targetPeriod);
    }

    return snapshot;
  }

  /**
   * Returns trend data for the last 6 months.
   */
  async getTrends(companyId: string) {
    const periods = this.lastNPeriods(6);

    const snapshots = await this.prisma.logisticsAnalytics.findMany({
      where: { companyId, period: { in: periods } },
      orderBy: { period: 'asc' },
    });

    // Fill gaps with zero-value entries for consistent charting
    return periods.map((p) => {
      const existing = snapshots.find((s) => s.period === p);
      return existing || { period: p, totalDeliveries: 0, onTimePercentage: 0, revenue: 0, slaBreaches: 0, failedDeliveries: 0 };
    });
  }

  /**
   * Force-recalculates current period analytics + regenerates AI insights.
   */
  async refreshAnalytics(companyId: string) {
    const period = this.currentPeriod();
    return this.computeAndStore(companyId, period);
  }

  // ════════════════════════════════════════════════════════════════════════
  // PRIVATE
  // ════════════════════════════════════════════════════════════════════════

  private async computeAndStore(companyId: string, period: string) {
    const { start, end } = this.periodRange(period);

    // ── Volume KPIs ─────────────────────────────────────────────────────
    const [totalDeliveries, deliveredOnTime, failedDeliveries, returnedParcels, totalCollections] =
      await Promise.all([
        this.prisma.waybill.count({
          where: { companyId, createdAt: { gte: start, lt: end } },
        }),
        this.prisma.waybill.count({
          where: { companyId, status: 'DELIVERED', createdAt: { gte: start, lt: end } },
        }),
        this.prisma.waybill.count({
          where: { companyId, status: 'FAILED_DELIVERY', createdAt: { gte: start, lt: end } },
        }),
        this.prisma.waybill.count({
          where: { companyId, status: 'RETURNED', createdAt: { gte: start, lt: end } },
        }),
        this.prisma.collection.count({
          where: { companyId, createdAt: { gte: start, lt: end } },
        }),
      ]);

    // ── Performance KPIs ────────────────────────────────────────────────
    // Owner-approved semantics (2026-10-20): this is a Delivery Completion
    // Rate — delivered waybills / waybills created in period — NOT an
    // on-time-vs-promised-time measure. API field name kept for compatibility;
    // do not relabel as on-time in any client.
    const onTimePercentage = totalDeliveries > 0
      ? Math.round((deliveredOnTime / totalDeliveries) * 10000) / 100
      : 0;

    const slaBreaches = await this.prisma.waybill.count({
      where: {
        companyId,
        riskLevel: { in: ['HIGH', 'CRITICAL'] },
        createdAt: { gte: start, lt: end },
      },
    });

    // Average customer rating for deliveries this period
    const ratingAgg = await this.prisma.waybill.aggregate({
      where: { companyId, customerRating: { not: null }, createdAt: { gte: start, lt: end } },
      _avg: { customerRating: true },
    });
    const customerRatingAvg = ratingAgg._avg.customerRating
      ? Math.round(ratingAgg._avg.customerRating * 100) / 100
      : null;

    // ── Financial KPIs ──────────────────────────────────────────────────
    const revenueAgg = await this.prisma.invoice.aggregate({
      where: { companyId, status: 'PAID', paidAt: { gte: start, lt: end } },
      _sum: { total: true },
    });
    const revenue = revenueAgg._sum.total || 0;

    const costPerDelivery = totalDeliveries > 0
      ? Money.round(revenue / totalDeliveries)
      : null;

    const codAgg = await this.prisma.waybill.aggregate({
      where: { companyId, codCollected: true, codCollectedAt: { gte: start, lt: end } },
      _sum: { codAmount: true },
    });
    const codCollected = codAgg._sum.codAmount || 0;

    // ── Fleet KPIs ──────────────────────────────────────────────────────
    const activeDrivers = await this.prisma.driver.count({
      where: { companyId, isActive: true },
    });

    // ── AI Insights (Groq — best-effort) ────────────────────────────────
    const aiInsights = await this.generateAiInsights({
      period,
      totalDeliveries,
      deliveredOnTime,
      failedDeliveries,
      returnedParcels,
      onTimePercentage,
      slaBreaches,
      customerRatingAvg,
      revenue,
      codCollected,
      activeDrivers,
    });

    // ── Upsert snapshot ─────────────────────────────────────────────────
    const data = {
      totalDeliveries,
      deliveredOnTime,
      failedDeliveries,
      returnedParcels,
      totalCollections,
      onTimePercentage,
      avgDeliveryMinutes: await this.computeAvgDeliveryMinutes(companyId, start, end),
      slaBreaches,
      customerRatingAvg,
      revenue,
      costPerDelivery,
      codCollected,
      activeDrivers,
      avgDriverUtilPct: await this.computeDriverUtilization(companyId, activeDrivers, start, end),
      topDriverId: await this.computeTopDriver(companyId, start, end),
      aiInsights,
      aiGeneratedAt: aiInsights ? new Date() : null,
    };

    return this.prisma.logisticsAnalytics.upsert({
      where: { companyId_period: { companyId, period } },
      create: { companyId, period, ...data },
      update: data,
    });
  }

  /**
   * Calls Groq to generate AI-powered narrative insights from the raw metrics.
   * Falls back gracefully to null when GROQ_API_KEY is not configured.
   */
  private async generateAiInsights(metrics: Record<string, any>): Promise<any | null> {
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    if (!apiKey) {
      this.logger.warn('GROQ_API_KEY not set — skipping AI insights generation.');
      return null;
    }

    const prompt = `You are a logistics analytics AI for a South African courier company using FlowOps.
Analyse the following delivery performance metrics for period ${metrics.period} and provide:
1. A concise executive summary (2-3 sentences)
2. Top 3 trends (positive or negative)
3. Top 3 actionable recommendations to improve operations

Metrics:
- Total deliveries: ${metrics.totalDeliveries}
- Delivered on time: ${metrics.deliveredOnTime}
- Failed deliveries: ${metrics.failedDeliveries}
- Returned parcels: ${metrics.returnedParcels}
- On-time %: ${metrics.onTimePercentage}%
- SLA breaches (high/critical risk): ${metrics.slaBreaches}
- Customer rating avg: ${metrics.customerRatingAvg ?? 'N/A'}
- Revenue (ZAR): R${metrics.revenue.toLocaleString()}
- COD collected (ZAR): R${metrics.codCollected.toLocaleString()}
- Active drivers: ${metrics.activeDrivers}

Return ONLY valid JSON in this format:
{
  "summary": "...",
  "trends": ["...", "...", "..."],
  "recommendations": ["...", "...", "..."]
}`;

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 600,
        }),
      });

      if (!res.ok) {
        this.logger.error(`Groq API returned ${res.status} for logistics insights.`);
        return null;
      }

      const body: any = await res.json();
      const content = body?.choices?.[0]?.message?.content;
      if (!content) return null;

      // Parse the JSON response from the AI
      const parsed = JSON.parse(content.trim());
      return parsed;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Failed to generate AI logistics insights: ${msg}`);
      return null;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private async computeAvgDeliveryMinutes(companyId: string, start: Date, end: Date): Promise<number | null> {
    const delivered = await this.prisma.waybill.findMany({
      where: { companyId, status: 'DELIVERED', podDeliveredAt: { not: null }, createdAt: { gte: start, lt: end } },
      select: { createdAt: true, podDeliveredAt: true },
    });
    if (delivered.length === 0) return null;
    const totalMin = delivered.reduce((sum, w) => sum + (new Date(w.podDeliveredAt!).getTime() - new Date(w.createdAt).getTime()) / 60000, 0);
    return Math.round(totalMin / delivered.length);
  }

  private async computeDriverUtilization(companyId: string, activeDrivers: number, start: Date, end: Date): Promise<number | null> {
    if (activeDrivers === 0) return null;
    const driversWithShipments = await this.prisma.shipment.groupBy({
      by: ['driverId'],
      where: { companyId, driverId: { not: null }, createdAt: { gte: start, lt: end } },
    });
    return Math.round((driversWithShipments.length / activeDrivers) * 10000) / 100;
  }

  private async computeTopDriver(companyId: string, start: Date, end: Date): Promise<string | null> {
    const top = await this.prisma.shipment.groupBy({
      by: ['driverId'],
      where: { companyId, status: 'DELIVERED', driverId: { not: null }, createdAt: { gte: start, lt: end } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 1,
    });
    return top.length > 0 && top[0].driverId ? top[0].driverId : null;
  }

  private currentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private lastNPeriods(n: number): string[] {
    const periods: string[] = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return periods;
  }

  private periodRange(period: string): { start: Date; end: Date } {
    const [year, month] = period.split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    return { start, end };
  }
}
