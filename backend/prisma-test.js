"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    try {
        const result = await prisma.$queryRaw `SELECT NOW()`;
        console.log('Database connection successful:', result);
    }
    catch (error) {
        console.error('Database connection failed:', error);
    }
    finally {
        await prisma.$disconnect();
    }
}
main();
