import { SetMetadata } from '@nestjs/common';

/**
 * PRODUCTION FIX (2026-10-07):
 * Marks a route as owner-only. MUST be used WITH @UseGuards(OwnerAuthGuard).
 * Replaces the problematic @Public() + OwnerAuthGuard pattern.
 * 
 * Usage:
 *   @Controller('owner')
 *   @UseGuards(OwnerAuthGuard)
 *   @OwnerOnly()
 *   export class OwnerController { ... }
 */
export const OWNER_ONLY_KEY = 'ownerOnly';

export const OwnerOnly = () => SetMetadata(OWNER_ONLY_KEY, true);
