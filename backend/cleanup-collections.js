"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const deleted = await prisma.collection.deleteMany({
        where: {
            companyId: null,
        },
    });
    console.log(`✅ Deleted ${deleted.count} collection(s) with null companyId.`);
}
main()
    .catch((e) => {
    console.error('❌ Error during cleanup:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
