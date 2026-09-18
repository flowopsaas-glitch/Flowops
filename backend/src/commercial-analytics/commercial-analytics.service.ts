import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { GROQ_MODEL } from '../ai/groq-model';

@Injectable()
export class CommercialAnalyticsService {
  private readonly logger = new Logger(CommercialAnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}


  // ═══════════════════════════════════════════════════════════════════════
  // COMMERCIAL CONFIG (cost model parameters)
  // ═══════════════════════════════════════════════════════════════════════

  async getConfig(companyId: string) {
    let cfg = await this.prisma.commercialConfig.findUnique({
      where: { companyId },
    });
    if (!cfg) {
      cfg = await this.prisma.commercialConfig.create({
        data: { companyId },
      });
    }
    return cfg;
  }

  async updateConfig(companyId: string, dto: any) {
    return this.prisma.commercialConfig.upsert({
      where: { companyId },
      create: { companyId, ...dto },
      update: dto,
    });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // PROFITABILITY DASHBOARD — the heart of commercial analytics
  // ═══════════════════════════════════════════════════════════════════════

  async getProfitabilityDashboard(companyId: string, period?: string) {
    const targetPeriod = period || this.currentPeriod();
    const cfg = await this.getConfig(companyId);
    const { start, end } = this.periodRange(targetPeriod);
    const prevPeriod = this.prevPeriod(targetPeriod);
    const { start: prevStart, end: prevEnd } = this.periodRange(prevPeriod);

    // Current period metrics
    const [waybills, invoiceAgg, prevInvoiceAgg] = await Promise.all([
      this.prisma.waybill.findMany({
        where: { companyId, status: 'DELIVERED', createdAt: { gte: start, lt: end } },
        select: {
          id: true, totalAmount: true, senderAddress: true,
          recipientAddress: true, weight: true, createdAt: true,
        },
      }),
      this.prisma.invoice.aggregate({
        where: { companyId, status: 'PAID', paidAt: { gte: start, lt: end } },
        _sum: { total: true }, _count: { id: true },
      }),
      this.prisma.invoice.aggregate({
        where: { companyId, status: 'PAID', paidAt: { gte: prevStart, lt: prevEnd } },
        _sum: { total: true }, _count: { id: true },
      }),
    ]);

    const totalRevenue = invoiceAgg._sum.total || 0;
    const prevRevenue = prevInvoiceAgg._sum.total || 0;
    const deliveryCount = waybills.length;

    // Estimate costs using config model
    const avgCostPerDel = (cfg.fuelCostPerKm * cfg.avgKmPerDelivery)
      + (cfg.driverHourlyCost * (cfg.avgDeliveryMinutes / 60))
      + cfg.vehicleCostPerKm * cfg.avgKmPerDelivery
      + cfg.overheadPerDelivery;
    const totalCost = avgCostPerDel * deliveryCount;
    const grossProfit = totalRevenue - totalCost;
    const marginPct = totalRevenue > 0
      ? Math.round((grossProfit / totalRevenue) * 1000) / 10 : 0;

    const avgRevenuePerDel = deliveryCount > 0
      ? Math.round((totalRevenue / deliveryCount) * 100) / 100 : 0;
    const revenueDelta = prevRevenue > 0
      ? Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 1000) / 10
      : null;

    return {
      period: targetPeriod,
      currency: 'ZAR',
      summary: {
        totalRevenue: Math.round(totalRevenue),
        totalCost: Math.round(totalCost),
        grossProfit: Math.round(grossProfit),
        marginPct,
        deliveryCount,
        avgRevenuePerDel,
        avgCostPerDel: Math.round(avgCostPerDel * 100) / 100,
        revenueDelta,
        targetMarginPct: cfg.targetMarginPct,
        marginHealth: marginPct >= cfg.targetMarginPct ? 'HEALTHY'
          : marginPct >= cfg.minMarginPct ? 'WARNING' : 'CRITICAL',
      },
    };
  }


  // ═══════════════════════════════════════════════════════════════════════
  // CLIENT PROFITABILITY MATRIX
  // ═══════════════════════════════════════════════════════════════════════

  async getClientMatrix(companyId: string, period?: string) {
    const targetPeriod = period || this.currentPeriod();
    const cfg = await this.getConfig(companyId);
    const { start, end } = this.periodRange(targetPeriod);

    const invoices = await this.prisma.invoice.findMany({
      where: { companyId, createdAt: { gte: start, lt: end } },
      select: { clientName: true, total: true, status: true, paidAt: true,
        sentAt: true, dueDate: true, items: { select: { waybillId: true } } },
    });

    const waybillsByClient = await this.prisma.waybill.groupBy({
      by: ['companyId'],
      where: { companyId, status: 'DELIVERED', createdAt: { gte: start, lt: end } },
      _count: { _all: true },
    });
    const totalDeliveries = waybillsByClient[0]?._count._all || 0;

    // Build per-client profitability
    const clientMap: Record<string, any> = {};
    for (const inv of invoices) {
      const key = inv.clientName;
      if (!clientMap[key]) {
        clientMap[key] = {
          clientName: key, revenue: 0, invoiceCount: 0,
          paidAmount: 0, overdueAmount: 0, deliveryCount: 0,
          totalDaysToPay: 0, paidWithDays: 0,
        };
      }
      const c = clientMap[key];
      c.revenue += inv.total;
      c.invoiceCount += 1;
      c.deliveryCount += inv.items.length;

      if (inv.status === 'PAID') {
        c.paidAmount += inv.total;
        if (inv.sentAt && inv.paidAt) {
          const days = Math.floor(
            (new Date(inv.paidAt).getTime() - new Date(inv.sentAt).getTime()) / 86400000
          );
          if (days >= 0) { c.totalDaysToPay += days; c.paidWithDays += 1; }
        }
      }
      if ((inv.status === 'SENT' || inv.status === 'OVERDUE') && inv.dueDate
          && new Date(inv.dueDate) < new Date()) {
        c.overdueAmount += inv.total;
      }
    }

    const avgCostPerDel = (cfg.fuelCostPerKm * cfg.avgKmPerDelivery)
      + (cfg.driverHourlyCost * (cfg.avgDeliveryMinutes / 60))
      + cfg.vehicleCostPerKm * cfg.avgKmPerDelivery
      + cfg.overheadPerDelivery;

    const clients = Object.values(clientMap).map((c: any) => {
      const cost = c.deliveryCount * avgCostPerDel;
      const profit = c.revenue - cost;
      const margin = c.revenue > 0
        ? Math.round((profit / c.revenue) * 1000) / 10 : 0;
      const avgDays = c.paidWithDays > 0
        ? Math.round(c.totalDaysToPay / c.paidWithDays) : null;

      return {
        clientName: c.clientName,
        revenue: Math.round(c.revenue),
        deliveryCount: c.deliveryCount,
        avgRevenuePerDel: c.deliveryCount > 0
          ? Math.round((c.revenue / c.deliveryCount) * 100) / 100 : 0,
        estimatedCost: Math.round(cost),
        grossProfit: Math.round(profit),
        marginPct: margin,
        avgDaysToPay: avgDays,
        collectionRate: c.revenue > 0
          ? Math.round((c.paidAmount / c.revenue) * 100) : 0,
        overdueAmount: Math.round(c.overdueAmount),
        health: margin >= cfg.targetMarginPct ? 'PROFITABLE'
          : margin >= cfg.minMarginPct ? 'MARGINAL' : 'UNPROFITABLE',
      };
    }).sort((a, b) => b.revenue - a.revenue);

    // Assign ranks
    const ranked = [...clients].sort((a, b) => b.grossProfit - a.grossProfit);
    ranked.forEach((c, i) => (c as any).profitRank = i + 1);

    return {
      period: targetPeriod,
      currency: 'ZAR',
      totalClients: clients.length,
      profitable: clients.filter(c => c.health === 'PROFITABLE').length,
      marginal: clients.filter(c => c.health === 'MARGINAL').length,
      unprofitable: clients.filter(c => c.health === 'UNPROFITABLE').length,
      clients: clients.slice(0, 20),
    };
  }


  // ═══════════════════════════════════════════════════════════════════════
  // LANE PROFITABILITY ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════

  async getLaneProfitability(companyId: string, period?: string) {
    const targetPeriod = period || this.currentPeriod();
    const cfg = await this.getConfig(companyId);
    const { start, end } = this.periodRange(targetPeriod);

    // Get delivered waybills with zone info (derived from addresses)
    const waybills = await this.prisma.waybill.findMany({
      where: { companyId, status: 'DELIVERED', createdAt: { gte: start, lt: end } },
      select: {
        id: true, totalAmount: true, senderAddress: true,
        recipientAddress: true, weight: true,
      },
    });

    // Derive zone from city (last part of address before postal code)
    const extractZone = (addr: string): string => {
      if (!addr) return 'Unknown';
      const parts = addr.split(',').map(p => p.trim());
      // Try to get city (usually 2nd-to-last part)
      if (parts.length >= 3) return parts[parts.length - 2] || 'Unknown';
      if (parts.length >= 2) return parts[parts.length - 1] || 'Unknown';
      return parts[0]?.slice(0, 20) || 'Unknown';
    };

    const laneMap: Record<string, any> = {};
    const avgCostPerDel = (cfg.fuelCostPerKm * cfg.avgKmPerDelivery)
      + (cfg.driverHourlyCost * (cfg.avgDeliveryMinutes / 60))
      + cfg.vehicleCostPerKm * cfg.avgKmPerDelivery
      + cfg.overheadPerDelivery;

    for (const wb of waybills) {
      const from = extractZone(wb.senderAddress);
      const to = extractZone(wb.recipientAddress);
      const key = `${from}→${to}`;

      if (!laneMap[key]) {
        laneMap[key] = { fromZone: from, toZone: to, count: 0, revenue: 0 };
      }
      laneMap[key].count += 1;
      laneMap[key].revenue += (wb.totalAmount || 0);
    }

    const lanes = Object.values(laneMap).map((l: any) => {
      const cost = l.count * avgCostPerDel;
      const profit = l.revenue - cost;
      const margin = l.revenue > 0
        ? Math.round((profit / l.revenue) * 1000) / 10 : 0;

      let signal = 'OPTIMAL';
      if (margin < cfg.minMarginPct) signal = 'UNDERPRICED';
      else if (margin > cfg.targetMarginPct + 20) signal = 'OVERPRICED';
      if (l.count < 5) signal = 'LOW_VOLUME';

      return {
        fromZone: l.fromZone,
        toZone: l.toZone,
        deliveries: l.count,
        revenue: Math.round(l.revenue),
        avgRevenue: l.count > 0
          ? Math.round((l.revenue / l.count) * 100) / 100 : 0,
        estimatedCost: Math.round(cost),
        grossProfit: Math.round(profit),
        marginPct: margin,
        signal,
      };
    }).sort((a, b) => b.revenue - a.revenue);

    return {
      period: targetPeriod,
      currency: 'ZAR',
      totalLanes: lanes.length,
      underpriced: lanes.filter(l => l.signal === 'UNDERPRICED').length,
      optimal: lanes.filter(l => l.signal === 'OPTIMAL').length,
      overpriced: lanes.filter(l => l.signal === 'OVERPRICED').length,
      lanes: lanes.slice(0, 30),
    };
  }


  // ═══════════════════════════════════════════════════════════════════════
  // QUOTE CONVERSION FUNNEL
  // ═══════════════════════════════════════════════════════════════════════

  async getQuoteFunnel(companyId: string, period?: string) {
    const targetPeriod = period || this.currentPeriod();
    const { start, end } = this.periodRange(targetPeriod);
    const prevPeriod = this.prevPeriod(targetPeriod);
    const { start: prevStart, end: prevEnd } = this.periodRange(prevPeriod);

    const [quotes, prevQuotes] = await Promise.all([
      this.prisma.quote.findMany({
        where: { companyId, createdAt: { gte: start, lt: end } },
        select: { id: true, price: true, accepted: true, clientName: true },
      }),
      this.prisma.quote.count({
        where: { companyId, createdAt: { gte: prevStart, lt: prevEnd } },
      }),
    ]);

    const total = quotes.length;
    const accepted = quotes.filter(q => q.accepted).length;
    const declined = total - accepted;
    const conversionRate = total > 0
      ? Math.round((accepted / total) * 1000) / 10 : 0;
    const totalQuoteValue = quotes.reduce((s, q) => s + q.price, 0);
    const acceptedValue = quotes.filter(q => q.accepted)
      .reduce((s, q) => s + q.price, 0);
    const lostValue = totalQuoteValue - acceptedValue;

    return {
      period: targetPeriod,
      currency: 'ZAR',
      funnel: {
        quotesCreated: total,
        quotesAccepted: accepted,
        quotesDeclined: declined,
        conversionRate,
        totalQuoteValue: Math.round(totalQuoteValue),
        acceptedValue: Math.round(acceptedValue),
        lostValue: Math.round(lostValue),
        avgQuoteValue: total > 0 ? Math.round(totalQuoteValue / total) : 0,
        volumeDelta: prevQuotes > 0
          ? Math.round(((total - prevQuotes) / prevQuotes) * 1000) / 10
          : null,
      },
    };
  }


  // ═══════════════════════════════════════════════════════════════════════
  // RATE CARD PERFORMANCE
  // ═══════════════════════════════════════════════════════════════════════

  async getRateCardPerformance(companyId: string) {
    const rateCards = await this.prisma.rateCard.findMany({
      where: { companyId },
      select: {
        id: true, name: true, fromZone: true, toZone: true,
        basePrice: true, pricePerKg: true, isActive: true,
      },
    });

    const quotes = await this.prisma.quote.findMany({
      where: { companyId },
      select: { price: true, accepted: true, fromAddress: true, toAddress: true },
    });

    // Calculate utilisation per rate card (simplified: match by zone)
    const cards = rateCards.map(rc => {
      const matchingQuotes = quotes.filter(q => {
        if (rc.fromZone && !q.fromAddress.toLowerCase().includes(rc.fromZone.toLowerCase())) return false;
        if (rc.toZone && !q.toAddress.toLowerCase().includes(rc.toZone.toLowerCase())) return false;
        return true;
      });

      const used = matchingQuotes.length;
      const won = matchingQuotes.filter(q => q.accepted).length;
      const winRate = used > 0 ? Math.round((won / used) * 1000) / 10 : 0;
      const avgQuoteVal = used > 0
        ? Math.round(matchingQuotes.reduce((s, q) => s + q.price, 0) / used)
        : 0;

      return {
        id: rc.id,
        name: rc.name,
        fromZone: rc.fromZone || '—',
        toZone: rc.toZone || '—',
        basePrice: rc.basePrice,
        pricePerKg: rc.pricePerKg,
        isActive: rc.isActive,
        quotesGenerated: used,
        quotesWon: won,
        winRate,
        avgQuoteValue: avgQuoteVal,
        status: !rc.isActive ? 'INACTIVE'
          : used === 0 ? 'UNUSED'
          : winRate >= 60 ? 'HIGH_PERFORMER'
          : winRate >= 30 ? 'AVERAGE' : 'LOW_PERFORMER',
      };
    }).sort((a, b) => b.quotesGenerated - a.quotesGenerated);

    return {
      totalCards: cards.length,
      active: cards.filter(c => c.isActive).length,
      unused: cards.filter(c => c.status === 'UNUSED').length,
      highPerformers: cards.filter(c => c.status === 'HIGH_PERFORMER').length,
      cards,
    };
  }


  // ═══════════════════════════════════════════════════════════════════════
  // REVENUE FORECASTING (time-series based)
  // ═══════════════════════════════════════════════════════════════════════

  async getRevenueForecast(companyId: string) {
    // Get last 12 months of revenue data
    const months: { period: string; revenue: number }[] = [];
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      const agg = await this.prisma.invoice.aggregate({
        where: { companyId, status: 'PAID', paidAt: { gte: d, lt: end } },
        _sum: { total: true },
      });
      months.push({ period, revenue: agg._sum.total || 0 });
    }

    // Simple linear regression + seasonal adjustment
    const values = months.map(m => m.revenue);
    const n = values.length;
    const nonZero = values.filter(v => v > 0);

    if (nonZero.length < 3) {
      return {
        historical: months,
        forecast: [],
        confidence: 0,
        message: 'Insufficient historical data (need at least 3 months of revenue).',
      };
    }

    // Calculate trend (linear regression slope)
    const xMean = (n - 1) / 2;
    const yMean = values.reduce((s, v) => s + v, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (values[i] - yMean);
      den += (i - xMean) * (i - xMean);
    }
    const slope = den !== 0 ? num / den : 0;
    const intercept = yMean - slope * xMean;

    // Seasonal factors (ratio of each month to the trend line)
    const seasonalFactors: number[] = [];
    for (let i = 0; i < n; i++) {
      const trendVal = intercept + slope * i;
      seasonalFactors.push(trendVal > 0 ? values[i] / trendVal : 1);
    }

    // Forecast next 3 months
    const cfg = await this.getConfig(companyId);
    const forecastMonths = cfg.forecastMonths || 3;
    const forecast: any[] = [];

    for (let i = 1; i <= forecastMonths; i++) {
      const futureIdx = n + i - 1;
      const trendVal = intercept + slope * futureIdx;

      // Apply seasonal factor from same month last year (if available)
      const seasonIdx = (n - 12 + (i - 1) % 12 + 12) % 12;
      const seasonal = cfg.seasonalityEnabled
        ? (seasonalFactors[seasonIdx] || 1) : 1;

      const predicted = Math.max(0, trendVal * seasonal);
      const variance = nonZero.length > 0
        ? nonZero.reduce((s, v) => s + Math.pow(v - yMean, 2), 0) / nonZero.length
        : 0;
      const stdDev = Math.sqrt(variance);

      const futureDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const period = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}`;

      forecast.push({
        period,
        predicted: Math.round(predicted),
        lowerBound: Math.round(Math.max(0, predicted - 1.28 * stdDev)),
        upperBound: Math.round(predicted + 1.28 * stdDev),
        trend: Math.round(trendVal),
        seasonalFactor: Math.round(seasonal * 100) / 100,
      });
    }

    // Pipeline (accepted quotes not yet invoiced — future revenue)
    const pipeline = await this.prisma.quote.aggregate({
      where: { companyId, accepted: true },
      _sum: { price: true }, _count: { id: true },
    });

    const monthlyGrowthRate = yMean > 0
      ? Math.round((slope / yMean) * 1000) / 10 : 0;

    return {
      historical: months,
      forecast,
      monthlyGrowthRate,
      pipeline: {
        value: Math.round(pipeline._sum.price || 0),
        count: pipeline._count.id,
      },
      confidence: Math.min(95, Math.round(nonZero.length * 8)),
      model: 'linear_regression_seasonal',
    };
  }


  // ═══════════════════════════════════════════════════════════════════════
  // CLIENT INTELLIGENCE — CLV, churn prediction, health scoring
  // ═══════════════════════════════════════════════════════════════════════

  async getClientIntelligence(companyId: string) {
    const now = new Date();
    const d30 = new Date(now); d30.setDate(d30.getDate() - 30);
    const d60 = new Date(now); d60.setDate(d60.getDate() - 60);
    const d90 = new Date(now); d90.setDate(d90.getDate() - 90);

    const invoices = await this.prisma.invoice.findMany({
      where: { companyId },
      select: {
        clientName: true, total: true, status: true,
        createdAt: true, paidAt: true, dueDate: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group by client
    const clientMap: Record<string, any[]> = {};
    for (const inv of invoices) {
      (clientMap[inv.clientName] ??= []).push(inv);
    }

    const clients = Object.entries(clientMap).map(([name, invs]) => {
      const totalRevenue = invs.reduce((s, i) => s + i.total, 0);
      const paidRevenue = invs.filter(i => i.status === 'PAID')
        .reduce((s, i) => s + i.total, 0);
      const invoiceCount = invs.length;

      // Recency
      const lastInvoice = invs[0]?.createdAt;
      const daysSinceLastInvoice = lastInvoice
        ? Math.floor((now.getTime() - new Date(lastInvoice).getTime()) / 86400000)
        : 999;

      // Frequency (months active)
      const firstInvoice = invs[invs.length - 1]?.createdAt;
      const monthsActive = firstInvoice
        ? Math.max(1, Math.ceil(
            (now.getTime() - new Date(firstInvoice).getTime()) / (30 * 86400000)
          ))
        : 1;

      // Monthly average revenue
      const monthlyAvg = totalRevenue / monthsActive;

      // CLV (12-month predicted value based on monthly average + trend)
      const recent3m = invs.filter(i =>
        new Date(i.createdAt) > d90
      ).reduce((s, i) => s + i.total, 0);
      const recentMonthlyAvg = recent3m / 3;
      const trend = monthlyAvg > 0
        ? (recentMonthlyAvg - monthlyAvg) / monthlyAvg : 0;
      const clv = Math.round(recentMonthlyAvg * 12 * (1 + trend * 0.5));

      // Churn risk scoring (0-100)
      let churnScore = 0;
      const signals: string[] = [];

      if (daysSinceLastInvoice > 60) { churnScore += 30; signals.push('No activity in 60+ days'); }
      else if (daysSinceLastInvoice > 30) { churnScore += 15; signals.push('No activity in 30+ days'); }

      if (trend < -0.3) { churnScore += 25; signals.push('Revenue declining >30%'); }
      else if (trend < -0.1) { churnScore += 10; signals.push('Revenue declining'); }

      const overdueInvs = invs.filter(i =>
        i.status !== 'PAID' && i.dueDate && new Date(i.dueDate) < now
      );
      if (overdueInvs.length > 2) { churnScore += 20; signals.push(`${overdueInvs.length} overdue invoices`); }

      if (invoiceCount <= 2 && monthsActive <= 2) { churnScore += 15; signals.push('New client, not yet established'); }

      churnScore = Math.min(100, churnScore);

      // Volume trend
      let volumeTrend = 'STABLE';
      if (monthsActive <= 2) volumeTrend = 'NEW';
      else if (daysSinceLastInvoice > 60) volumeTrend = 'DORMANT';
      else if (trend > 0.1) volumeTrend = 'GROWING';
      else if (trend < -0.1) volumeTrend = 'DECLINING';

      // CLV tier
      let clvTier = 'BRONZE';
      if (clv >= 100000) clvTier = 'PLATINUM';
      else if (clv >= 50000) clvTier = 'GOLD';
      else if (clv >= 20000) clvTier = 'SILVER';
      if (churnScore >= 50) clvTier = 'AT_RISK';

      return {
        clientName: name,
        totalRevenue: Math.round(totalRevenue),
        monthlyAvg: Math.round(monthlyAvg),
        invoiceCount,
        monthsActive,
        daysSinceLastInvoice,
        clv,
        clvTier,
        churnRisk: churnScore,
        churnSignals: signals,
        volumeTrend,
        collectionRate: totalRevenue > 0
          ? Math.round((paidRevenue / totalRevenue) * 100) : 0,
      };
    }).sort((a, b) => b.clv - a.clv);

    // Summary stats
    const totalCLV = clients.reduce((s, c) => s + c.clv, 0);
    const atRisk = clients.filter(c => c.churnRisk >= 50);
    const growing = clients.filter(c => c.volumeTrend === 'GROWING');

    return {
      totalClients: clients.length,
      totalCLV: Math.round(totalCLV),
      avgCLV: clients.length > 0 ? Math.round(totalCLV / clients.length) : 0,
      atRiskCount: atRisk.length,
      atRiskRevenue: Math.round(atRisk.reduce((s, c) => s + c.monthlyAvg, 0) * 12),
      growingCount: growing.length,
      tiers: {
        platinum: clients.filter(c => c.clvTier === 'PLATINUM').length,
        gold: clients.filter(c => c.clvTier === 'GOLD').length,
        silver: clients.filter(c => c.clvTier === 'SILVER').length,
        bronze: clients.filter(c => c.clvTier === 'BRONZE').length,
        atRisk: clients.filter(c => c.clvTier === 'AT_RISK').length,
      },
      clients: clients.slice(0, 25),
    };
  }


  // ═══════════════════════════════════════════════════════════════════════
  // COMMERCIAL AI COPILOT — AI-powered pricing & strategy insights
  // ═══════════════════════════════════════════════════════════════════════

  async getAiInsights(companyId: string) {
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    if (!apiKey) {
      return { insights: null, message: 'GROQ_API_KEY not configured. AI insights unavailable.' };
    }

    // Gather data for the AI
    const [dashboard, clientMatrix, lanes, funnel] = await Promise.all([
      this.getProfitabilityDashboard(companyId),
      this.getClientMatrix(companyId),
      this.getLaneProfitability(companyId),
      this.getQuoteFunnel(companyId),
    ]);

    const prompt = `You are a world-class commercial analytics AI for a South African courier/logistics company using FlowOps.

Analyse the following commercial data and provide strategic insights:

PROFITABILITY:
- Revenue: R${dashboard.summary.totalRevenue.toLocaleString()}
- Gross Profit: R${dashboard.summary.grossProfit.toLocaleString()}
- Margin: ${dashboard.summary.marginPct}% (target: ${dashboard.summary.targetMarginPct}%)
- Revenue growth: ${dashboard.summary.revenueDelta ?? 'N/A'}%
- Deliveries: ${dashboard.summary.deliveryCount}
- Avg revenue per delivery: R${dashboard.summary.avgRevenuePerDel}

CLIENT MATRIX:
- Total clients: ${clientMatrix.totalClients}
- Profitable: ${clientMatrix.profitable}, Marginal: ${clientMatrix.marginal}, Unprofitable: ${clientMatrix.unprofitable}
- Top 3 clients: ${clientMatrix.clients.slice(0, 3).map((c: any) => `${c.clientName} (R${c.revenue}, ${c.marginPct}% margin)`).join('; ')}

LANE ANALYSIS:
- Total lanes: ${lanes.totalLanes}
- Underpriced: ${lanes.underpriced}, Optimal: ${lanes.optimal}
- Top lanes: ${lanes.lanes.slice(0, 3).map((l: any) => `${l.fromZone}→${l.toZone} (R${l.revenue}, ${l.marginPct}%)`).join('; ')}

QUOTE FUNNEL:
- Quotes: ${funnel.funnel.quotesCreated}, Conversion: ${funnel.funnel.conversionRate}%
- Lost value: R${funnel.funnel.lostValue.toLocaleString()}

Provide ONLY valid JSON in this format:
{
  "executiveSummary": "2-3 sentence overview of commercial health",
  "topOpportunities": ["...", "...", "..."],
  "pricingActions": ["...", "...", "..."],
  "clientActions": ["...", "...", "..."],
  "risks": ["...", "..."],
  "forecast": "1 sentence revenue outlook"
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
          max_tokens: 800,
        }),
      });

      if (!res.ok) {
        this.logger.error(`Groq returned ${res.status} for commercial insights.`);
        return { insights: null, message: 'AI service unavailable.' };
      }

      const body: any = await res.json();
      const content = body?.choices?.[0]?.message?.content;
      if (!content) return { insights: null, message: 'Empty AI response.' };

      const insights = JSON.parse(content.trim());
      return { insights, generatedAt: new Date().toISOString() };
    } catch (err) {
      this.logger.error(`Commercial AI insights failed: ${err}`);
      return { insights: null, message: 'AI analysis failed.' };
    }
  }


  // ═══════════════════════════════════════════════════════════════════════
  // FULL COMMERCIAL REPORT (aggregates everything)
  // ═══════════════════════════════════════════════════════════════════════

  async getFullReport(companyId: string, period?: string) {
    const [dashboard, clientMatrix, lanes, funnel, rateCards, forecast, intelligence] =
      await Promise.all([
        this.getProfitabilityDashboard(companyId, period),
        this.getClientMatrix(companyId, period),
        this.getLaneProfitability(companyId, period),
        this.getQuoteFunnel(companyId, period),
        this.getRateCardPerformance(companyId),
        this.getRevenueForecast(companyId),
        this.getClientIntelligence(companyId),
      ]);

    return {
      generatedAt: new Date().toISOString(),
      period: period || this.currentPeriod(),
      profitability: dashboard,
      clientMatrix,
      laneProfitability: lanes,
      quoteFunnel: funnel,
      rateCardPerformance: rateCards,
      revenueForecast: forecast,
      clientIntelligence: intelligence,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  private currentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private prevPeriod(period: string): string {
    const [y, m] = period.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private periodRange(period: string): { start: Date; end: Date } {
    const [year, month] = period.split('-').map(Number);
    return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1) };
  }
}
