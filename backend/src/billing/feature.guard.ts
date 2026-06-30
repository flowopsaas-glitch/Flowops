import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BillingService } from './billing.service';
import { REQUIRE_FEATURE_KEY } from './require-feature.decorator';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import {
  FEATURE_LABELS,
  PLAN_ENTITLEMENTS,
  PlanId,
  type FeatureKey,
} from './plan-entitlements';

/**
 * Enforces @RequireFeature() metadata. Resolves the caller's company from the
 * JWT (request.user.companyId) and checks the effective plan via
 * BillingService.hasFeature (trial-aware + honours owner add-on overrides).
 *
 * Apply at the controller or handler level AFTER the JWT guard has run:
 *   @UseGuards(FeatureGuard)
 *   @RequireFeature('whatsapp')
 *
 * BillingModule is @Global, so BillingService injects without extra imports.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly billing: BillingService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<FeatureKey | undefined>(
      REQUIRE_FEATURE_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );

    // No @RequireFeature on this route → nothing to enforce.
    if (!feature) return true;

    // Public routes (inbound webhooks: WhatsApp, Shopify/WooCommerce) carry no
    // authenticated user; they verify identity by signature inside the service.
    // Feature checks for those happen there, not here.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const companyId: string | undefined = req?.user?.companyId;

    // No authenticated company context → cannot be entitled. Fail closed.
    if (!companyId) {
      throw new ForbiddenException(this.upgradeMessage(feature));
    }

    const ok = await this.billing.hasFeature(companyId, feature);
    if (!ok) {
      throw new ForbiddenException(this.upgradeMessage(feature));
    }
    return true;
  }

  /** Builds a friendly "available on the <Tier> plan" upgrade message. */
  private upgradeMessage(feature: FeatureKey): string {
    const label = FEATURE_LABELS[feature] ?? feature;
    const tier = this.minimumTierFor(feature);
    const tierName = tier ? PLAN_ENTITLEMENTS[tier].name : 'a higher';
    return `${label} is available on the ${tierName} plan. Upgrade to unlock it.`;
  }

  /** First tier (cheapest) whose plan includes the feature. */
  private minimumTierFor(feature: FeatureKey): PlanId | null {
    const order: PlanId[] = ['starter', 'professional', 'enterprise'];
    for (const id of order) {
      if (PLAN_ENTITLEMENTS[id].features[feature]) return id;
    }
    return null;
  }
}
