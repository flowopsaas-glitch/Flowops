import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PLAN_ENTITLEMENTS, PlanId, normalizePlan } from './plan-entitlements';

type Resource = 'waybill' | 'driver' | 'user' | 'branch';

@Injectable()
export class BillingService {
  constructor(private prisma: PrismaService) {}

  /**
   * Effective plan: during the 14-day trial a company gets full Professional
   * entitlements; once the trial ends it falls back to its actual plan.
   */
  private effectivePlan(plan: string | null, trialEndsAt: Date | null): PlanId {
    const onTrial = !!trialEndsAt && new Date(trialEndsAt).getTime() > Date.now();
    if (onTrial) {
      const base = normalizePlan(plan);
      return base === 'enterprise' ? 'enterprise' : 'professional';
    }
    return normalizePlan(plan);
  }

  private async usage(companyId: string) {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [waybillsThisMonth, drivers, users, branches] = await Promise.all([
      this.prisma.waybill.count({ where: { companyId, createdAt: { gte: monthStart } } }),
      this.prisma.driver.count({ where: { companyId, isActive: true } }),
      this.prisma.user.count({ where: { companyId, isActive: true } }),
      this.prisma.branch.count({ where: { companyId } }),
    ]);
    return { waybillsThisMonth, drivers, users, branches };
  }

  /** Full entitlements + live usage for the current company (powers the UI). */
  async getEntitlements(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { plan: true, trialEndsAt: true },
    });
    const planId = normalizePlan(company?.plan);
    const effective = this.effectivePlan(company?.plan ?? null, company?.trialEndsAt ?? null);
    const ent = PLAN_ENTITLEMENTS[effective];
    const usage = await this.usage(companyId);
    const onTrial = !!company?.trialEndsAt && new Date(company.trialEndsAt).getTime() > Date.now();
    const trialDaysLeft = onTrial
      ? Math.ceil((new Date(company!.trialEndsAt!).getTime() - Date.now()) / 86_400_000)
      : 0;

    const mk = (used: number, limit: number) => ({
      used, limit, unlimited: limit === -1,
      remaining: limit === -1 ? -1 : Math.max(0, limit - used),
      atLimit: limit !== -1 && used >= limit,
    });

    return {
      plan: planId,
      effectivePlan: effective,
      planName: ent.name,
      onTrial,
      trialEndsAt: company?.trialEndsAt ?? null,
      trialDaysLeft,
      features: ent.features,
      limits: ent.limits,
      usage: {
        waybillsThisMonth: mk(usage.waybillsThisMonth, ent.limits.waybillsPerMonth),
        drivers: mk(usage.drivers, ent.limits.drivers),
        users: mk(usage.users, ent.limits.users),
        branches: mk(usage.branches, ent.limits.branches),
      },
    };
  }

  /** True if the effective plan includes a feature (for soft-gating / upsell). */
  async hasFeature(companyId: string, feature: string): Promise<boolean> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId }, select: { plan: true, trialEndsAt: true },
    });
    const ent = PLAN_ENTITLEMENTS[this.effectivePlan(company?.plan ?? null, company?.trialEndsAt ?? null)];
    return Boolean(ent.features[feature]);
  }

  /**
   * Throws 403 with an upgrade message if creating one more `resource` would
   * exceed the company's plan limit. Unlimited (-1) always passes.
   */
  async assertCanCreate(companyId: string, resource: Resource): Promise<void> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId }, select: { plan: true, trialEndsAt: true },
    });
    const effective = this.effectivePlan(company?.plan ?? null, company?.trialEndsAt ?? null);
    const limits = PLAN_ENTITLEMENTS[effective].limits;
    const planName = PLAN_ENTITLEMENTS[effective].name;

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let limit: number;
    let used: number;
    let unit: string;

    switch (resource) {
      case 'waybill':
        limit = limits.waybillsPerMonth;
        if (limit === -1) return;
        used = await this.prisma.waybill.count({ where: { companyId, createdAt: { gte: monthStart } } });
        unit = 'waybills this month';
        break;
      case 'driver':
        limit = limits.drivers;
        if (limit === -1) return;
        used = await this.prisma.driver.count({ where: { companyId, isActive: true } });
        unit = 'drivers';
        break;
      case 'user':
        limit = limits.users;
        if (limit === -1) return;
        used = await this.prisma.user.count({ where: { companyId, isActive: true } });
        unit = 'team members';
        break;
      case 'branch':
        limit = limits.branches;
        if (limit === -1) return;
        used = await this.prisma.branch.count({ where: { companyId } });
        unit = 'branches';
        break;
    }

    if (used >= limit) {
      throw new ForbiddenException(
        `Your ${planName} plan includes ${limit} ${unit}. ` +
          `You've reached that limit — upgrade your plan to add more.`,
      );
    }
  }
}
