import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class OwnerService {
  constructor(
    private prisma: PrismaService,
    private email: EmailService,
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
  async tenantAction(tenantId: string, action: 'approve' | 'reject' | 'suspend', opts?: any) {
    if (action === 'approve') {
      // Find the ApprovalRequest, create the admin user
      const req = await this.prisma.approvalRequest.findFirst({ where: { companyId: tenantId } });
      if (req) {
        let passwordHash: string;
        try {
          const parsed = JSON.parse(req.notes ?? '{}');
          passwordHash = parsed.passwordHash;
        } catch {
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
          },
        });
        await this.prisma.approvalRequest.update({
          where: { id: req.id },
          data: { status: 'APPROVED' },
        });

        // Send welcome email to the newly approved admin user
        await this.email.sendWelcomeEmail(req.email, req.fullName, req.company);
      }
      return this.prisma.company.update({ where: { id: tenantId }, data: { isActive: true } });
    }

    if (action === 'reject') {
      await this.prisma.approvalRequest.updateMany({
        where: { companyId: tenantId },
        data: { status: 'REJECTED', notes: opts?.reason },
      });
      return this.prisma.company.update({ where: { id: tenantId }, data: { isActive: false } });
    }

    if (action === 'suspend') {
      return this.prisma.company.update({ where: { id: tenantId }, data: { isActive: false } });
    }

    throw new Error('Unknown action');
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
    professional: 14999,
    enterprise: 29999,
  };

  private planPrice(plan?: string | null): number {
    return OwnerService.PLAN_PRICE_ZAR[(plan || 'starter').toLowerCase()] ?? 0;
  }

  async platformAnalytics() {
    const now = new Date();
    const d30 = new Date(now); d30.setDate(d30.getDate() - 30);
    const d60 = new Date(now); d60.setDate(d60.getDate() - 60);
    const pct = (cur: number, prev: number) =>
      prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : 0;

    const companies = await this.prisma.company.findMany({
      select: {
        id: true, name: true, plan: true, isActive: true, createdAt: true, country: true,
        _count: { select: { users: true, waybills: true } },
      },
    });
    const active = companies.filter((c) => c.isActive);

    // ── Revenue (MRR/ARR/ARPA) from active subscriptions ──
    const mrr = active.reduce((s, c) => s + this.planPrice(c.plan), 0);
    const mrrPrev = companies
      .filter((c) => c.isActive && c.createdAt <= d30)
      .reduce((s, c) => s + this.planPrice(c.plan), 0);
    const payingTenants = active.filter((c) => this.planPrice(c.plan) > 0).length;
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
        .reduce((s, c) => s + this.planPrice(c.plan), 0),
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
        const planScore = this.planPrice(c.plan) > 0 ? 30 : 8;
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
    return this.prisma.aiEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { company: { select: { name: true } } },
    });
  }

  // ── Plans ─────────────────────────────────────────────────────────────

  /**
   * FlowOps billing plans — synced from Paystack (Flowops Holdings, ID: 1839930).
   *
   *   Starter:      FREE   (no Paystack plan — instant activation, no billing)
   *   Professional: ZAR 14,999 / month  PLN_l3kobthzahnkpf3
   *   Enterprise:   ZAR 29,999 / month  PLN_9at9kn2ra8jtae0
   */
  async getPlans() {
    return [
      {
        id: 'starter',
        name: 'Starter',
        description: 'For small couriers getting started — free, no credit card required',
        maxUsers: 5,
        maxWaybills: 200,
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
        maxUsers: 50,
        maxWaybills: 10000,
        price: 14999,
        currency: 'ZAR',
        interval: 'month',
        paystackPlanCode: 'PLN_l3kobthzahnkpf3',
        popular: true,
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        description: 'Unlimited scale + white-label + dedicated support',
        maxUsers: -1,
        maxWaybills: -1,
        price: 29999,
        currency: 'ZAR',
        interval: 'month',
        paystackPlanCode: 'PLN_9at9kn2ra8jtae0',
        popular: false,
      },
    ];
  }

  async updateTenantPlan(tenantId: string, plan: string) {
    return this.prisma.company.update({ where: { id: tenantId }, data: { plan } });
  }

  // ── Approval requests ─────────────────────────────────────────────────

  async getApprovalRequests(query?: any) {
    return this.prisma.approvalRequest.findMany({
      where: query?.status ? { status: query.status } : {},
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveRequest(requestId: string) {
    const req = await this.prisma.approvalRequest.findUniqueOrThrow({ where: { id: requestId } });
    // Create company + user
    let passwordHash: string;
    try { passwordHash = JSON.parse(req.notes ?? '{}').passwordHash; } catch { passwordHash = await bcrypt.hash('ChangeMe123!', 12); }

    const company = await this.prisma.company.create({
      data: { name: req.company, email: req.email, isActive: true },
    });
    await this.prisma.user.create({
      data: { email: req.email, passwordHash, name: req.fullName, phone: req.phone, role: 'ADMIN', companyId: company.id },
    });
    await this.prisma.approvalRequest.update({
      where: { id: requestId },
      data: { status: 'APPROVED', companyId: company.id },
    });
    return { company, message: 'Approved and onboarded' };
  }

  async rejectRequest(requestId: string, reason?: string) {
    return this.prisma.approvalRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED', notes: reason },
    });
  }
}
