import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;       // Prisma IDs are strings
    email: string;    // User email
    role: 'USER' | 'COMPANY_ADMIN' | 'SUPER_ADMIN'; // must match your Prisma enum Role
  };
}
