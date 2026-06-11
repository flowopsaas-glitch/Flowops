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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DriversController = void 0;
// File: src/drivers/drivers.controller.ts
const common_1 = require("@nestjs/common");
const drivers_service_1 = require("./drivers.service");
let DriversController = class DriversController {
    constructor(driversService) {
        this.driversService = driversService;
    }
    async getAllDrivers() {
        return this.driversService.getAllDrivers();
    }
    async getDriverById(id) {
        return this.driversService.getDriverById(id);
    }
    async updateDriver(id, body) {
        return this.driversService.updateDriver(id, body);
    }
};
exports.DriversController = DriversController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DriversController.prototype, "getAllDrivers", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DriversController.prototype, "getDriverById", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], DriversController.prototype, "updateDriver", null);
exports.DriversController = DriversController = __decorate([
    (0, common_1.Controller)('drivers'),
    __metadata("design:paramtypes", [drivers_service_1.DriversService])
], DriversController);
