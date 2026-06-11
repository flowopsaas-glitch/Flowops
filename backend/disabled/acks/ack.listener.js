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
exports.AckListener = void 0;
const common_1 = require("@nestjs/common");
const ack_service_1 = require("./ack.service");
let AckListener = class AckListener {
    constructor(ackService) {
        this.ackService = ackService;
    }
    // Example method simulating event listener
    async handleCollectionAcknowledgement(collectionId, userId) {
        await this.ackService.acknowledgeCollection(collectionId, userId);
    }
};
exports.AckListener = AckListener;
exports.AckListener = AckListener = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [ack_service_1.AckService])
], AckListener);
