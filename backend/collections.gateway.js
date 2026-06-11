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
exports.CollectionsGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
let CollectionsGateway = class CollectionsGateway {
    /** Client joins company room */
    handleJoinCompanyRoom(client, payload) {
        const room = `company_${payload.companyId}`;
        client.join(room);
        console.log(`Client ${client.id} joined room ${room}`);
        client.emit('joinedRoom', { room });
    }
    /** Broadcasts company unlocked event */
    broadcastCompanyUnlocked(companyId) {
        const room = `company_${companyId}`;
        this.server.to(room).emit('company-unlocked', { companyId });
        console.log(`Broadcasted company-unlocked to room ${room}`);
    }
};
exports.CollectionsGateway = CollectionsGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], CollectionsGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('joinCompanyRoom'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], CollectionsGateway.prototype, "handleJoinCompanyRoom", null);
exports.CollectionsGateway = CollectionsGateway = __decorate([
    (0, websockets_1.WebSocketGateway)()
], CollectionsGateway);
