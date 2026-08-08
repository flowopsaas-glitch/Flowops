import { UserRole } from '@prisma/client';

/**
 * Shape of `request.user` after JwtAuthGuard validates the token.
 *
 * The JWT strategy fetches the full User record from the database
 * (including company relation) and attaches it to the request.
 * Use this type instead of `any` in @CurrentUser() parameters.
 *
 * @example
 *   @Get('me')
 *   getProfile(@CurrentUser() user: AuthenticatedUser) {
 *     return user.companyId;
 *   }
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  role: UserRole;
  isActive: boolean;
  companyId: string;
  company: { id: string; name: string; isActive: boolean };
  permissions?: Record<string, boolean> | null;
  /** Provided if the token carries a session ID (single active session). */
  activeSessionId?: string | null;
}
