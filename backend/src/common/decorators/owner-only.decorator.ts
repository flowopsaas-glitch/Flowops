import { SetMetadata } from '@nestjs/common';

/**
 * Marks a route (or a whole controller) as platform-owner only.
 *
 * This decorator is load-bearing in two places, which is why owner routes must
 * NOT also carry `@Public()`:
 *
 *  1. `JwtAuthGuard` (the global tenant guard) skips any route carrying this
 *     metadata — an owner JWT is `type: 'owner'`, so the tenant strategy would
 *     reject it. This replaces the old `@Public() + OwnerAuthGuard` pattern,
 *     where "owner only" was expressed by making the route public and hoping a
 *     second guard was attached. Route ordering, a missing @UseGuards on a new
 *     method, or a decorator conflict could silently publish an owner endpoint.
 *
 *  2. `OwnerAuthGuard` REQUIRES this metadata. A route that forgets it fails
 *     closed (403) instead of being served by whatever guard happened to run.
 *
 * Usage:
 *   @Controller('owner')
 *   @OwnerOnly()
 *   @UseGuards(OwnerAuthGuard)
 *   export class OwnerController { ... }
 */
export const OWNER_ONLY_KEY = 'ownerOnly';

export const OwnerOnly = () => SetMetadata(OWNER_ONLY_KEY, true);
