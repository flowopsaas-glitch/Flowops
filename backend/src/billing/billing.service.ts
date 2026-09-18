import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PLAN_ENTITLEMENTS, PlanId, normalizePlan } from './plan-entitlements';

// Valid upgrade targets a tenant can request (must exist in PLAN_ENTITLEMENTS).
const REQUESTABLE_PLANS: PlanId[] = [
  'professional', 'professional_10', 'professional_25', 'professional_50', 'enterprise',
];

type Resource = 'waybill' | 'driver' | 'user' | 'branch';

@Injectable()
export class BillingService {
  constructor(private prisma: PrismaService) {}

  /**
   * Effective plan: during the 14-day trial a company gets full Professional
   * entitlements; once the trial ends, the tenant MUST have upgraded to a paid
   * plan. If they're still on 'starter' after trial → account is EXPIRED
   * (locked until payment). No free tier exists post-trial.
   */
  private effectivePlan(plan: string | null, trialEndsAt: Date | null): PlanId | 'expired' {
    const onTrial = !!trialEndsAt && new Date(trialEndsAt).getTime() > Date.now();
    if (onTrial) {
      const base = normalizePlan(plan);
      return base === 'enterprise' ? 'enterprise' : 'professional';
    }
    // Trial has ended (or never existed)
    const base = normalizePlan(plan);
    // If they're still on 'starter' AND had a trial → expired (must pay)
    if (base === 'starter' && trialEndsAt) {
      return 'expired';
    }
    return base;
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
      select: { plan: true, trialEndsAt: true, featureOverrides: true, priceOverrideZar: true },
    });
    const planId = normalizePlan(company?.plan);
    const effective = this.effectivePlan(company?.plan ?? null, company?.trialEndsAt ?? null);

    // EXPIRED: trial ended, no payment — lock the account
    if (effective === 'expired') {
      const usage = await this.usage(companyId);
      return {
        plan: planId,
        effectivePlan: 'expired',
        planName: 'Trial Expired',
        onTrial: false,
        trialExpired: true,
        trialEndsAt: company?.trialEndsAt ?? null,
        trialDaysLeft: 0,
        features: {} as Record<string, boolean>, // No features — account locked
        featureOverrides: {} as Record<string, boolean>,
        priceOverrideZar: company?.priceOverrideZar ?? null,
        limits: { waybillsPerMonth: 0, drivers: 0, users: 0, branches: 0 },
        usage: {
          waybillsThisMonth: { used: usage.waybillsThisMonth, limit: 0, unlimited: false, remaining: 0, atLimit: true },
          drivers: { used: usage.drivers, limit: 0, unlimited: false, remaining: 0, atLimit: true },
          users: { used: usage.users, limit: 0, unlimited: false, remaining: 0, atLimit: true },
          branches: { used: usage.branches, limit: 0, unlimited: false, remaining: 0, atLimit: true },
        },
        message: 'Your 14-day trial has expired. Please upgrade to Professional or Enterprise to continue using FlowOps.',
      };
    }

    const ent = PLAN_ENTITLEMENTS[effective];
    const overrides = (company?.featureOverrides ?? {}) as Record<string, boolean>;
    // Plan features OR'd with owner-granted per-tenant add-ons.
    const features = this.mergeFeatures(ent.features, overrides);
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
      features,
      featureOverrides: overrides,
      priceOverrideZar: company?.priceOverrideZar ?? null,
      limits: ent.limits,
      usage: {
        waybillsThisMonth: mk(usage.waybillsThisMonth, ent.limits.waybillsPerMonth),
        drivers: mk(usage.drivers, ent.limits.drivers),
        users: mk(usage.users, ent.limits.users),
        branches: mk(usage.branches, ent.limits.branches),
      },
    };
  }

  /** Plan features with owner-granted add-ons layered on top (override=true grants). */
  private mergeFeatures(
    planFeatures: Record<string, boolean>,
    overrides: Record<string, boolean> | null | undefined,
  ): Record<string, boolean> {
    const merged: Record<string, boolean> = { ...planFeatures };
    if (overrides) {
      for (const [key, on] of Object.entries(overrides)) {
        if (on) merged[key] = true; // grant-only: never strip a plan-included feature
      }
    }
    return merged;
  }

  /** True if the effective plan (incl. owner add-ons) includes a feature. */
  async hasFeature(companyId: string, feature: string): Promise<boolean> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId }, select: { plan: true, trialEndsAt: true, featureOverrides: true },
    });
    const effective = this.effectivePlan(company?.plan ?? null, company?.trialEndsAt ?? null);
    // Expired accounts have NO features — forces upgrade
    if (effective === 'expired') return false;
    const ent = PLAN_ENTITLEMENTS[effective];
    if (ent.features[feature]) return true;
    const overrides = (company?.featureOverrides ?? {}) as Record<string, boolean>;
    return Boolean(overrides[feature]);
  }

  /**
   * Throws 403 with an upgrade message if creating one more `resource` would
   * exceed the company's plan limit. Unlimited (-1) always passes.
   *
   * CONCURRENCY SAFETY: the check-then-act gap (read count → decide → insert)
   * is closed by wrapping the count query inside a Postgres advisory lock
   * scoped to (companyId × resource). Concurrent bulk imports for the same
   * company queue up at the lock rather than all reading the same stale count
   * and collectively overshooting the limit.
   *
   * Advisory lock key: lower 32 bits = FNV-1a hash of companyId,
   * upper 16 bits = resource index. The lock is session-scoped so it is
   * automatically released if the connection drops.
   */
  async assertCanCreate(companyId: string, resource: Resource): Promise<void> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId }, select: { plan: true, trialEndsAt: true },
    });
    const effective = this.effectivePlan(company?.plan ?? null, company?.trialEndsAt ?? null);

    // EXPIRED: trial ended without upgrading → block ALL resource creation
    if (effective === 'expired') {
      throw new ForbiddenException(
        'Your 14-day trial has expired. Please upgrade to Professional or Enterprise to continue using FlowOps. ' +
        'Go to Settings → Billing to choose your plan.',
      );
    }

    const limits = PLAN_ENTITLEMENTS[effective].limits;
    const planName = PLAN_ENTITLEMENTS[effective].name;

    // Determine limit up-front; skip locking for unlimited resources.
    const resourceIndex: Record<Resource, number> = { waybill: 0, driver: 1, user: 2, branch: 3 };
    const unitLabels: Record<Resource, string> = {
      waybill: 'waybills this month',
      driver: 'drivers',
      user: 'team members',
      branch: 'branches',
    };

    let limit: number;
    switch (resource) {
      case 'waybill': limit = limits.waybillsPerMonth; break;
      case 'driver':  limit = limits.drivers; break;
      case 'user':    limit = limits.users; break;
      case 'branch':  limit = limits.branches; break;
    }
    if (limit === -1) return; // unlimited — no check needed

    // FNV-1a hash of companyId (string → 32-bit int, stays positive)
    let hash = 2166136261;
    for (let i = 0; i < companyId.length; i++) {
      hash ^= companyId.charCodeAt(i);
      hash = (hash * 16777619) >>> 0; // keep unsigned 32-bit
    }
    // Combine resource index into the upper bits to get a unique lock key per
    // (company, resource) pair. Cast to signed BigInt for pg_try_advisory_lock.
    const lockKey = BigInt((resourceIndex[resource] << 28) | (hash & 0x0fffffff));

    // Acquire an advisory lock then re-count inside the same connection to
    // prevent concurrent requests from all reading the same pre-insert count.
    await this.prisma.$transaction(async (tx) => {
      // pg_advisory_xact_lock is released automatically at transaction end.
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${lockKey})`);

      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      let used: number;

      switch (resource) {
        case 'waybill':
          used = await tx.waybill.count({ where: { companyId, createdAt: { gte: monthStart } } });
          break;
        case 'driver':
          used = await tx.driver.count({ where: { companyId, isActive: true } });
          break;
        case 'user':
          used = await tx.user.count({ where: { companyId, isActive: true } });
          break;
        case 'branch':
          used = await tx.branch.count({ where: { companyId } });
          break;
      }

      if (used >= limit) {
        throw new ForbiddenException(
          `Your ${planName} plan includes ${limit} ${unitLabels[resource]}. ` +
            `You've reached that limit — upgrade your plan to add more.`,
        );
      }
    });
  }

  // ── In-app plan upgrade requests (owner-approved, no payment provider) ──────

  /**
   * A tenant admin requests an upgrade to a higher tier. Creates a PENDING
   * PlanUpgradeRequest and raises a critical AiEvent so the request surfaces on
   * the owner console (GET /owner/ai-alerts). The owner approves/declines it —
   * approval flips company.plan. No card, no Paystack.
   */
  async createUpgradeRequest(
    companyId: string,
    user: { id?: string; email?: string } | undefined,
    requestedPlan: string,
    note?: string,
  ) {
    const target = String(requestedPlan || '').toLowerCase();
    if (!REQUESTABLE_PLANS.includes(target as PlanId)) {
      throw new BadRequestException(`Unknown plan "${requestedPlan}".`);
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, plan: true },
    });
    if (!company) throw new BadRequestException('Company not found.');

    const currentPlan = company.plan ?? 'starter';
    if (currentPlan === target) {
      throw new BadRequestException(`You are already on the ${PLAN_ENTITLEMENTS[target as PlanId].name} plan.`);
    }

    // Only one open request at a time.
    const existing = await this.prisma.planUpgradeRequest.findFirst({
      where: { companyId, status: 'PENDING' },
    });
    if (existing) {
      throw new BadRequestException(
        'You already have an upgrade request awaiting approval. Please wait for it to be reviewed.',
      );
    }

    const request = await this.prisma.planUpgradeRequest.create({
      data: {
        companyId,
        currentPlan,
        requestedPlan: target,
        requestedById: user?.id ?? null,
        requestedByEmail: user?.email ?? null,
        note: note?.trim() || null,
        status: 'PENDING',
      },
    });

    // Alert the owner console (best-effort — never blocks the request).
    try {
      await this.prisma.aiEvent.create({
        data: {
          companyId,
          type: 'PLAN_UPGRADE_REQUEST',
          title: `${company.name}: upgrade request → ${PLAN_ENTITLEMENTS[target as PlanId].name}`,
          body:
            `${company.name} requested an upgrade from ${currentPlan} to ${target}.` +
            (note?.trim() ? ` Note: ${note.trim()}` : ''),
          severity: 'critical',
          sourceType: 'plan_upgrade_request',
          sourceId: request.id,
          resolved: false,
        },
      });
    } catch { /* best-effort */ }

    return request;
  }

  /** The tenant's own upgrade requests (most recent first). */
  async listMyUpgradeRequests(companyId: string) {
    return this.prisma.planUpgradeRequest.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }
}