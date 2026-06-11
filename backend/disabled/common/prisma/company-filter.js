"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAdmin = void 0;
const role_enum_1 = require("../../auth/enums/role.enum");
// Example usage:
const isAdmin = (role) => {
    return role === role_enum_1.Role.COMPANY_ADMIN || role === role_enum_1.Role.SUPER_ADMIN;
};
exports.isAdmin = isAdmin;
