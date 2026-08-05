import { SetMetadata } from '@nestjs/common';
import type { FeatureKey } from './plan-entitlements';

/**
 * Marks a controller or route handler as requiring a specific plan feature.
 * Enforced by {@link FeatureGuard}, which reads this metadata, resolves the
 * caller's company and throws 403 (with an upgrade message) when the effective
 * plan — including owner add-on overrides and trial grants — does not include it.
 *
 * This is the server-side counterpart to the frontend <RequireFeature> route
 * guard. Frontend gating is for UX only and fails OPEN on network errors, so
 * every PAID capability must also be gated here to actually protect revenue.
 *
 * @example
 *   @RequireFeature('routeOptimization')
 *   @Controller('routes')
 *   export class RoutesController {}
 */
export const REQUIRE_FEATURE_KEY = 'require_feature';
export const RequireFeature = (feature: FeatureKey) =>
  SetMetadata(REQUIRE_FEATURE_KEY, feature);
