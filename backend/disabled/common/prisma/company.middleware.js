"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.companyScopeMiddleware = companyScopeMiddleware;
function companyScopeMiddleware(user) {
    return async (params, next) => {
        const scopedModels = ['User', 'Quote', 'Collection'];
        // Ignore models without companyId
        if (!params.model || !scopedModels.includes(params.model)) {
            return next(params);
        }
        // 👑 SUPER ADMIN: no restrictions
        if (user.role === 'SUPER_ADMIN') {
            return next(params);
        }
        /**
         * 🔒 READ SAFETY
         */
        if (params.action === 'findMany' ||
            params.action === 'findFirst') {
            params.args.where = {
                ...(params.args.where ?? {}),
                companyId: user.companyId,
            };
        }
        /**
         * 🔒 UPDATE / DELETE SAFETY
         */
        if (params.action === 'update' ||
            params.action === 'delete') {
            params.args.where = {
                ...(params.args.where ?? {}),
                companyId: user.companyId,
            };
        }
        /**
         * 🔒 CREATE SAFETY (MOST IMPORTANT PART)
         */
        if (params.action === 'create') {
            params.args.data = {
                ...(params.args.data ?? {}),
                companyId: user.companyId,
            };
        }
        if (params.action === 'createMany') {
            params.args.data = params.args.data.map((item) => ({
                ...item,
                companyId: user.companyId,
            }));
        }
        return next(params);
    };
}
