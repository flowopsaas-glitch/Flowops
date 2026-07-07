import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ShipmentStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AuditService } from '../audit/audit.service';
import { PLAN_ENTITLEMENTS, FEATURE_KEYS, FEATURE_LABELS } from '../billing/plan-entitlements';

type OwnerActor = { id?: string; email?: string } | null | undefined;

@Injectable()
export class OwnerService {
  private readonly logger = new Logger(OwnerService.name);

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    private jwt: JwtService,
    private config: ConfigService,
    private audit: AuditService,
  ) {}

  // ── Tenants ───────────────────────────────────────────────────────────

  async listTenants(query?: any) {
    const page = Number(query?.page) || 1;
    const limit = Number(query?.limit) || 50;
    const [companies, total] = await Promise.all([
      this.prisma.company.findMany({
        skip: (page - 1) * limit, take: limit,
        include: { _count: { select: { users: true, waybills: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.company.count(),
    ]);
    return { data: companies, total, page, limit };
  }

  async getTenant(id: string) {
    return this.prisma.company.findUniqueOrThrow({
      where: { id },
      include: {
        users: { where: { role: 'ADMIN' }, select: { id: true, email: true, name: true } },
        _count: { select: { waybills: true, collections: true } },
      },
    });
  }

  /** Draft a new tenant (creates Company without users). */
  async draftTenant(dto: any) {
    return this.prisma.company.create({ data: { ...dto, isActive: false } });
  }

  /** Approve/reject/suspend a tenant. */
  async tenantAction(
    tenantId: string,
    action: 'approve' | 'reject' | 'suspend',
    opts?: { reason?: string },
    actor?: OwnerActor,
  ) {
    const company = await this.prisma.company.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });

    const audit = (a: string, meta?: Record<string, any>) =>
      this.audit.record({
        action: a,
        actorId: actor?.id ?? null,
        actorEmail: actor?.email ?? null,
        targetType: 'company',
        targetId: tenantId,
        targetName: company?.name ?? null,
        metadata: meta,
      });

    if (action === 'approve') {
      // Find the ApprovalRequest, create the admin user
      const req = await this.prisma.approvalRequest.findFirst({ where: { companyId: tenantId } });
      if (req) {
        let passwordHash: string;
        // Use the dedicated passwordHash field (set during registration).
        // Fall back to a forced-reset password if the field is absent (legacy
        // requests created before the migration).
        if (req.passwordHash) {
          passwordHash = req.passwordHash;
        } else {
          passwordHash = await bcrypt.hash('ChangeMe123!', 12);
        }
        await this.prisma.user.create({
          data: {
            email: req.email.toLowerCase(),
            passwordHash,
            name: req.fullName,
            phone: req.phone,
            role: 'ADMIN',
            companyId: tenantId,
            emailVerified: true, // owner-approved accounts are pre-verified
          },
        });
        await this.prisma.approvalRequest.update({
          where: { id: req.id },
          data: { status: 'APPROVED' },
        });

        // Send welcome email to the newly approved admin user
        await this.email.sendWelcomeEmail(req.email, req.fullName, req.company);
      }
      const updated = await this.prisma.company.update({
        where: { id: tenantId },
        data: {
          isActive: true,
          plan: 'starter',
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      });
      await audit('tenant.approve');
      return updated;
    }

    if (action === 'reject') {
      await this.prisma.approvalRequest.updateMany({
        where: { companyId: tenantId },
        data: { status: 'REJECTED', notes: opts?.reason },
      });
      const updated = await this.prisma.company.update({ where: { id: tenantId }, data: { isActive: false } });
      await audit('tenant.reject', { reason: opts?.reason ?? null });
      return updated;
    }

    if (action === 'suspend') {
      const updated = await this.prisma.company.update({ where: { id: tenantId }, data: { isActive: false } });
      await audit('tenant.suspend', { reason: opts?.reason ?? null });
      return updated;
    }

    throw new Error('Unknown action');
  }

  // ── Secure impersonation ("view as tenant") ───────────────────────────
  //
  // Mints a short-lived, tenant-scoped access token impersonating an ADMIN
  // user of the target tenant, so the owner can debug a tenant exactly as
  // they see it. The token carries an `impersonatedBy` claim and a 30-minute
  // expiry, and every issuance is written to the audit trail.
  async impersonate(tenantId: string, actor?: OwnerActor) {
    const company = await this.prisma.company.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, isActive: true },
    });
    if (!company) throw new NotFoundException('Tenant not found');

    // Prefer an active admin; fall back to any active user of the tenant.
    const target =
      (await this.prisma.user.findFirst({
        where: { companyId: tenantId, role: 'ADMIN', isActive: true },
        select: { id: true, email: true, role: true },
      })) ??
      (await this.prisma.user.findFirst({
        where: { companyId: tenantId, isActive: true },
        select: { id: true, email: true, role: true },
      }));

    if (!target) {
      throw new BadRequestException(
        'Tenant has no active user to impersonate. Approve/onboard a user first.',
      );
    }

    const accessToken = this.jwt.sign(
      {
        sub: target.id,
        email: target.email,
        companyId: tenantId,
        role: target.role,
        type: 'tenant',
        impersonatedBy: actor?.id ?? null,
      },
      {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: '30m',
      },
    );

    await this.audit.record({
      action: 'tenant.impersonate',
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      targetType: 'company',
      targetId: tenantId,
      targetName: company.name,
      metadata: { impersonatedUserId: target.id, impersonatedEmail: target.email },
    });

    return {
      access_token: accessToken,
      expiresInMinutes: 30,
      tenant: { id: company.id, name: company.name },
      impersonatedUser: { id: target.id, email: target.email, role: target.role },
    };
  }

  /** Generate a temporary view-as-tenant context. */
  async viewModeContext(tenantId: string) {
    return this.prisma.company.findUniqueOrThrow({
      where: { id: tenantId },
      select: { id: true, name: true, logoUrl: true, primaryColor: true },
    });
  }

  // ── Platform metrics ──────────────────────────────────────────────────

  async platformMetrics() {
    const [tenants, users, waybills, collections, revenue] = await Promise.all([
      this.prisma.company.count({ where: { isActive: true } }),
      this.prisma.user.count(),
      this.prisma.waybill.count(),
      this.prisma.collection.count(),
      this.prisma.payment.aggregate({ where: { status: 'SUCCESS' }, _sum: { amount: true } }),
    ]);
    return { tenants, users, waybills, collections, totalRevenue: revenue._sum.amount ?? 0 };
  }

  // ── World-class platform analytics ────────────────────────────────────
  //
  // Real SaaS + operational intelligence for the owner console: MRR/ARR/ARPA,
  // plan mix, tenant growth (with 30-day trend deltas), cross-tenant delivery
  // KPIs, a tenant-health leaderboard, and a 6-month growth series for charts.
  // Computed entirely from existing data — no schema change required.

  private static readonly PLAN_PRICE_ZAR: Record<string, number> = {
    starter: 0,
    professional: 11999,
    enterprise: 29999,
  };

  private planPrice(plan?: string | null): number {
    return OwnerService.PLAN_PRICE_ZAR[(plan || 'starter').toLowerCase()] ?? 0;
  }

  /** Effective monthly price: a per-tenant custom price wins over the plan list price. */
  private effPrice(c: { plan?: string | null; priceOverrideZar?: number | null }): number {
    return c.priceOverrideZar != null ? c.priceOverrideZar : this.planPrice(c.plan);
  }

  async platformAnalytics() {
    const now = new Date();
    const d30 = new Date(now); d30.setDate(d30.getDate() - 30);
    const d60 = new Date(now); d60.setDate(d60.getDate() - 60);
    const pct = (cur: number, prev: number) =>
      prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : 0;

    const companies = await this.prisma.company.findMany({
      select: {
        id: true, name: true, plan: true, priceOverrideZar: true, isActive: true, createdAt: true, country: true,
        _count: { select: { users: true, waybills: true } },
      },
    });
    const active = companies.filter((c) => c.isActive);

    // ── Revenue (MRR/ARR/ARPA) from active subscriptions ──
    const mrr = active.reduce((s, c) => s + this.effPrice(c), 0);
    const mrrPrev = companies
      .filter((c) => c.isActive && c.createdAt <= d30)
      .reduce((s, c) => s + this.effPrice(c), 0);
    const payingTenants = active.filter((c) => this.effPrice(c) > 0).length;
    const arpa = payingTenants ? mrr / payingTenants : 0;

    // ── Tenant growth + churn (window approximation) ──
    const newThisPeriod = companies.filter((c) => c.createdAt > d30).length;
    const newPrevPeriod = companies.filter((c) => c.createdAt > d60 && c.createdAt <= d30).length;
    const churnedThisPeriod = companies.filter(
      (c) => !c.isActive && c.createdAt <= d30,
    ).length;
    const churnRate = active.length + churnedThisPeriod > 0
      ? (churnedThisPeriod / (active.length + churnedThisPeriod)) * 100
      : 0;

    // ── Plan distribution ──
    const planDistribution = ['starter', 'professional', 'enterprise'].map((p) => ({
      plan: p,
      count: active.filter((c) => (c.plan || 'starter').toLowerCase() === p).length,
      mrr: active
        .filter((c) => (c.plan || 'starter').toLowerCase() === p)
        .reduce((s, c) => s + this.effPrice(c), 0),
    }));

    // ── 6-month tenant growth series (new + cumulative) ──
    const growth: Array<{ month: string; newTenants: number; cumulative: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const newTenants = companies.filter((c) => c.createdAt >= start && c.createdAt < end).length;
      const cumulative = companies.filter((c) => c.createdAt < end).length;
      growth.push({
        month: start.toLocaleString('en', { month: 'short', year: '2-digit' }),
        newTenants,
        cumulative,
      });
    }

    // ── Cross-tenant operations ──
    const [totalWaybills, deliveries30, delivered, failed, returned] = await Promise.all([
      this.prisma.waybill.count(),
      this.prisma.waybill.count({ where: { createdAt: { gt: d30 } } }),
      this.prisma.waybill.count({ where: { status: 'DELIVERED' } }),
      this.prisma.waybill.count({ where: { status: 'FAILED_DELIVERY' } }),
      this.prisma.waybill.count({ where: { status: 'RETURNED' } }),
    ]);
    const outcomes = delivered + failed + returned;
    const deliverySuccess = outcomes ? (delivered / outcomes) * 100 : 0;
    const exceptionRate = outcomes ? ((failed + returned) / outcomes) * 100 : 0;

    const shipDelivered = await this.prisma.shipment.findMany({
      where: {
        status: 'DELIVERED',
        deliveredAt: { not: null },
        estimatedDelivery: { not: null },
      },
      select: { deliveredAt: true, estimatedDelivery: true },
      take: 5000,
    });
    const onTime = shipDelivered.filter(
      (s) => s.deliveredAt! <= s.estimatedDelivery!,
    ).length;
    const onTimeRate = shipDelivered.length ? (onTime / shipDelivered.length) * 100 : 0;

    // ── Collected revenue (payments) — total + 30-day window ──
    const [revAll, rev30, rev60] = await Promise.all([
      this.prisma.payment.aggregate({ where: { status: 'SUCCESS' }, _sum: { amount: true } }),
      this.prisma.payment.aggregate({ where: { status: 'SUCCESS', createdAt: { gt: d30 } }, _sum: { amount: true } }),
      this.prisma.payment.aggregate({ where: { status: 'SUCCESS', createdAt: { gt: d60, lte: d30 } }, _sum: { amount: true } }),
    ]);

    // ── Tenant-health leaderboard (0–100 composite) ──
    const wbByCompany = await this.prisma.waybill.groupBy({
      by: ['companyId'],
      _count: { _all: true },
      where: { createdAt: { gt: d30 } },
    });
    const recentVolume = new Map(wbByCompany.map((w) => [w.companyId, w._count._all]));
    const health = active
      .map((c) => {
        const vol30 = recentVolume.get(c.id) ?? 0;
        const usersScore = (Math.min(c._count.users, 10) / 10) * 25;
        const volumeScore = (Math.min(vol30, 100) / 100) * 45;
        const planScore = this.effPrice(c) > 0 ? 30 : 8;
        const score = Math.round(usersScore + volumeScore + planScore);
        const risk = score >= 70 ? 'healthy' : score >= 40 ? 'watch' : 'at_risk';
        return {
          id: c.id, name: c.name, plan: c.plan ?? 'starter',
          users: c._count.users, waybillsTotal: c._count.waybills,
          waybills30: vol30, score, risk,
        };
      })
      .sort((a, b) => b.score - a.score);

    const topByVolume = [...health].sort((a, b) => b.waybills30 - a.waybills30).slice(0, 5);

    return {
      generatedAt: now.toISOString(),
      currency: 'ZAR',
      revenue: {
        mrr, arr: mrr * 12, arpa,
        mrrDelta: pct(mrr, mrrPrev),
        collectedTotal: revAll._sum.amount ?? 0,
        collected30: rev30._sum.amount ?? 0,
        collectedDelta: pct(rev30._sum.amount ?? 0, rev60._sum.amount ?? 0),
      },
      tenants: {
        total: companies.length, active: active.length, paying: payingTenants,
        newThisPeriod, newDelta: pct(newThisPeriod, newPrevPeriod),
        churnedThisPeriod, churnRate,
      },
      planDistribution,
      growth,
      operations: {
        totalWaybills, deliveries30, deliverySuccess, exceptionRate, onTimeRate,
      },
      health,
      topByVolume,
    };
  }

  // ── Platform live operations (cross-tenant map) ───────────────────────
  //
  // A single operational picture across every tenant: live courier positions
  // (from shipment telemetry) and recent delivery exceptions, both with
  // coordinates, for the owner ops map + exception heatmap.
  async liveOps() {
    // Only PENDING and IN_TRANSIT shipments are actively in-motion.
    // ShipmentStatus enum: PENDING | IN_TRANSIT | DELIVERED | FAILED
    const activeStatuses: ShipmentStatus[] = [ShipmentStatus.PENDING, ShipmentStatus.IN_TRANSIT];

    const shipments = await this.prisma.shipment.findMany({
      where: {
        status: { in: activeStatuses },
        currentLat: { not: null },
        currentLng: { not: null },
      },
      select: {
        id: true, status: true, currentLat: true, currentLng: true,
        company: { select: { id: true, name: true } },
        driver: { select: { name: true, vehicleReg: true } },
        waybill: { select: { trackingNumber: true, recipientLat: true, recipientLng: true } },
      },
      take: 2000,
    });

    const couriers = shipments.map((s) => ({
      id: s.id,
      status: s.status,
      lat: s.currentLat,
      lng: s.currentLng,
      tenantId: s.company?.id ?? null,
      tenant: s.company?.name ?? null,
      driver: s.driver?.name ?? null,
      vehicleReg: s.driver?.vehicleReg ?? null,
      trackingNumber: s.waybill?.trackingNumber ?? null,
      destLat: s.waybill?.recipientLat ?? null,
      destLng: s.waybill?.recipientLng ?? null,
    }));

    const exceptionWaybills = await this.prisma.waybill.findMany({
      where: {
        status: { in: ['FAILED_DELIVERY', 'RETURNED'] as any },
        recipientLat: { not: null },
        recipientLng: { not: null },
      },
      select: {
        id: true, trackingNumber: true, status: true,
        recipientLat: true, recipientLng: true,
        company: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    const exceptions = exceptionWaybills.map((w) => ({
      id: w.id,
      lat: w.recipientLat,
      lng: w.recipientLng,
      status: w.status,
      tenant: w.company?.name ?? null,
      trackingNumber: w.trackingNumber,
    }));

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        activeCouriers: couriers.length,
        exceptions: exceptions.length,
        tenantsActive: new Set(couriers.map((c) => c.tenantId).filter(Boolean)).size,
      },
      couriers,
      exceptions,
    };
  }

  // ── Per-tenant deep-dive ──────────────────────────────────────────────
  //
  // Everything an owner needs to assess a single tenant: profile, usage,
  // revenue, delivery KPIs, a 6-month volume trend, recent activity, and the
  // audit trail scoped to this tenant.
  async tenantAnalytics(tenantId: string) {
    const now = new Date();
    const d30 = new Date(now); d30.setDate(d30.getDate() - 30);

    const company = await this.prisma.company.findUnique({
      where: { id: tenantId },
      select: {
        id: true, name: true, tradingName: true, email: true, phone: true,
        plan: true, priceOverrideZar: true, featureOverrides: true,
        isActive: true, createdAt: true, country: true, city: true,
        slaBreachMinutes: true, slaWarningMinutes: true,
        _count: { select: { users: true, waybills: true, collections: true, drivers: true, invoices: true } },
      },
    });
    if (!company) throw new NotFoundException('Tenant not found');

    const [delivered, failed, returned, waybills30, shipments] = await Promise.all([
      this.prisma.waybill.count({ where: { companyId: tenantId, status: 'DELIVERED' } }),
      this.prisma.waybill.count({ where: { companyId: tenantId, status: 'FAILED_DELIVERY' } }),
      this.prisma.waybill.count({ where: { companyId: tenantId, status: 'RETURNED' } }),
      this.prisma.waybill.count({ where: { companyId: tenantId, createdAt: { gt: d30 } } }),
      this.prisma.shipment.findMany({
        where: { companyId: tenantId, status: 'DELIVERED', deliveredAt: { not: null }, estimatedDelivery: { not: null } },
        select: { deliveredAt: true, estimatedDelivery: true },
        take: 5000,
      }),
    ]);
    const outcomes = delivered + failed + returned;
    const deliverySuccess = outcomes ? (delivered / outcomes) * 100 : 0;
    const exceptionRate = outcomes ? ((failed + returned) / outcomes) * 100 : 0;
    const onTime = shipments.filter((s) => s.deliveredAt! <= s.estimatedDelivery!).length;
    const onTimeRate = shipments.length ? (onTime / shipments.length) * 100 : 0;

    const [revAll, rev30] = await Promise.all([
      this.prisma.payment.aggregate({ where: { companyId: tenantId, status: 'SUCCESS' }, _sum: { amount: true } }),
      this.prisma.payment.aggregate({ where: { companyId: tenantId, status: 'SUCCESS', createdAt: { gt: d30 } }, _sum: { amount: true } }),
    ]);

    // 6-month waybill volume trend for this tenant
    const allWaybills = await this.prisma.waybill.findMany({
      where: { companyId: tenantId },
      select: { createdAt: true },
    });
    const trend: Array<{ month: string; waybills: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      trend.push({
        month: start.toLocaleString('en', { month: 'short', year: '2-digit' }),
        waybills: allWaybills.filter((w) => w.createdAt >= start && w.createdAt < end).length,
      });
    }

    const recentWaybills = await this.prisma.waybill.findMany({
      where: { companyId: tenantId },
      select: { id: true, trackingNumber: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const auditTrail = await this.audit.list({ targetId: tenantId, limit: 20 });

    // Health score (same composite as the platform leaderboard)
    const usersScore = (Math.min(company._count.users, 10) / 10) * 25;
    const volumeScore = (Math.min(waybills30, 100) / 100) * 45;
    const planScore = this.effPrice(company) > 0 ? 30 : 8;
    const score = Math.round(usersScore + volumeScore + planScore);

    return {
      generatedAt: now.toISOString(),
      currency: 'ZAR',
      tenant: {
        id: company.id, name: company.name, tradingName: company.tradingName,
        email: company.email, phone: company.phone, plan: company.plan ?? 'starter',
        priceOverrideZar: company.priceOverrideZar ?? null,
        featureOverrides: (company.featureOverrides ?? {}) as Record<string, boolean>,
        isActive: company.isActive, createdAt: company.createdAt,
        country: company.country, city: company.city,
        slaBreachMinutes: company.slaBreachMinutes, slaWarningMinutes: company.slaWarningMinutes,
      },
      usage: {
        users: company._count.users,
        waybillsTotal: company._count.waybills,
        waybills30,
        collections: company._count.collections,
        drivers: company._count.drivers,
        invoices: company._count.invoices,
      },
      revenue: {
        mrr: this.effPrice(company),
        collectedTotal: revAll._sum.amount ?? 0,
        collected30: rev30._sum.amount ?? 0,
      },
      operations: { delivered, failed, returned, deliverySuccess, exceptionRate, onTimeRate },
      trend,
      recentWaybills,
      auditTrail,
      health: { score, risk: score >= 70 ? 'healthy' : score >= 40 ? 'watch' : 'at_risk' },
    };
  }

  // ── True MRR movement (daily snapshots) ───────────────────────────────
  //
  // A daily snapshot stores the platform MRR plus a per-tenant price map.
  // Diffing the two most recent snapshots yields real movement: new /
  // expansion / contraction / churn — the breakdown SaaS operators rely on.

  /** Capture today's MRR snapshot (idempotent: one row per calendar day). */
  async captureMrrSnapshot() {
    const companies = await this.prisma.company.findMany({
      where: { isActive: true },
      select: { id: true, plan: true, priceOverrideZar: true },
    });
    const perTenant: Record<string, number> = {};
    let mrr = 0;
    let paying = 0;
    for (const c of companies) {
      const price = this.effPrice(c);
      perTenant[c.id] = price;
      mrr += price;
      if (price > 0) paying += 1;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.prisma.mrrSnapshot.upsert({
      where: { date: today },
      create: {
        date: today,
        mrr,
        activeTenants: companies.length,
        payingTenants: paying,
        perTenant,
      },
      update: { mrr, activeTenants: companies.length, payingTenants: paying, perTenant },
    });
  }

  /** Daily at 00:05 — build the MRR history series. */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async dailyMrrSnapshot() {
    try {
      await this.captureMrrSnapshot();
    } catch {
      /* best-effort; never crash the scheduler */
    }
  }

  /** Real MRR movement between the two most recent snapshots + a trend series. */
  async mrrMovement() {
    // Ensure there is at least a snapshot for today so the console isn't empty
    // before the first cron run.
    const todayCount = await this.prisma.mrrSnapshot.count();
    if (todayCount === 0) {
      await this.captureMrrSnapshot();
    }

    const snapshots = await this.prisma.mrrSnapshot.findMany({
      orderBy: { date: 'desc' },
      take: 30,
    });

    const series = [...snapshots]
      .reverse()
      .map((s) => ({
        date: s.date.toISOString().slice(0, 10),
        mrr: s.mrr,
      }));

    const movement = {
      newBusiness: 0,
      expansion: 0,
      contraction: 0,
      churn: 0,
      net: 0,
      current: snapshots[0]?.mrr ?? 0,
      previous: snapshots[1]?.mrr ?? 0,
      hasComparison: snapshots.length >= 2,
    };

    if (snapshots.length >= 2) {
      const cur = (snapshots[0].perTenant ?? {}) as Record<string, number>;
      const prev = (snapshots[1].perTenant ?? {}) as Record<string, number>;
      const ids = new Set([...Object.keys(cur), ...Object.keys(prev)]);
      for (const id of ids) {
        const a = prev[id] ?? 0;
        const b = cur[id] ?? 0;
        if (a === 0 && b > 0) movement.newBusiness += b;
        else if (a > 0 && b === 0) movement.churn += a;
        else if (b > a) movement.expansion += b - a;
        else if (b < a) movement.contraction += a - b;
      }
      movement.net =
        movement.newBusiness + movement.expansion - movement.contraction - movement.churn;
    }

    return {
      currency: 'ZAR',
      generatedAt: new Date().toISOString(),
      series,
      movement,
      snapshotCount: snapshots.length,
    };
  }

  // ── Tenant user management (owner-level) ─────────────────────────────

  async listTenantUsers(tenantId: string) {
    return this.prisma.user.findMany({
      where: { companyId: tenantId },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async resetTenantUserPassword(userId: string, newPassword: string, actor?: OwnerActor) {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
      select: { id: true, email: true, companyId: true },
    });
    await this.audit.record({
      action: 'user.password_reset',
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      targetType: 'user',
      targetId: userId,
      targetName: user.email,
    });
    return { message: 'Password updated', userId: user.id };
  }

  async createTenantAdmin(tenantId: string, dto: { name: string; email: string; password: string }, actor?: OwnerActor) {
    const company = await this.prisma.company.findUnique({ where: { id: tenantId }, select: { name: true } });
    const passwordHash = await bcrypt.hash(dto.password, 12);
    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          email: dto.email.toLowerCase(),
          name: dto.name,
          passwordHash,
          role: 'ADMIN',
          companyId: tenantId,
          emailVerified: true, // owner-created admins are pre-verified
        },
        select: { id: true, email: true, name: true },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException('A user with this email already exists in this tenant.');
      }
      throw e;
    }
    await this.audit.record({
      action: 'user.create',
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      targetType: 'user',
      targetId: user.id,
      targetName: user.email,
      metadata: { tenantId, tenantName: company?.name ?? null },
    });
    return user;
  }

  async activateTenant(tenantId: string, actor?: OwnerActor) {
    const updated = await this.prisma.company.update({ where: { id: tenantId }, data: { isActive: true } });
    await this.audit.record({
      action: 'tenant.activate',
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      targetType: 'company',
      targetId: tenantId,
      targetName: updated.name,
    });
    return updated;
  }

  /**
   * Permanently delete a tenant and ALL its data. Destructive and irreversible —
   * every child record (users, waybills, collections, shipments, invoices,
   * drivers, etc.) is removed via DB cascade. Audited before the row disappears.
   * The frontend requires the owner to type the tenant name to confirm.
   */
  async deleteTenant(tenantId: string, actor?: OwnerActor) {
    const company = await this.prisma.company.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, plan: true, _count: { select: { users: true, waybills: true } } },
    });
    if (!company) throw new NotFoundException('Tenant not found');

    // Record the intent first so the audit trail survives the cascade delete.
    await this.audit.record({
      action: 'tenant.delete',
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      targetType: 'company',
      targetId: tenantId,
      targetName: company.name,
      metadata: { plan: company.plan, users: company._count.users, waybills: company._count.waybills },
    });

    await this.prisma.company.delete({ where: { id: tenantId } });
    return { deleted: true, id: tenantId, name: company.name };
  }

  // ── AI alerts (critical events across all tenants) ────────────────────
  async getPlatformAlerts() {
    return this.prisma.aiEvent.findMany({
      where: { severity: 'critical', resolved: false },
      include: { company: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ── Audit log ─────────────────────────────────────────────────────────

  async getAuditLog(query?: any) {
    return this.audit.list({
      action: query?.action,
      actorId: query?.actorId,
      targetId: query?.targetId,
      limit: query?.limit,
    });
  }

  // ── Plans ─────────────────────────────────────────────────────────────

  /**
   * FlowOps billing plans — synced from Paystack (Flowops Holdings, ID: 1839930).
   *
   *   Starter:      FREE   (no Paystack plan — instant activation, no billing)
   *   Professional: ZAR 11,999 / month  PLN_l3kobthzahnkpf3
   *   Enterprise:   ZAR 29,999 / month  PLN_9at9kn2ra8jtae0
   *
   *   NOTE: the Professional Paystack plan amount must be updated in the
   *   Paystack dashboard (or a new plan code issued) to charge R11,999.
   */
  async getPlans() {
    const E = PLAN_ENTITLEMENTS;
    return [
      {
        id: 'starter',
        name: 'Starter',
        description: 'For small couriers getting started — free, no credit card required',
        maxUsers: E.starter.limits.users,
        maxWaybills: E.starter.limits.waybillsPerMonth,
        maxDrivers: E.starter.limits.drivers,
        maxBranches: E.starter.limits.branches,
        price: 0,
        currency: 'ZAR',
        interval: null,            // free — not billed
        paystackPlanCode: null,    // no Paystack subscription — activated instantly via planId:'starter'
        popular: false,
      },
      {
        id: 'professional',
        name: 'Professional',
        description: 'Full FlowOps feature suite for growing couriers',
        maxUsers: E.professional.limits.users,
        maxWaybills: E.professional.limits.waybillsPerMonth,
        maxDrivers: E.professional.limits.drivers,
        maxBranches: E.professional.limits.branches,
        price: E.professional.priceZar,
        currency: 'ZAR',
        interval: 'month',
        paystackPlanCode: 'PLN_l3kobthzahnkpf3',
        popular: true,
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        description: 'Unlimited scale + white-label + dedicated support',
        maxUsers: E.enterprise.limits.users,
        maxWaybills: E.enterprise.limits.waybillsPerMonth,
        maxDrivers: E.enterprise.limits.drivers,
        maxBranches: E.enterprise.limits.branches,
        price: E.enterprise.priceZar,
        currency: 'ZAR',
        interval: 'month',
        paystackPlanCode: 'PLN_9at9kn2ra8jtae0',
        popular: false,
      },
    ];
  }

  async updateTenantPlan(tenantId: string, plan: string, actor?: OwnerActor) {
    const before = await this.prisma.company.findUnique({
      where: { id: tenantId },
      select: { name: true, plan: true },
    });
    const updated = await this.prisma.company.update({ where: { id: tenantId }, data: { plan } });
    await this.audit.record({
      action: 'tenant.plan_change',
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      targetType: 'company',
      targetId: tenantId,
      targetName: before?.name ?? null,
      metadata: { from: before?.plan ?? null, to: plan },
    });
    return updated;
  }

  /**
   * Feature catalog for the owner subscription editor: every feature key with a
   * human label and which plan tiers include it by default. The owner toggles
   * these as per-tenant add-ons (granted on top of the tenant's plan).
   */
  getFeatureCatalog() {
    return FEATURE_KEYS.map((key) => ({
      key,
      label: FEATURE_LABELS[key] ?? key,
      includedIn: {
        starter: Boolean(PLAN_ENTITLEMENTS.starter.features[key]),
        professional: Boolean(PLAN_ENTITLEMENTS.professional.features[key]),
        enterprise: Boolean(PLAN_ENTITLEMENTS.enterprise.features[key]),
      },
    }));
  }

  /**
   * Owner edits a tenant's full subscription in one call: plan tier, per-tenant
   * feature add-ons (grant Enterprise features to a Professional tenant without a
   * full upgrade), and a custom negotiated price. Any field omitted is left as-is.
   * Audit-logged with a before/after diff.
   */
  async updateTenantSubscription(
    tenantId: string,
    body: { plan?: string; featureOverrides?: Record<string, boolean>; priceOverrideZar?: number | null },
    actor?: OwnerActor,
  ) {
    const before = await this.prisma.company.findUnique({
      where: { id: tenantId },
      select: { name: true, plan: true, featureOverrides: true, priceOverrideZar: true },
    });
    if (!before) throw new NotFoundException('Tenant not found');

    const data: any = {};
    if (body.plan !== undefined) {
      const allowed = ['starter', 'professional', 'enterprise'];
      const plan = String(body.plan).toLowerCase();
      if (!allowed.includes(plan)) throw new BadRequestException(`Invalid plan. Use: ${allowed.join(', ')}`);
      data.plan = plan;
    }
    if (body.featureOverrides !== undefined) {
      // Keep only known feature keys set to true — a clean grant-map.
      const clean: Record<string, boolean> = {};
      for (const k of FEATURE_KEYS) if (body.featureOverrides?.[k]) clean[k] = true;
      data.featureOverrides = clean;
    }
    if (body.priceOverrideZar !== undefined) {
      data.priceOverrideZar =
        body.priceOverrideZar === null || Number.isNaN(Number(body.priceOverrideZar))
          ? null
          : Math.max(0, Number(body.priceOverrideZar));
    }

    const updated = await this.prisma.company.update({ where: { id: tenantId }, data });

    await this.audit.record({
      action: 'tenant.subscription_change',
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      targetType: 'company',
      targetId: tenantId,
      targetName: before.name,
      metadata: {
        from: { plan: before.plan, featureOverrides: before.featureOverrides, priceOverrideZar: before.priceOverrideZar },
        to: { plan: data.plan ?? before.plan, featureOverrides: data.featureOverrides ?? before.featureOverrides, priceOverrideZar: data.priceOverrideZar ?? before.priceOverrideZar },
      },
    });

    return {
      id: updated.id,
      plan: updated.plan,
      featureOverrides: (updated.featureOverrides ?? {}) as Record<string, boolean>,
      priceOverrideZar: updated.priceOverrideZar ?? null,
    };
  }

  // ── Approval requests ─────────────────────────────────────────────────

  async getApprovalRequests(query?: any) {
    return this.prisma.approvalRequest.findMany({
      where: query?.status ? { status: query.status } : {},
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveRequest(requestId: string, actor?: OwnerActor) {
    const req = await this.prisma.approvalRequest.findUniqueOrThrow({ where: { id: requestId } });
    // Create company + user
    // Use the dedicated passwordHash column set during registration.
    // The legacy path that read from JSON.parse(req.notes) was always wrong —
    // notes never contained a passwordHash; only the dedicated column does.
    // Fall back to a forced-change password only for truly ancient requests
    // that predate the column (i.e. passwordHash is genuinely null/undefined).
    let passwordHash: string;
    if (req.passwordHash) {
      passwordHash = req.passwordHash;
    } else {
      passwordHash = await bcrypt.hash('ChangeMe123!', 12);
      this.logger.warn(`approveRequest: no passwordHash on request ${requestId} — tenant must reset password on first login.`);
    }

    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14-day trial
    const company = await this.prisma.company.create({
      data: { name: req.company, email: req.email, isActive: true, plan: 'starter', trialEndsAt },
    });
    try {
      await this.prisma.user.create({
        data: { email: req.email, passwordHash, name: req.fullName, phone: req.phone, role: 'ADMIN', companyId: company.id, emailVerified: true },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        // Roll back the just-created company so a retry/approve is clean.
        await this.prisma.company.delete({ where: { id: company.id } }).catch(() => undefined);
        throw new ConflictException('A user with this email already exists. This request may have already been approved.');
      }
      throw e;
    }
    await this.prisma.approvalRequest.update({
      where: { id: requestId },
      data: { status: 'APPROVED', companyId: company.id },
    });
    await this.audit.record({
      action: 'request.approve',
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      targetType: 'company',
      targetId: company.id,
      targetName: company.name,
      metadata: { requestId, email: req.email },
    });
    return { company, message: 'Approved and onboarded' };
  }

  async rejectRequest(requestId: string, reason?: string, actor?: OwnerActor) {
    const updated = await this.prisma.approvalRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED', notes: reason },
    });
    await this.audit.record({
      action: 'request.reject',
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      targetType: 'request',
      targetId: requestId,
      targetName: updated.company ?? null,
      metadata: { reason: reason ?? null },
    });
    return updated;
  }
}
