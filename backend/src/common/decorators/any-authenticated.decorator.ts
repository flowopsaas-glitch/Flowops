import { SetMetadata } from '@nestjs/common';

export const ANY_AUTHENTICATED_KEY = 'anyAuthenticated';

/**
 * Marks a route (or a whole controller) as DELIBERATELY open to any
 * authenticated tenant role: self-service surfaces such as the caller's own
 * profile, notifications, and company record, where the role layer has
 * nothing to decide because tenant + identity scoping already constrain
 * what the caller can see or change.
 *
 * This exists so `RBAC_STRICT=true` can reject routes with no role decision
 * at all. A route must carry exactly one deliberate access decision:
 * `@Roles(...)` (restricted), `@AnyAuthenticated()` (any signed-in role),
 * `@Public()` (no tenant JWT), or `@OwnerOnly()` (platform owner).
 * `npm run rbac:inventory -- --check` enforces that in CI.
 *
 * Do NOT use this to avoid deciding: if some roles should not reach a route,
 * it needs `@Roles(...)`, not this marker.
 */
export const AnyAuthenticated = () => SetMetadata(ANY_AUTHENTICATED_KEY, true);
