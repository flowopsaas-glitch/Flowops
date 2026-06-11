import { PrismaClient } from '@prisma/client';

// Use DATABASE_URL from .env
export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});
