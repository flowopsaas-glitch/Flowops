"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// C:\flowops\backend\seed-companies.ts
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    // List of companies to seed
    const companies = [
        { name: 'Alpha Logistics' },
        { name: 'Beta Transport' },
        { name: 'Gamma Freight' },
    ];
    console.log('🌱 Seeding companies...');
    for (const company of companies) {
        const created = await prisma.company.create({
            data: company,
        });
        console.log('✅ Created company:', created);
    }
    console.log('🎉 Seeding complete!');
}
// Run the script
main()
    .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
