// src/types/express.d.ts
import { Request } from 'express';
import { Role as PrismaRole } from '@prisma/client'; // Use Prisma's Role enum

declare global {
  namespace Express {
    interface Request {
      user?: {
        sub: number;       // maps to user ID (JWT 'sub' claim)
        email: string;
        role: PrismaRole;  // Use Prisma's Role enum consistently
        companyId: number;
      };
    }
  }
}

export interface RequestWithUser extends Request {
  user: { // Assert 'user' is non-nullable and has the correct type
    sub: number;
    email: string;
    role: PrismaRole;
    companyId: number;
  };
}