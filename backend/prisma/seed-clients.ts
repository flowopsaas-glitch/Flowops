import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Seeding FlowOps Clients...');

  const clients = [
    { id: 'client-contract-001', name: 'Global Logistics (CONTRACT)', notes: 'Monthly Billing' },
    { id: 'client-prepaid-001', name: 'Swift Delivery (PREPAID)', notes: 'Wallet System' },
    { id: 'client-cod-001', name: 'Retail Hub (COD)', notes: 'Cash on Delivery' },
  ];

  for (const client of clients) {
    await prisma.company.upsert({
      where: { id: client.id },
      update: { name: client.name },
      create: {
        id: client.id,
        name: client.name,
        // Using notes field since email caused a crash
      }
    });
  }

  console.log('✅ Clients Seeded Successfully!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
