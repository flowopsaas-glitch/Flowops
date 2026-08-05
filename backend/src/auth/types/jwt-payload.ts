import { UserRole } from '@prisma/client';

/** Payload encoded inside tenant access tokens. */
export interface JwtPayload {
  sub: string;        // User.id
  email: string;
  companyId: string;
  role: UserRole;
  type: 'tenant';
  /** Session id — must match User.activeSessionId (single active session). */
  sid?: string;
}

/** Payload encoded inside owner (platform-admin) access tokens. */
export interface OwnerJwtPayload {
  sub: string;        // OwnerUser.id
  email: string;
  type: 'owner';
}
