"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcrypt"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🧹 Clearing database...');
    await prisma.quote.deleteMany();
    await prisma.collection.deleteMany();
    await prisma.user.deleteMany();
    await prisma.company.deleteMany();
    console.log('🏢 Creating companies...');
    const company1 = await prisma.company.create({
        data: { name: 'Alpha Corp' },
    });
    const company2 = await prisma.company.create({
        data: { name: 'Beta Corp' },
    });
    console.log('👤 Creating users...');
    const adminPassword = await bcrypt.hash('password123', 10);
    const userPassword = await bcrypt.hash('password123', 10);
    const adminAlpha = await prisma.user.create({
        data: {
            email: 'admin@alpha.com',
            password: adminPassword,
            role: 'ADMIN',
            companyId: company1.id,
        },
    });
    const userBeta = await prisma.user.create({
        data: {
            email: 'user@beta.com',
            password: userPassword,
            role: 'USER',
            companyId: company2.id,
        },
    });
    console.log('📦 Creating collections...');
    await prisma.collection.createMany({
        data: [
            {
                name: 'Alpha Main Collection',
                status: 'ACTIVE',
                companyId: company1.id,
                createdById: adminAlpha.id,
            },
            {
                name: 'Beta Main Collection',
                status: 'ACTIVE',
                companyId: company2.id,
                createdById: userBeta.id,
            },
        ],
    });
    console.log('✅ Seed complete');
    console.log('➡ admin@alpha.com / password123');
    console.log('➡ user@beta.com / password123');
}
main()
    .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
