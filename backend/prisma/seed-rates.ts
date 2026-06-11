import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirst();
  
  if (!company) {
    console.error('❌ No company found in DB. Create a company first!');
    return;
  }

  console.log(`🌱 Seeding RateCard for: ${company.name}`);

  await prisma.rateCard.upsert({
    // 🚀 FIXED: Changed 1 to "1" to match your schema's string ID type
    where: { id: "1" }, 
    update: {},
    create: {
      id: "1", 
      name: 'Standard Logistics Rates 2026',
      baseFee: 150.00,
      perKm: 18.50,
      perKg: 3.25,
      fuelSurchargePercent: 12.5,
      vatPercent: 15.0,
      targetMarginPercent: 20.0,
      isActive: true,
      companyId: company.id, // This remains an Int based on your Company model
    },
  });

  console.log('✅ Success: Default RateCard is live.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });