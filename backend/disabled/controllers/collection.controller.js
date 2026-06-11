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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CollectionController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const collection_service_1 = require("../services/collection.service");
let CollectionController = class CollectionController {
    constructor(collectionService) {
        this.collectionService = collectionService;
    }
    async getCollections(req) {
        /**
         * req.user is already globally typed via:
         * src/types/express-request.d.ts
         *
         * {
         *   id: string
         *   role: UserRole
         *   companyId: string
         * }
         */
        const userId = Number(req.user.id);
        if (Number.isNaN(userId)) {
            throw new Error('Invalid user ID in JWT payload');
        }
        return this.collectionService.getCollectionsForUser(userId);
    }
};
exports.CollectionController = CollectionController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CollectionController.prototype, "getCollections", null);
exports.CollectionController = CollectionController = __decorate([
    (0, common_1.Controller)('collections'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [typeof (_a = typeof collection_service_1.CollectionService !== "undefined" && collection_service_1.CollectionService) === "function" ? _a : Object])
], CollectionController);
