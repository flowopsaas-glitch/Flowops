"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AcksModule = void 0;
const common_1 = require("@nestjs/common");
const ack_service_1 = require("./ack.service");
const ack_controller_1 = require("./ack.controller");
const prisma_module_1 = require("../prisma/prisma.module");
let AcksModule = class AcksModule {
};
exports.AcksModule = AcksModule;
exports.AcksModule = AcksModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule],
        providers: [ack_service_1.AckService],
        controllers: [ack_controller_1.AckController],
        exports: [ack_service_1.AckService],
    })
], AcksModule);
