"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyRowLevelMiddleware = applyRowLevelMiddleware;
const common_1 = require("@nestjs/common");
function applyRowLevelMiddleware(prisma, getUserId, getUserRole, getCompanyId) {
    prisma.$use(async (params, next) => {
        const protectedModels = ['Collection', 'Quote', 'User'];
        if (!protectedModels.includes(params.model))
            return next(params);
        const rowLevelActions = ['findMany', 'findFirst', 'update', 'delete'];
        if (!rowLevelActions.includes(params.action))
            return next(params);
        const userId = getUserId();
        const userRole = getUserRole();
        const companyId = getCompanyId();
        if (!userId)
            throw new common_1.ForbiddenException('Row-level enforcement: missing user context');
        const rowFilter = {};
        if (userRole === 'ADMIN') {
            // full access
        }
        else if (userRole === 'COMPANY_ADMIN') {
            rowFilter.companyId = companyId;
        }
        else {
            rowFilter.userId = userId;
        }
        params.args.where = { ...(params.args.where || {}), ...rowFilter };
        return next(params);
    });
}
