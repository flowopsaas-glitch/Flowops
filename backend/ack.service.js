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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AckService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const collections_gateway_1 = require("../collections/collections.gateway");
const axios_1 = __importDefault(require("axios"));
let AckService = class AckService {
    constructor(prisma, collectionsGateway) {
        this.prisma = prisma;
        this.collectionsGateway = collectionsGateway;
        this.allowedTransitions = {
            pending: [client_1.CollectionStatus.ACKNOWLEDGED, client_1.CollectionStatus.CANCELLED],
            acknowledged: [client_1.CollectionStatus.PICKED_UP],
            pickedUp: [client_1.CollectionStatus.DELIVERED],
        };
    }
    /** Update collection status with enum-safe typing */
    async updateStatus(collectionId, newStatus) {
        const collection = await this.prisma.collection.findUnique({
            where: { id: collectionId },
        });
        if (!collection)
            return null;
        const allowed = this.allowedTransitions[collection.status];
        if (!allowed || !allowed.includes(newStatus))
            return null;
        return this.prisma.collection.update({
            where: { id: collectionId },
            data: { status: newStatus },
        });
    }
    /** Notify driver via WhatsApp (replace URL with your WhatsApp API) */
    async notifyDriverWhatsApp(driverId, collectionId, status) {
        const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
        if (!driver || !driver.phone)
            return;
        await axios_1.default.post('https://your-whatsapp-api/send', {
            to: driver.phone,
            message: `Collection ${collectionId} status updated to "${status}" ✅`,
        });
    }
    /** Programmatic method for webhook or other service calls */
    async markCollectionAcknowledged(collectionId) {
        const updated = await this.updateStatus(collectionId, client_1.CollectionStatus.ACKNOWLEDGED);
        if (!updated)
            return null;
        // Broadcast to company room
        this.collectionsGateway.broadcastCompanyUnlocked(updated.companyId);
        return updated;
    }
};
exports.AckService = AckService;
exports.AckService = AckService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof prisma_service_1.PrismaService !== "undefined" && prisma_service_1.PrismaService) === "function" ? _a : Object, typeof (_b = typeof collections_gateway_1.CollectionsGateway !== "undefined" && collections_gateway_1.CollectionsGateway) === "function" ? _b : Object])
], AckService);
