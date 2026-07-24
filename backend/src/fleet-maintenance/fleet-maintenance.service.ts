import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

// ── Service type intervals (defaults for SA/African fleet operations) ──────
const SERVICE_INTERVALS: Record<string, { km: number; days: number }> = {
  'Oil Change':       { km: 10000, days: 90 },
  'Tyre Rotation':    { km: 15000, days: 180 },
  'Tyre Replacement': { km: 50000, days: 365 },
  'Brake Inspection': { km: 20000, days: 180 },
  'Brake Pads':       { km: 40000, days: 365 },
  'Annual Service':   { km: 30000, days: 365 },
  'Transmission':     { km: 60000, days: 730 },
  'Battery Check':    { km: 25000, days: 365 },
  'Coolant Flush':    { km: 40000, days: 730 },
  'Air Filter':       { km: 20000, days: 365 },
  'Wheel Alignment':  { km: 20000, days: 180 },
  'Suspension':       { km: 50000, days: 548 },
};

@Injectable()
export class FleetMaintenanceService {
  private readonly logger = new Logger('FLEET_MAINTENANCE_AI');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // CRON: Daily maintenance sweep (06:30 daily)
  // ══════════════════════════════════════════════════════════════════════════

  @Cron('30 6 * * *')
  async dailyMaintenanceSweep() {
    this.logger.log('🔧 Fleet Maintenance AI: Starting daily predictive sweep...');
    const companies = await this.prisma.company.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    for (const co of companies) {
      try {
        await this.runPredictiveAnalysis(co.id);
      } catch (e: any) {
        this.logger.warn(`Maintenance sweep failed for ${co.id}: ${e?.message}`);
      }
    }
    this.logger.log('✅ Fleet Maintenance AI: Daily sweep complete.');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CRUD — Service Records
  // ══════════════════════════════════════════════════════════════════════════

  async logService(companyId: string, dto: {
    driverId: string; serviceType: string; kmAtService?: number;
    cost?: number; currency?: string; notes?: string; servicedAt?: string;
    providerName?: string; invoiceRef?: string; partsReplaced?: string;
    warrantyExpiry?: string;
  }) {
    // Verify driver belongs to company
    const driver = await this.prisma.driver.findFirst({
      where: { id: dto.driverId, companyId },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    // Update driver odometer if provided
    if (dto.kmAtService && (!driver.currentKm || dto.kmAtService > driver.currentKm)) {
      await this.prisma.driver.update({
        where: { id: dto.driverId },
        data: { currentKm: dto.kmAtService },
      });
    }

    // Create service record
    const service = await this.prisma.vehicleService.create({
      data: {
        driverId: dto.driverId,
        serviceType: dto.serviceType,
        kmAtService: dto.kmAtService,
        cost: dto.cost,
        currency: dto.currency || 'ZAR',
        notes: dto.notes,
        servicedAt: dto.servicedAt ? new Date(dto.servicedAt) : new Date(),
        providerName: dto.providerName,
        invoiceRef: dto.invoiceRef,
        partsReplaced: dto.partsReplaced,
        warrantyExpiry: dto.warrantyExpiry ? new Date(dto.warrantyExpiry) : undefined,
      },
    });

    // Run AI prediction for this driver after logging service
    await this.predictNextService(dto.driverId, dto.serviceType, service.id);

    // Update driver's next service fields
    await this.updateDriverNextService(dto.driverId);

    return service;
  }

  async getServiceHistory(companyId: string, driverId?: string) {
    const where: any = {};
    if (driverId) {
      const driver = await this.prisma.driver.findFirst({ where: { id: driverId, companyId } });
      if (!driver) throw new NotFoundException('Driver not found');
      where.driverId = driverId;
    } else {
      where.driver = { companyId };
    }

    return this.prisma.vehicleService.findMany({
      where,
      include: { driver: { select: { id: true, name: true, vehicleType: true, vehicleReg: true, currentKm: true } } },
      orderBy: { servicedAt: 'desc' },
      take: 200,
    });
  }

  async deleteService(companyId: string, serviceId: string) {
    const service = await this.prisma.vehicleService.findFirst({
      where: { id: serviceId, driver: { companyId } },
    });
    if (!service) throw new NotFoundException('Service record not found');
    return this.prisma.vehicleService.delete({ where: { id: serviceId } });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FLEET HEALTH DASHBOARD
  // ══════════════════════════════════════════════════════════════════════════

  async getFleetHealth(companyId: string) {
    const drivers = await this.prisma.driver.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true, name: true, vehicleType: true, vehicleReg: true,
        currentKm: true, nextServiceKm: true, nextServiceDate: true, vehicleNotes: true,
        services: { orderBy: { servicedAt: 'desc' }, take: 3 },
      },
    });

    const now = new Date();
    const vehicles = drivers.map((d) => {
      const kmOverdue = d.currentKm && d.nextServiceKm ? d.currentKm - d.nextServiceKm : null;
      const daysOverdue = d.nextServiceDate
        ? Math.floor((now.getTime() - new Date(d.nextServiceDate).getTime()) / 86_400_000)
        : null;

      let status: 'OK' | 'DUE_SOON' | 'OVERDUE' | 'CRITICAL' | 'UNKNOWN' = 'UNKNOWN';
      if (!d.nextServiceKm && !d.nextServiceDate) status = 'UNKNOWN';
      else if ((kmOverdue && kmOverdue > 5000) || (daysOverdue && daysOverdue > 30)) status = 'CRITICAL';
      else if ((kmOverdue && kmOverdue > 0) || (daysOverdue && daysOverdue > 0)) status = 'OVERDUE';
      else if ((kmOverdue && kmOverdue > -2000) || (daysOverdue && daysOverdue > -14)) status = 'DUE_SOON';
      else status = 'OK';

      return {
        driverId: d.id,
        driverName: d.name,
        vehicleType: d.vehicleType,
        vehicleReg: d.vehicleReg,
        currentKm: d.currentKm,
        nextServiceKm: d.nextServiceKm,
        nextServiceDate: d.nextServiceDate,
        kmOverdue,
        daysOverdue,
        status,
        lastService: d.services[0] || null,
        recentServices: d.services,
        vehicleNotes: d.vehicleNotes,
      };
    });

    const summary = {
      total: vehicles.length,
      ok: vehicles.filter((v) => v.status === 'OK').length,
      dueSoon: vehicles.filter((v) => v.status === 'DUE_SOON').length,
      overdue: vehicles.filter((v) => v.status === 'OVERDUE').length,
      critical: vehicles.filter((v) => v.status === 'CRITICAL').length,
      unknown: vehicles.filter((v) => v.status === 'UNKNOWN').length,
      totalMaintenanceCostThisMonth: 0,
    };

    // Monthly cost
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const costAgg = await this.prisma.vehicleService.aggregate({
      where: { driver: { companyId }, servicedAt: { gte: monthStart } },
      _sum: { cost: true },
    });
    summary.totalMaintenanceCostThisMonth = costAgg._sum.cost || 0;

    return { vehicles, summary, generatedAt: now.toISOString() };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AI PREDICTIVE MAINTENANCE
  // ══════════════════════════════════════════════════════════════════════════

  async runPredictiveAnalysis(companyId: string) {
    const drivers = await this.prisma.driver.findMany({
      where: { companyId, isActive: true },
      include: { services: { orderBy: { servicedAt: 'desc' }, take: 10 } },
    });

    const predictions: any[] = [];

    for (const driver of drivers) {
      const prediction = await this.predictForDriver(driver);
      predictions.push(prediction);
    }

    return predictions;
  }

  private async predictForDriver(driver: any) {
    const services = driver.services || [];
    const currentKm = driver.currentKm || 0;
    const now = new Date();

    // Group services by type to find patterns
    const serviceGroups: Record<string, any[]> = {};
    for (const s of services) {
      if (!serviceGroups[s.serviceType]) serviceGroups[s.serviceType] = [];
      serviceGroups[s.serviceType].push(s);
    }

    const predictions: any[] = [];

    for (const [type, records] of Object.entries(serviceGroups)) {
      if (records.length < 1) continue;

      // Calculate average interval between services
      let avgKmInterval: number | null = null;
      let avgDayInterval: number | null = null;

      if (records.length >= 2) {
        const kmIntervals: number[] = [];
        const dayIntervals: number[] = [];
        for (let i = 0; i < records.length - 1; i++) {
          if (records[i].kmAtService && records[i + 1].kmAtService) {
            kmIntervals.push(records[i].kmAtService - records[i + 1].kmAtService);
          }
          const days = (new Date(records[i].servicedAt).getTime() - new Date(records[i + 1].servicedAt).getTime()) / 86_400_000;
          dayIntervals.push(Math.abs(days));
        }
        if (kmIntervals.length > 0) avgKmInterval = Math.round(kmIntervals.reduce((a, b) => a + b, 0) / kmIntervals.length);
        if (dayIntervals.length > 0) avgDayInterval = Math.round(dayIntervals.reduce((a, b) => a + b, 0) / dayIntervals.length);
      }

      // Fall back to standard intervals if not enough data
      const stdInterval = SERVICE_INTERVALS[type] || { km: 15000, days: 180 };
      const kmInterval = avgKmInterval || stdInterval.km;
      const dayInterval = avgDayInterval || stdInterval.days;

      const lastService = records[0];
      const lastKm = lastService.kmAtService || 0;
      const lastDate = new Date(lastService.servicedAt);

      // Predict next due
      const nextDueKm = lastKm + kmInterval;
      const nextDueDate = new Date(lastDate.getTime() + dayInterval * 86_400_000);

      // Calculate urgency
      const kmRemaining = nextDueKm - currentKm;
      const daysRemaining = Math.floor((nextDueDate.getTime() - now.getTime()) / 86_400_000);

      let riskLevel = 'LOW';
      let confidence = 0.7;

      if (kmRemaining < 0 || daysRemaining < 0) { riskLevel = 'CRITICAL'; confidence = 0.95; }
      else if (kmRemaining < 2000 || daysRemaining < 14) { riskLevel = 'HIGH'; confidence = 0.85; }
      else if (kmRemaining < 5000 || daysRemaining < 30) { riskLevel = 'MEDIUM'; confidence = 0.75; }

      // Higher confidence with more data points
      if (records.length >= 3) confidence = Math.min(confidence + 0.1, 0.98);
      if (records.length >= 5) confidence = Math.min(confidence + 0.05, 0.99);

      predictions.push({
        driverId: driver.id,
        driverName: driver.name,
        vehicleReg: driver.vehicleReg,
        serviceType: type,
        lastServiceDate: lastDate,
        lastServiceKm: lastKm,
        predictedNextKm: nextDueKm,
        predictedNextDate: nextDueDate,
        kmRemaining,
        daysRemaining,
        riskLevel,
        confidence,
        basedOnRecords: records.length,
        avgKmInterval: kmInterval,
        avgDayInterval: dayInterval,
      });

      // Update the service record with AI prediction
      await this.prisma.vehicleService.update({
        where: { id: lastService.id },
        data: {
          aiPredictedNextKm: nextDueKm,
          aiPredictedNextDate: nextDueDate,
          aiConfidence: confidence,
          aiRiskLevel: riskLevel,
        },
      });
    }

    // Update driver's overall next service (earliest due)
    if (predictions.length > 0) {
      const earliest = predictions.sort((a, b) => a.daysRemaining - b.daysRemaining)[0];
      await this.prisma.driver.update({
        where: { id: driver.id },
        data: {
          nextServiceKm: earliest.predictedNextKm,
          nextServiceDate: earliest.predictedNextDate,
        },
      });
    }

    return { driverId: driver.id, driverName: driver.name, predictions };
  }

  /** AI-powered single service prediction after logging a new service */
  private async predictNextService(driverId: string, serviceType: string, serviceId: string) {
    const history = await this.prisma.vehicleService.findMany({
      where: { driverId, serviceType },
      orderBy: { servicedAt: 'desc' },
      take: 10,
    });

    if (history.length < 1) return;

    const stdInterval = SERVICE_INTERVALS[serviceType] || { km: 15000, days: 180 };
    let avgKmInterval = stdInterval.km;
    let avgDayInterval = stdInterval.days;

    if (history.length >= 2) {
      const kmIntervals: number[] = [];
      const dayIntervals: number[] = [];
      for (let i = 0; i < history.length - 1; i++) {
        if (history[i].kmAtService && history[i + 1].kmAtService) {
          kmIntervals.push(history[i].kmAtService! - history[i + 1].kmAtService!);
        }
        const days = Math.abs(new Date(history[i].servicedAt).getTime() - new Date(history[i + 1].servicedAt).getTime()) / 86_400_000;
        dayIntervals.push(days);
      }
      if (kmIntervals.length > 0) avgKmInterval = Math.round(kmIntervals.reduce((a, b) => a + b, 0) / kmIntervals.length);
      if (dayIntervals.length > 0) avgDayInterval = Math.round(dayIntervals.reduce((a, b) => a + b, 0) / dayIntervals.length);
    }

    const latest = history[0];
    const nextKm = (latest.kmAtService || 0) + avgKmInterval;
    const nextDate = new Date(latest.servicedAt.getTime() + avgDayInterval * 86_400_000);
    const confidence = Math.min(0.6 + history.length * 0.05, 0.98);

    await this.prisma.vehicleService.update({
      where: { id: serviceId },
      data: {
        aiPredictedNextKm: nextKm,
        aiPredictedNextDate: nextDate,
        aiConfidence: confidence,
        aiRiskLevel: 'LOW',
        aiNotes: `Next ${serviceType} predicted at ${nextKm} km or ${nextDate.toLocaleDateString('en-ZA')} (based on ${history.length} records, avg interval: ${avgKmInterval} km / ${avgDayInterval} days)`,
      },
    });
  }

  /** Update driver's nextServiceKm/nextServiceDate from latest predictions */
  private async updateDriverNextService(driverId: string) {
    const latestPredictions = await this.prisma.vehicleService.findMany({
      where: { driverId, aiPredictedNextDate: { not: null } },
      orderBy: { aiPredictedNextDate: 'asc' },
      take: 1,
    });

    if (latestPredictions.length > 0) {
      const p = latestPredictions[0];
      await this.prisma.driver.update({
        where: { id: driverId },
        data: {
          nextServiceKm: p.aiPredictedNextKm,
          nextServiceDate: p.aiPredictedNextDate,
        },
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AI GROQ-POWERED DEEP ANALYSIS
  // ══════════════════════════════════════════════════════════════════════════

  async getAiMaintenanceAdvice(companyId: string, driverId: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, companyId },
      include: { services: { orderBy: { servicedAt: 'desc' }, take: 20 } },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    const apiKey = this.config.get<string>('GROQ_API_KEY');
    if (!apiKey) {
      return this.generateLocalAdvice(driver);
    }

    try {
      const history = driver.services.map((s) =>
        `${s.serviceType} at ${s.kmAtService ?? '?'}km on ${new Date(s.servicedAt).toLocaleDateString('en-ZA')}${s.cost ? ` (${s.currency || 'ZAR'} ${s.cost})` : ''}${s.notes ? ` — ${s.notes}` : ''}`
      ).join('\n');

      const prompt = `You are a fleet maintenance AI supervisor for a Pan-African logistics company. Analyze this vehicle's service history and provide:
1. Overall vehicle health assessment (1-10 score)
2. Top 3 most urgent maintenance items needed NOW
3. Cost forecast for next 3 months
4. Risk of breakdown (LOW/MEDIUM/HIGH/CRITICAL) with reasoning
5. Specific advice for African road conditions (heat, dust, potholes, long distances)

Vehicle: ${driver.vehicleType || 'Unknown'} (${driver.vehicleReg || 'No reg'})
Current odometer: ${driver.currentKm || 'Unknown'} km
Driver: ${driver.name}

Service history (most recent first):
${history || 'No service records found — this itself is a risk.'}

Respond in JSON format: { healthScore, urgentItems: [{item, priority, estimatedCost}], costForecast3Months, breakdownRisk, breakdownReasoning, africanConditionsAdvice, overallRecommendation }`;

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 1000,
          response_format: { type: 'json_object' },
        }),
      });

      if (!res.ok) {
        this.logger.warn(`Groq API error: ${res.status}`);
        return this.generateLocalAdvice(driver);
      }

      const data: any = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) return this.generateLocalAdvice(driver);

      const parsed = JSON.parse(content);
      return { ...parsed, source: 'ai', model: 'llama-3.3-70b-versatile', driverId, vehicleReg: driver.vehicleReg };
    } catch (e: any) {
      this.logger.warn(`AI advice failed: ${e?.message}`);
      return this.generateLocalAdvice(driver);
    }
  }

  /** Fallback local advice when Groq is unavailable */
  private generateLocalAdvice(driver: any) {
    const services = driver.services || [];
    const currentKm = driver.currentKm || 0;
    const now = new Date();

    const urgentItems: any[] = [];
    const serviceTypes = [...new Set(services.map((s: any) => s.serviceType))];

    for (const type of Object.keys(SERVICE_INTERVALS)) {
      const records = services.filter((s: any) => s.serviceType === type);
      const interval = SERVICE_INTERVALS[type];

      if (records.length === 0) {
        if (currentKm > interval.km) {
          urgentItems.push({ item: type, priority: 'HIGH', estimatedCost: this.estimateCost(type), reason: `Never recorded — vehicle at ${currentKm} km` });
        }
        continue;
      }

      const last = records[0];
      const kmSince = currentKm - (last.kmAtService || 0);
      const daysSince = Math.floor((now.getTime() - new Date(last.servicedAt).getTime()) / 86_400_000);

      if (kmSince > interval.km || daysSince > interval.days) {
        urgentItems.push({
          item: type,
          priority: kmSince > interval.km * 1.5 || daysSince > interval.days * 1.5 ? 'CRITICAL' : 'HIGH',
          estimatedCost: this.estimateCost(type),
          reason: `Overdue by ${kmSince - interval.km} km / ${daysSince - interval.days} days`,
        });
      }
    }

    const healthScore = Math.max(1, 10 - urgentItems.length * 2);
    const breakdownRisk = urgentItems.filter((i) => i.priority === 'CRITICAL').length > 0 ? 'CRITICAL'
      : urgentItems.filter((i) => i.priority === 'HIGH').length > 1 ? 'HIGH'
      : urgentItems.length > 0 ? 'MEDIUM' : 'LOW';

    return {
      healthScore,
      urgentItems: urgentItems.slice(0, 5),
      costForecast3Months: urgentItems.reduce((s, i) => s + (i.estimatedCost || 0), 0),
      breakdownRisk,
      breakdownReasoning: urgentItems.length === 0
        ? 'Vehicle maintenance is up to date'
        : `${urgentItems.length} overdue service items detected`,
      africanConditionsAdvice: 'Increase oil change frequency in dusty conditions. Check air filters monthly. Inspect suspension after long-distance cross-border trips.',
      overallRecommendation: urgentItems.length === 0
        ? 'Vehicle is well maintained. Continue regular service schedule.'
        : `Schedule maintenance immediately for: ${urgentItems.map((i) => i.item).join(', ')}`,
      source: 'local',
      driverId: driver.id,
      vehicleReg: driver.vehicleReg,
    };
  }

  private estimateCost(serviceType: string): number {
    const costs: Record<string, number> = {
      'Oil Change': 850, 'Tyre Rotation': 400, 'Tyre Replacement': 4500,
      'Brake Inspection': 350, 'Brake Pads': 1800, 'Annual Service': 3500,
      'Transmission': 8000, 'Battery Check': 200, 'Coolant Flush': 600,
      'Air Filter': 350, 'Wheel Alignment': 550, 'Suspension': 5500,
    };
    return costs[serviceType] || 1000;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ODOMETER UPDATE
  // ══════════════════════════════════════════════════════════════════════════

  async updateOdometer(companyId: string, driverId: string, km: number) {
    const driver = await this.prisma.driver.findFirst({ where: { id: driverId, companyId } });
    if (!driver) throw new NotFoundException('Driver not found');

    return this.prisma.driver.update({
      where: { id: driverId },
      data: { currentKm: km },
      select: { id: true, name: true, currentKm: true, nextServiceKm: true, nextServiceDate: true },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COST ANALYTICS
  // ══════════════════════════════════════════════════════════════════════════

  async getCostAnalytics(companyId: string) {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last6 = new Date(now.getFullYear(), now.getMonth() - 6, 1);

    const [thisMonthCost, lastMonthCost, last6Cost, byType, byDriver] = await Promise.all([
      this.prisma.vehicleService.aggregate({
        where: { driver: { companyId }, servicedAt: { gte: thisMonth } },
        _sum: { cost: true }, _count: { _all: true },
      }),
      this.prisma.vehicleService.aggregate({
        where: { driver: { companyId }, servicedAt: { gte: lastMonth, lt: thisMonth } },
        _sum: { cost: true }, _count: { _all: true },
      }),
      this.prisma.vehicleService.aggregate({
        where: { driver: { companyId }, servicedAt: { gte: last6 } },
        _sum: { cost: true }, _count: { _all: true },
      }),
      this.prisma.vehicleService.groupBy({
        by: ['serviceType'],
        where: { driver: { companyId }, servicedAt: { gte: last6 } },
        _sum: { cost: true }, _count: { _all: true },
        orderBy: { _sum: { cost: 'desc' } },
      }),
      this.prisma.vehicleService.groupBy({
        by: ['driverId'],
        where: { driver: { companyId }, servicedAt: { gte: last6 } },
        _sum: { cost: true }, _count: { _all: true },
        orderBy: { _sum: { cost: 'desc' } },
        take: 10,
      }),
    ]);

    return {
      thisMonth: { cost: thisMonthCost._sum.cost || 0, services: thisMonthCost._count._all },
      lastMonth: { cost: lastMonthCost._sum.cost || 0, services: lastMonthCost._count._all },
      last6Months: { cost: last6Cost._sum.cost || 0, services: last6Cost._count._all },
      byServiceType: byType.map((t) => ({ type: t.serviceType, cost: t._sum.cost || 0, count: t._count._all })),
      topSpenders: byDriver.map((d) => ({ driverId: d.driverId, cost: d._sum.cost || 0, count: d._count._all })),
    };
  }
}
