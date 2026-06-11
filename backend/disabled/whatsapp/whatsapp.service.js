"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsappService = void 0;
const common_1 = require("@nestjs/common");
let WhatsappService = class WhatsappService {
    async handleIncomingWebhook(body) {
        return { received: true, payload: body };
    }
    async sendDriverAssignment(driverPhone, collectionId, pickupAddress) {
        // Placeholder – integrate WhatsApp API later
        console.log('📲 Sending WhatsApp message');
        console.log('Driver:', driverPhone);
        console.log('Collection ID:', collectionId);
        console.log('Pickup Address:', pickupAddress);
        return { success: true };
    }
};
exports.WhatsappService = WhatsappService;
exports.WhatsappService = WhatsappService = __decorate([
    (0, common_1.Injectable)()
], WhatsappService);
