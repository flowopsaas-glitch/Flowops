import { UserRole } from '@prisma/client';

/** Payload encoded inside tenant access tokens. */
export interface JwtPayload {
  sub: string;        // User.id
  email: string;
  companyId: string;
  role: UserRole;
  type: 'tenant';
}

/** Payload encoded inside owner (platform-admin) access tokens. */
export interface OwnerJwtPayload {
  sub: string;        // OwnerUser.id
  email: string;
  type: 'owner';
}
