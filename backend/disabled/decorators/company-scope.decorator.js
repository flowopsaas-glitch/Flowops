"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompanyScopeGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const company_scope_decorator_1 = require("../decorators/company-scope.decorator");
let CompanyScopeGuard = class CompanyScopeGuard {
    constructor(reflector) {
        this.reflector = reflector;
    }
    canActivate(context) {
        const field = this.reflector.getAllAndOverride(company_scope_decorator_1.COMPANY_SCOPE_KEY, [context.getHandler(), context.getClass()]);
        // No company scope required
        if (!field) {
            return true;
        }
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        if (!user || !user.companyId) {
            throw new common_1.ForbiddenException('Company context missing');
        }
        // Look for companyId in params OR body
        const targetCompanyId = request.params?.[field] ??
            request.body?.[field];
        if (!targetCompanyId) {
            throw new common_1.ForbiddenException(`Missing required company identifier (${field})`);
        }
        if (targetCompanyId !== user.companyId) {
            throw new common_1.ForbiddenException('Access denied: cross-company request blocked');
        }
        return true;
    }
};
exports.CompanyScopeGuard = CompanyScopeGuard;
exports.CompanyScopeGuard = CompanyScopeGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector])
], CompanyScopeGuard);
