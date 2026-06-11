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
    console.log('🌱 Seeding admin user...');
    // 1️⃣ Ensure company exists
    let company = await prisma.company.findFirst({
        where: { name: 'Alpha Corp' },
    });
    if (!company) {
        company = await prisma.company.create({
            data: { name: 'Alpha Corp' },
        });
        console.log('🏢 Company created');
    }
    else {
        console.log('🏢 Company already exists');
    }
    // 2️⃣ Check admin user
    const existingUser = await prisma.user.findUnique({
        where: { email: 'admin@alpha.com' },
    });
    if (existingUser) {
        console.log('✅ Admin already exists');
        return;
    }
    // 3️⃣ Create admin
    const hash = await bcrypt.hash('Admin123!', 10);
    await prisma.user.create({
        data: {
            email: 'admin@alpha.com',
            password: hash,
            role: client_1.UserRole.ADMIN,
            companyId: company.id,
        },
    });
    console.log('✅ Admin user created');
}
main()
    .catch((e) => {
    console.error('❌ Seed failed:', e);
})
    .finally(async () => {
    await prisma.$disconnect();
});
