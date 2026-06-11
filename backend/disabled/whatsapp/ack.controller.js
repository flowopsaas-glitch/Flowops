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
exports.WhatsappAckController = void 0;
// File: src/whatsapp/ack.controller.ts
const common_1 = require("@nestjs/common");
const ack_service_1 = require("./ack.service");
let WhatsappAckController = class WhatsappAckController {
    constructor(service) {
        this.service = service;
    }
    async getUser(id) {
        return this.service.getUserById(id);
    }
};
exports.WhatsappAckController = WhatsappAckController;
__decorate([
    (0, common_1.Get)('user/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], WhatsappAckController.prototype, "getUser", null);
exports.WhatsappAckController = WhatsappAckController = __decorate([
    (0, common_1.Controller)('whatsapp'),
    __metadata("design:paramtypes", [typeof (_a = typeof ack_service_1.WhatsappAckService !== "undefined" && ack_service_1.WhatsappAckService) === "function" ? _a : Object])
], WhatsappAckController);
