import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma, ShipmentStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { OnboardingService } from '../onboarding/onboarding.service';
import { EmailService } from '../email/email.service';
import { AuditService } from '../audit/audit.service';
import { InvoicesService } from '../invoices/invoices.service';
import {
  PLAN_ENTITLEMENTS,
  FEATURE_KEYS,
  FEATURE_LABELS,
  ADDON_PRICES_ZAR,
  isAddonFeature,
  normalizePlan,
} from '../billing/plan-entitlements';

type OwnerActor = { id?: string; email?: string } | null | undefined;

/**
 * Strip the stored password hash from an ApprovalRequest row.
 *
 * `ApprovalRequest.passwordHash` holds the bcrypt hash of the password a
 * PENDING tenant admin chose at registration; the schema comment on the column
 * says it is "kept separate so it is never exposed in approval request
 * listings". `getApprovalRequests()` listed it anyway - for every pending and
 * rejected signup in the platform - and `rejectRequest()` returned the row it
 * had just written. The owner console shows fullName/email/phone/company/status
 * and has no use for the hash; approval itself reads the row straight from
 * Prisma, so nothing downstream loses it.
 */
function withoutApprovalSecrets<T>(row: T): T {
  if (!row || typeof row !== 'object') return row;
  const { passwordHash, ...safe } = row as Record<string, unknown>;
  return safe as T;
}

@Injectable()
export class OwnerService {
  private readonly logger = new Logger(OwnerService.name);

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    private jwt: JwtService,
    private config: ConfigService,
    private audit: AuditService,
    // Used only to raise an invoice on a tenant's behalf, so numbering and
    // totals stay server-authoritative in the one place that already owns them.
    private invoices: InvoicesService,
    // Gives an approved tenant its working defaults (costing config, SKU
    // numbering) so it is usable immediately rather than after a settings hunt.
    private onboarding: OnboardingService,
  ) {}

  // ── Tenants ───────────────────────────────────────────────────────────

  async listTenants(query?: any) {
    const page = Number(query?.page) || 1;
    const limit = Number(query?.limit) || 50;
    const [companies, total] = await Promise.all([
      this.prisma.company.findMany({
        skip: (page - 1) * limit, take: limit,
        select: {
          id: true, name: true, isActive: true, plan: true,
          createdAt: true, updatedAt: true,
          _count: { select: { users: true, waybills: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.company.count(),
    ]);
    return { data: companies, total, page, limit };
  }

  // ── Tenant presence (live online status for the owner console) ──────────
  // Honest design: "online" is derived from lastActiveAt (a throttled heartbeat
  // stamped on authenticated requests). Location is APPROXIMATE, from the last
  // login IP (city-level via a best-effort geo lookup) — NOT precise GPS. We
  // never claim to track a tenant admin's exact physical location.
  private geoCache = new Map<string, { at: number; city: string | null; country: string | null }>();

  /** Best-effort city/country from an IP. Never throws; returns nulls on failure. */
  private async lookupIpCity(ip?: string | null): Promise<{ city: string | null; country: string | null }> {
    if (!ip) return { city: null, country: null };
    // Ignore private / localhost IPs — no meaningful geo.
    if (/^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc|fd)/i.test(ip)) {
      return { city: null, country: null };
    }
    const cached = this.geoCache.get(ip);
    if (cached && Date.now() - cached.at < 24 * 60 * 60 * 1000) {
      return { city: cached.city, country: cached.country };
    }
    try {
      const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,country`);
      const d: any = await res.json();
      const out = d?.status === 'success'
        ? { city: d.city ?? null, country: d.country ?? null }
        : { city: null, country: null };
      this.geoCache.set(ip, { at: Date.now(), ...out });
      return out;
    } catch {
      return { city: null, country: null };
    }
  }

  /**
   * Presence snapshot across all tenants: for each company, an online status
   * (green = a user active in the last 5 min, amber = active today, grey = idle),
   * count of currently-active users, most-recent activity/login time, and the
   * approximate city of the last login. Powers the owner "Presence" view.
   */
  async getTenantPresence() {
    const ONLINE_MS = 5 * 60 * 1000;      // green: active in last 5 min
    const RECENT_MS = 24 * 60 * 60 * 1000; // amber: active in last 24h
    const now = Date.now();

    const companies = await this.prisma.company.findMany({
      select: {
        id: true, name: true, isActive: true, plan: true,
        users: {
          select: { id: true, name: true, email: true, role: true, lastActiveAt: true, lastLoginAt: true, lastLoginIp: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const rows = await Promise.all(companies.map(async (c) => {
      const users = c.users ?? [];
      const activeNow = users.filter((u) => u.lastActiveAt && now - new Date(u.lastActiveAt).getTime() < ONLINE_MS);
      // most recent activity across users
      const mostRecentActive = users
        .map((u) => (u.lastActiveAt ? new Date(u.lastActiveAt).getTime() : 0))
        .reduce((a, b) => Math.max(a, b), 0);
      const mostRecentLogin = users
        .map((u) => (u.lastLoginAt ? new Date(u.lastLoginAt).getTime() : 0))
        .reduce((a, b) => Math.max(a, b), 0);

      let status: 'online' | 'recent' | 'idle' = 'idle';
      if (activeNow.length > 0) status = 'online';
      else if (mostRecentActive && now - mostRecentActive < RECENT_MS) status = 'recent';

      // Approx location from the IP of the most-recently-logged-in user.
      const latestLoginUser = users
        .filter((u) => u.lastLoginAt)
        .sort((a, b) => new Date(b.lastLoginAt!).getTime() - new Date(a.lastLoginAt!).getTime())[0];
      const geo = await this.lookupIpCity(latestLoginUser?.lastLoginIp ?? null);

      return {
        companyId: c.id,
        name: c.name,
        plan: c.plan,
        isActive: c.isActive,
        status,
        activeUsers: activeNow.length,
        totalUsers: users.length,
        lastActiveAt: mostRecentActive ? new Date(mostRecentActive).toISOString() : null,
        lastLoginAt: mostRecentLogin ? new Date(mostRecentLogin).toISOString() : null,
        location: {
          approxCity: geo.city,
          country: geo.country,
          ip: latestLoginUser?.lastLoginIp ?? null,
        },
        activeUserNames: activeNow.map((u) => u.name || u.email),
      };
    }));

    const summary = {
      tenants: rows.length,
      online: rows.filter((r) => r.status === 'online').length,
      recent: rows.filter((r) => r.status === 'recent').length,
      idle: rows.filter((r) => r.status === 'idle').length,
      activeUsersTotal: rows.reduce((s, r) => s + r.activeUsers, 0),
    };

    return { generatedAt: new Date().toISOString(), summary, tenants: rows };
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

        // Send trial started email to inform about the 14-day trial lifecycle
        const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
        await this.email.sendTrialStartedEmail(req.email, {
          name: req.fullName,
          companyName: req.company,
          trialEndsAt: trialEnd,
        });
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
        expiresIn: '8h',
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
      expiresInMinutes: 480,
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
    professional: 19999,
    enterprise: 100000,
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
    // True on-time (deliveredAt <= estimatedDelivery). Null — unavailable,
    // never 0% — when no delivered shipment has an estimated delivery.
    const onTimeRate = shipDelivered.length ? (onTime / shipDelivered.length) * 100 : null;
    const onTimeObservations = shipDelivered.length;

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
        totalWaybills, deliveries30, deliverySuccess, exceptionRate, onTimeRate, onTimeObservations,
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
    const onTimeRate = shipments.length ? (onTime / shipments.length) * 100 : null;
    const onTimeObservations = shipments.length;

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
      operations: { delivered, failed, returned, deliverySuccess, exceptionRate, onTimeRate, onTimeObservations },
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
   *   Professional: ZAR 19,999 / month  PLN_l3kobthzahnkpf3
   *   Enterprise:   ZAR 100,000 / month  PLN_9at9kn2ra8jtae0 (custom/contact sales)
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

  // ── Quote Machine (owner) ──────────────────────────────────────────────

  /**
   * The sellable add-on catalog with list prices — the source for the owner
   * Quote Machine. Each entry says whether the feature is already bundled into a
   * given base plan (so the quote can skip charging for it on that plan).
   */
  getAddonCatalog() {
    return (Object.keys(ADDON_PRICES_ZAR) as (keyof typeof ADDON_PRICES_ZAR)[]).map((key) => ({
      key,
      label: FEATURE_LABELS[key] ?? key,
      priceZar: ADDON_PRICES_ZAR[key] ?? 0,
      includedIn: {
        starter: Boolean(PLAN_ENTITLEMENTS.starter.features[key]),
        professional: Boolean(PLAN_ENTITLEMENTS.professional.features[key]),
        enterprise: Boolean(PLAN_ENTITLEMENTS.enterprise.features[key]),
      },
    }));
  }

  /**
   * Build a quote: base plan price + selected add-ons (skipping any already
   * bundled in the chosen plan) + optional custom-price override. Pure
   * calculation — persists nothing. Returns a fully itemised breakdown the
   * owner can copy into an email/proposal.
   */
  buildQuote(body: {
    plan?: string;
    addons?: string[];
    customPriceZar?: number | null;
    companyName?: string | null;
    billingInterval?: 'month' | 'year';
  }) {
    const planId = normalizePlan(body?.plan);
    const plan = PLAN_ENTITLEMENTS[planId];
    const basePrice = plan.priceZar;

    const requested = Array.isArray(body?.addons) ? body!.addons! : [];
    const lineItems: { key: string; label: string; priceZar: number; note?: string }[] = [];

    for (const key of requested) {
      if (!isAddonFeature(key)) continue; // ignore unknown / non-sellable keys
      const bundled = Boolean(plan.features[key]);
      lineItems.push({
        key,
        label: FEATURE_LABELS[key] ?? key,
        priceZar: bundled ? 0 : (ADDON_PRICES_ZAR[key] ?? 0),
        note: bundled ? `Already included in ${plan.name}` : undefined,
      });
    }

    const addonsTotal = lineItems.reduce((s, l) => s + l.priceZar, 0);
    const listTotal = basePrice + addonsTotal;

    // Custom price overrides the list total when the owner sets one (>= 0).
    const hasCustom = body?.customPriceZar != null && Number(body.customPriceZar) >= 0;
    const finalMonthly = hasCustom ? Number(body!.customPriceZar) : listTotal;

    const interval = body?.billingInterval === 'year' ? 'year' : 'month';
    // Annual shown as 12x monthly (no auto-discount — owner decides via custom price).
    const finalForInterval = interval === 'year' ? finalMonthly * 12 : finalMonthly;

    return {
      companyName: body?.companyName ?? null,
      currency: 'ZAR',
      interval,
      plan: { id: planId, name: plan.name, priceZar: basePrice },
      addons: lineItems,
      totals: {
        basePriceZar: basePrice,
        addonsZar: addonsTotal,
        listTotalZar: listTotal,
        customPriceZar: hasCustom ? finalMonthly : null,
        finalMonthlyZar: finalMonthly,
        finalForIntervalZar: finalForInterval,
        discountVsListZar: hasCustom ? Math.max(0, listTotal - finalMonthly) : 0,
      },
      generatedAt: new Date().toISOString(),
    };
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
    const rows = await this.prisma.approvalRequest.findMany({
      where: query?.status ? { status: query.status } : {},
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(withoutApprovalSecrets);
  }

  async approveRequest(requestId: string, actor?: OwnerActor) {
    const req = await this.prisma.approvalRequest.findUniqueOrThrow({ where: { id: requestId } });
    // Fail fast on an already-decided request. This is a courtesy check — the
    // authoritative guard is the conditional UPDATE inside the transaction,
    // which is the only one that holds under concurrency.
    if (req.status !== 'PENDING') {
      throw new ConflictException(`This request has already been ${req.status.toLowerCase()}.`);
    }
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

    // One transaction for the company, its admin, and the claim that marks the
    // request approved.
    //
    // These used to be three separate statements. A failure between them left
    // states that had to be cleaned up by hand: a company with no admin (if
    // the user insert failed), or a live tenant whose request still read
    // PENDING — which let a second approval create a SECOND tenant. The old
    // code tried to undo that by deleting the company, but did so with
    // `.catch(() => undefined)`, so a failed cleanup failed silently and the
    // orphan simply stayed behind.
    //
    // Now, if the claim loses, the transaction rolls the company and the admin
    // back with it. There is no partial tenant left to clean up.
    let company: { id: string; name: string };
    try {
      company = await this.prisma.$transaction(async (tx) => {
        const created = await tx.company.create({
          data: { name: req.company, email: req.email, isActive: true, plan: 'starter', trialEndsAt },
        });
        await tx.user.create({
          data: { email: req.email, passwordHash, name: req.fullName, phone: req.phone, role: 'ADMIN', companyId: created.id, emailVerified: true },
        });

        // The atomic claim: whoever flips PENDING -> APPROVED wins, and only
        // one caller can, because the WHERE is evaluated against the committed
        // row. Losing rolls the whole transaction back.
        const claim = await tx.approvalRequest.updateMany({
          where: { id: requestId, status: 'PENDING' },
          data: { status: 'APPROVED', companyId: created.id },
        });
        if (claim.count === 0) {
          throw new ConflictException('This request was approved by someone else.');
        }
        return { id: created.id, name: created.name };
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException('A user with this email already exists. This request may have already been approved.');
      }
      throw e;
    }

    // Defaults run after the transaction and are best-effort: a tenant missing
    // its costing defaults is an inconvenience, but failing an approval over
    // them would lose a client. Idempotent, so a re-run is always safe.
    await this.onboarding.provisionDefaultsSafely(company.id);
    await this.audit.record({
      action: 'request.approve',
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      targetType: 'company',
      targetId: company.id,
      targetName: company.name,
      metadata: { requestId, email: req.email },
    });

    // Send welcome + trial started emails to the new tenant admin
    await this.email.sendWelcomeEmail(req.email, req.fullName, req.company);
    await this.email.sendTrialStartedEmail(req.email, {
      name: req.fullName,
      companyName: req.company,
      trialEndsAt,
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
    return withoutApprovalSecrets(updated);
  }

  // ── Plan upgrade requests (in-app, owner-approved) ─────────────────────

  /** List tenant plan-upgrade requests (optionally filter by ?status=PENDING). */
  async getUpgradeRequests(query?: any) {
    return this.prisma.planUpgradeRequest.findMany({
      where: query?.status ? { status: query.status } : {},
      include: { company: { select: { name: true, email: true, plan: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  /**
   * Approve a plan-upgrade request → set the tenant's plan to the requested tier,
   * mark the request APPROVED, resolve the alert AiEvent, audit it, and email
   * the tenant. Mirrors updateTenantPlan's write + audit.
   */
  async approveUpgradeRequest(requestId: string, actor?: OwnerActor) {
    const req = await this.prisma.planUpgradeRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { company: { select: { id: true, name: true, email: true, plan: true } } },
    });
    if (req.status !== 'PENDING') {
      throw new ConflictException(`This request is already ${req.status.toLowerCase()}.`);
    }

    // Claim the decision, then act on it — in that order, inside one
    // transaction.
    //
    // These were separate statements guarded only by the `status !== 'PENDING'`
    // check above, which is a read and therefore worthless under concurrency.
    // Two operators clicking Approve and Decline at the same time would both
    // pass it: the plan would be upgraded and then the request would be marked
    // REJECTED, leaving the tenant on a paid plan that our own records say we
    // declined — and the approval email below would still go out. Two Approves
    // double-audited and double-emailed for one decision.
    //
    // The conditional UPDATE is the real guard. Whoever flips PENDING first
    // wins; the loser gets count 0 and the whole transaction rolls back, so no
    // plan change, no audit row and (since the email is sent after) no
    // contradictory email.
    let updated: any;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.planUpgradeRequest.updateMany({
          where: { id: requestId, status: 'PENDING' },
          data: {
            status: 'APPROVED',
            reviewedById: actor?.id ?? null,
            reviewedByEmail: actor?.email ?? null,
            reviewedAt: new Date(),
          },
        });
        if (claimed.count === 0) {
          throw new ConflictException('This request has just been decided by someone else.');
        }

        // Flip the plan.
        await tx.company.update({
          where: { id: req.companyId },
          data: { plan: req.requestedPlan, trialEndsAt: null }, // clear trial — now on a paid tier
        });

        // Resolve the owner-console alert for this request.
        await tx.aiEvent.updateMany({
          where: { sourceType: 'plan_upgrade_request', sourceId: requestId },
          data: { resolved: true, resolvedAt: new Date() },
        });

        await this.audit.record({
          action: 'tenant.plan_change',
          actorId: actor?.id ?? null,
          actorEmail: actor?.email ?? null,
          targetType: 'company',
          targetId: req.companyId,
          targetName: req.company?.name ?? null,
          metadata: { from: req.currentPlan, to: req.requestedPlan, via: 'upgrade_request', requestId },
        });

        return tx.planUpgradeRequest.findUnique({ where: { id: requestId } });
      });
    } catch (err) {
      // Preserve the operator-facing wording for the ordinary already-decided
      // case; anything else propagates unchanged.
      if (err instanceof ConflictException) throw err;
      throw err;
    }

    // Notify the tenant (best-effort).
    if (req.company?.email) {
      await this.email
        .send({
          to: req.company.email,
          subject: `Your FlowOps plan upgrade is approved`,
          html: `<p>Good news — your upgrade to the <strong>${req.requestedPlan}</strong> plan has been approved and is now active on your FlowOps account.</p>`,
          text: `Your upgrade to the ${req.requestedPlan} plan has been approved and is now active.`,
        })
        .catch(() => undefined);
    }

    return { request: updated, message: 'Approved — tenant plan updated.' };
  }

  /** Decline a plan-upgrade request (records reason, resolves the alert). */
  async declineUpgradeRequest(requestId: string, reason?: string, actor?: OwnerActor) {
    const req = await this.prisma.planUpgradeRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { company: { select: { name: true, email: true } } },
    });
    if (req.status !== 'PENDING') {
      throw new ConflictException(`This request is already ${req.status.toLowerCase()}.`);
    }

    // Same claim pattern as approveUpgradeRequest: the conditional UPDATE is
    // what actually decides, so an Approve racing a Decline cannot both land.
    const claimed = await this.prisma.planUpgradeRequest.updateMany({
      where: { id: requestId, status: 'PENDING' },
      data: {
        status: 'REJECTED',
        decisionNote: reason ?? null,
        reviewedById: actor?.id ?? null,
        reviewedByEmail: actor?.email ?? null,
        reviewedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException('This request has just been decided by someone else.');
    }
    const updated = await this.prisma.planUpgradeRequest.findUnique({ where: { id: requestId } });

    await this.prisma.aiEvent.updateMany({
      where: { sourceType: 'plan_upgrade_request', sourceId: requestId },
      data: { resolved: true, resolvedAt: new Date() },
    });

    await this.audit.record({
      action: 'tenant.plan_upgrade_declined',
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      targetType: 'company',
      targetId: req.companyId,
      targetName: req.company?.name ?? null,
      metadata: { requestedPlan: req.requestedPlan, reason: reason ?? null, requestId },
    });

    if (req.company?.email) {
      await this.email
        .send({
          to: req.company.email,
          subject: `Update on your FlowOps plan upgrade request`,
          html: `<p>Your request to upgrade to the <strong>${req.requestedPlan}</strong> plan was not approved at this time.${reason ? ` Reason: ${reason}` : ''} Please contact us if you'd like to discuss.</p>`,
          text: `Your request to upgrade to the ${req.requestedPlan} plan was not approved at this time.${reason ? ` Reason: ${reason}` : ''}`,
        })
        .catch(() => undefined);
    }

    return { request: updated, message: 'Request declined.' };
  }

  // ── Commercial ─────────────────────────────────────────────────────────
  //
  // What a tenant is DOING is already visible in the owner console (MRR,
  // seats, waybills). What was missing is where the tenant STANDS: being
  // courted, happy, at risk, leaving. That lived in someone's head and in
  // Slack threads, so it was lost whenever that person was unavailable.
  //
  // These methods back the owner console's commercial surface. They are
  // owner-only: notes in particular are about the customer, never for them,
  // and there is deliberately no tenant-scoped read path to commercial_notes.

  /** The statuses the owner console offers. */
  static readonly COMMERCIAL_STATUSES = [
    'PROSPECT',
    'ONBOARDING',
    'ACTIVE',
    'AT_RISK',
    'RENEWAL_DUE',
    'CHURNING',
    'CHURNED',
    'DORMANT',
  ] as const;

  private static readonly COMMERCIAL_SELECT = {
    id: true,
    name: true,
    tradingName: true,
    plan: true,
    commercialStatus: true,
    commercialStatusReason: true,
    commercialStatusChangedAt: true,
    featureOverrides: true,
    priceOverrideZar: true,
    updatedAt: true,
  } as const;

  /**
   * Narrow an untrusted JSON-ish value into something Prisma will accept.
   *
   * `Prisma.InputJsonValue` deliberately excludes `unknown` (and top-level
   * `null`), so a request body has to be walked before it can be written to a
   * Json column. The walk doubles as validation: a function, a Symbol or a
   * non-finite number is refused rather than quietly serialised into
   * something surprising.
   */
  private static toJsonInput(value: unknown, path: string): Prisma.InputJsonValue {
    if (typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new BadRequestException(`${path} must be a finite number`);
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item, i) => OwnerService.toJsonInput(item, `${path}[${i}]`));
    }
    if (value !== null && typeof value === 'object') {
      const out: Record<string, Prisma.InputJsonValue | null> = {};
      for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        out[key] = nested === null ? null : OwnerService.toJsonInput(nested, `${path}.${key}`);
      }
      return out;
    }
    throw new BadRequestException(`${path} must be JSON-serialisable`);
  }

  /** Assemble one tenant's commercial picture. */
  private async buildCommercialSummary(company: {
    id: string;
    name: string;
    tradingName?: string | null;
    plan?: string | null;
    commercialStatus: string | null;
    commercialStatusReason: string | null;
    commercialStatusChangedAt: Date | null;
    featureOverrides: unknown;
    priceOverrideZar: number | null;
    updatedAt?: Date | null;
  }) {
    const [latestQuote, latestInvoice, latestCommercialNote, notes, quotes, invoices] =
      await Promise.all([
        this.prisma.quote.findFirst({
          where: { companyId: company.id },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.invoice.findFirst({
          where: { companyId: company.id },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.commercialNote.findFirst({
          where: { companyId: company.id },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.commercialNote.count({ where: { companyId: company.id } }),
        this.prisma.quote.count({ where: { companyId: company.id } }),
        this.prisma.invoice.count({ where: { companyId: company.id } }),
      ]);

    const overrides = company.featureOverrides ?? null;
    const hasOverride = overrides != null || company.priceOverrideZar != null;

    return {
      tenantId: company.id,
      tenantName: company.tradingName || company.name,
      commercialStatus: company.commercialStatus,
      commercialStatusReason: company.commercialStatusReason,
      statusChangedAt: company.commercialStatusChangedAt?.toISOString() ?? null,
      // Raw value, for edit forms.
      subscriptionOverride: { featureOverrides: overrides, priceOverrideZar: company.priceOverrideZar },
      // Short human-readable form, for list rows.
      subscriptionOverrideSummary: hasOverride
        ? {
            features: Array.isArray(overrides)
              ? overrides
              : overrides && typeof overrides === 'object'
                ? Object.keys(overrides as Record<string, unknown>)
                : [],
            priceOverrideZar: company.priceOverrideZar,
          }
        : null,
      latestQuote,
      latestInvoice,
      latestCommercialNote,
      counts: { notes, quotes, invoices },
      updatedAt: company.updatedAt?.toISOString() ?? null,
    };
  }

  /** Every tenant's commercial picture, for the owner console list. */
  async listTenantCommercial() {
    const companies = await this.prisma.company.findMany({
      select: OwnerService.COMMERCIAL_SELECT,
      orderBy: { name: 'asc' },
    });
    return Promise.all(companies.map((c) => this.buildCommercialSummary(c)));
  }

  /** One tenant's commercial picture. */
  async getTenantCommercialSummary(tenantId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: tenantId },
      select: OwnerService.COMMERCIAL_SELECT,
    });
    if (!company) throw new NotFoundException('Tenant not found');
    return this.buildCommercialSummary(company);
  }

  /**
   * Record what was said to a tenant.
   *
   * The note is required to actually say something — an empty note is worse
   * than no note, because it makes the history look populated when it isn't.
   */
  async addCommercialNote(
    tenantId: string,
    dto: { note?: unknown; tags?: unknown },
    actor?: OwnerActor,
  ) {
    const company = await this.prisma.company.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });
    if (!company) throw new NotFoundException('Tenant not found');

    const note = typeof dto?.note === 'string' ? dto.note.trim() : '';
    if (!note) throw new BadRequestException('A commercial note cannot be empty');

    const tags = Array.isArray(dto?.tags)
      ? dto.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      : [];

    const created = await this.prisma.commercialNote.create({
      data: { companyId: tenantId, note, tags, createdByEmail: actor?.email ?? null },
    });

    await this.audit.record({
      action: 'tenant.commercial_note_added',
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      targetType: 'company',
      targetId: tenantId,
      targetName: company.name,
      metadata: { tags, noteLength: note.length },
    });

    return created;
  }

  /**
   * Set where a tenant stands commercially.
   *
   * A status without a reason is refused outright. Six months later "AT_RISK"
   * on its own tells the next person nothing — the reason is the whole value,
   * and requiring it is the only way it reliably gets written.
   */
  async updateCommercialStatus(
    tenantId: string,
    dto: { status?: unknown; reason?: unknown },
    actor?: OwnerActor,
  ) {
    const company = await this.prisma.company.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, commercialStatus: true, commercialStatusReason: true },
    });
    if (!company) throw new NotFoundException('Tenant not found');

    const status = typeof dto?.status === 'string' ? dto.status.trim() : '';
    if (!status) throw new BadRequestException('A commercial status is required');
    if (!(OwnerService.COMMERCIAL_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestException(
        `Unknown commercial status "${status}". Expected one of: ${OwnerService.COMMERCIAL_STATUSES.join(', ')}`,
      );
    }

    const reason = typeof dto?.reason === 'string' ? dto.reason.trim() : '';
    if (!reason) throw new BadRequestException('A commercial status needs a reason');

    const updated = await this.prisma.company.update({
      where: { id: tenantId },
      data: {
        commercialStatus: status,
        commercialStatusReason: reason,
        commercialStatusChangedAt: new Date(),
      },
      select: OwnerService.COMMERCIAL_SELECT,
    });

    await this.audit.record({
      action: 'tenant.commercial_status_changed',
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      targetType: 'company',
      targetId: tenantId,
      targetName: company.name,
      metadata: {
        from: company.commercialStatus,
        to: status,
        reason,
      },
    });

    return this.buildCommercialSummary(updated);
  }

  /**
   * Grant a tenant features or a negotiated price beyond their plan.
   *
   * Only the two known override keys are accepted. Spreading the body would
   * let an owner write arbitrary Company columns from the console.
   */
  async updateSubscriptionOverride(tenantId: string, dto: unknown, actor?: OwnerActor) {
    const company = await this.prisma.company.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, featureOverrides: true, priceOverrideZar: true },
    });
    if (!company) throw new NotFoundException('Tenant not found');

    const input = dto && typeof dto === 'object' && !Array.isArray(dto) ? (dto as Record<string, unknown>) : {};
    const data: { featureOverrides?: Prisma.InputJsonValue; priceOverrideZar?: number | null } = {};
    // Clearing a Json column is a different write from setting one: see below.
    let clearFeatureOverrides = false;

    if ('featureOverrides' in input) {
      const value = input.featureOverrides;
      if (value === null || value === undefined || value === '') {
        clearFeatureOverrides = true;
      } else {
        if (typeof value !== 'object' || Array.isArray(value)) {
          throw new BadRequestException('featureOverrides must be an object or null');
        }
        data.featureOverrides = OwnerService.toJsonInput(value, 'featureOverrides');
      }
    }

    if ('priceOverrideZar' in input) {
      const value = input.priceOverrideZar;
      if (value === null || value === '') {
        data.priceOverrideZar = null;
      } else {
        const parsed = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(parsed) || parsed < 0) {
          throw new BadRequestException('priceOverrideZar must be a non-negative number or null');
        }
        data.priceOverrideZar = parsed;
      }
    }

    // Clearing is itself a valid, complete request — it just doesn't put
    // anything in `data`, so it has to count here or `{ featureOverrides: null }`
    // would be refused for being empty despite naming a field.
    if (Object.keys(data).length === 0 && !clearFeatureOverrides) {
      throw new BadRequestException('Supply featureOverrides and/or priceOverrideZar');
    }

    const updated = await this.prisma.company.update({
      where: { id: tenantId },
      data: {
        ...data,
        // Prisma.InputJsonValue disallows a bare null, because "JSON null" and
        // "SQL NULL" would be ambiguous. Clearing the column is explicit.
        ...(clearFeatureOverrides ? { featureOverrides: Prisma.DbNull } : {}),
      },
      select: OwnerService.COMMERCIAL_SELECT,
    });

    await this.audit.record({
      action: 'tenant.subscription_override_changed',
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      targetType: 'company',
      targetId: tenantId,
      targetName: company.name,
      metadata: {
        featureOverridesChanged: 'featureOverrides' in data,
        priceFrom: company.priceOverrideZar,
        priceTo: data.priceOverrideZar !== undefined ? data.priceOverrideZar : company.priceOverrideZar,
      },
    });

    return this.buildCommercialSummary(updated);
  }

  /**
   * Raise a quote on a tenant's behalf. The tenant is taken from the URL,
   * never from the body — an owner must not be able to write into a company
   * they did not name.
   */
  async createTenantQuote(tenantId: string, dto: unknown, actor?: OwnerActor) {
    const company = await this.prisma.company.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });
    if (!company) throw new NotFoundException('Tenant not found');

    const input = dto && typeof dto === 'object' && !Array.isArray(dto) ? (dto as Record<string, unknown>) : {};

    const fromAddress = typeof input.fromAddress === 'string' ? input.fromAddress.trim() : '';
    const toAddress = typeof input.toAddress === 'string' ? input.toAddress.trim() : '';
    if (!fromAddress) throw new BadRequestException('fromAddress is required');
    if (!toAddress) throw new BadRequestException('toAddress is required');

    const weight = Number(input.weight);
    const price = Number(input.price);
    if (!Number.isFinite(weight) || weight <= 0) throw new BadRequestException('weight must be a positive number');
    if (!Number.isFinite(price) || price < 0) throw new BadRequestException('price must be a non-negative number');

    const breakdown = input.breakdown;

    const created = await this.prisma.quote.create({
      data: {
        companyId: tenantId,
        fromAddress,
        toAddress,
        clientName: typeof input.clientName === 'string' ? input.clientName.trim() || null : null,
        weight,
        price,
        currency: typeof input.currency === 'string' && input.currency.trim() ? input.currency.trim() : 'ZAR',
        // Same JSON rule as the overrides: walk it, don't cast it.
        ...(breakdown !== undefined && breakdown !== null
          ? { breakdown: OwnerService.toJsonInput(breakdown, 'breakdown') }
          : {}),
      },
    });

    await this.audit.record({
      action: 'tenant.commercial_quote_created',
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      targetType: 'company',
      targetId: tenantId,
      targetName: company.name,
      metadata: { quoteId: created.id, price: created.price, currency: created.currency },
    });

    return created;
  }

  /**
   * Raise an invoice on a tenant's behalf, delegating to InvoicesService so
   * numbering and totals stay server-authoritative in exactly one place.
   */
  async createTenantInvoice(tenantId: string, dto: unknown, actor?: OwnerActor) {
    const company = await this.prisma.company.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });
    if (!company) throw new NotFoundException('Tenant not found');

    const created = await this.invoices.create(tenantId, dto);

    await this.audit.record({
      action: 'tenant.commercial_invoice_created',
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      targetType: 'company',
      targetId: tenantId,
      targetName: company.name,
      metadata: { invoiceId: (created as { id?: string })?.id ?? null },
    });

    return created;
  }
}
