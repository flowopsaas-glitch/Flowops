// src/prisma/prisma.middleware.ts
import { PrismaClient, Prisma } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';

export function applyRowLevelMiddleware(
  prisma: PrismaClient,
  getUserId: () => string,
  getUserRole: () => string,
  getCompanyId: () => string,
) {
  prisma.$use(async (params: Prisma.MiddlewareParams, next) => {
    const protectedModels = ['Collection', 'Quote', 'User'];
    if (!protectedModels.includes(params.model)) return next(params);

    const rowLevelActions = ['findMany', 'findFirst', 'update', 'delete'];
    if (!rowLevelActions.includes(params.action)) return next(params);

    const userId = getUserId();
    const userRole = getUserRole();
    const companyId = getCompanyId();

    if (!userId) throw new ForbiddenException('Row-level enforcement: missing user context');

    const rowFilter: any = {};

    if (userRole === 'ADMIN') {
      // full access
    } else if (userRole === 'COMPANY_ADMIN') {
      rowFilter.companyId = companyId;
    } else {
      rowFilter.userId = userId;
    }

    params.args.where = { ...(params.args.where || {}), ...rowFilter };
    return next(params);
  });
}
