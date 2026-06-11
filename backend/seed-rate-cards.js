const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirst({
    orderBy: { id: 'asc' },
  });

  if (!company) {
    throw new Error('No company found.');
  }

  const companyId = company.id;

  const rows = [
    {
      name: 'J/D Fasteners Main Contract',
      isActive: true,
      baseFee: 85,
      perKm: 4.5,
      perKg: 2.25,
      minimumCharge: 85,
      fuelSurchargePercent: 12,
      vatPercent: 15,
      volumetricDivisor: 5000,
      costBase: 52,
      costPerKm: 2.6,
      costPerKg: 1.1,
      targetMarginPercent: 28,
      minimumMarginAmount: 20,
      longHaulThresholdKm: 300,
      longHaulMultiplier: 1.15,
      remoteAreaMultiplier: 1.1,
      afterHoursMultiplier: 1.2,
      companyId,
    },
    {
      name: 'Budget COD Standard',
      isActive: true,
      baseFee: 65,
      perKm: 3.25,
      perKg: 1.75,
      minimumCharge: 65,
      fuelSurchargePercent: 8,
      vatPercent: 15,
      volumetricDivisor: 5000,
      costBase: 40,
      costPerKm: 2.1,
      costPerKg: 0.9,
      targetMarginPercent: 22,
      minimumMarginAmount: 15,
      longHaulThresholdKm: 300,
      longHaulMultiplier: 1.1,
      remoteAreaMultiplier: 1.08,
      afterHoursMultiplier: 1.15,
      companyId,
    },
    {
      name: 'GoGet Prepaid Economy',
      isActive: false,
      baseFee: 49,
      perKm: 2.8,
      perKg: 1.2,
      minimumCharge: 49,
      fuelSurchargePercent: 6,
      vatPercent: 15,
      volumetricDivisor: 5000,
      costBase: 31,
      costPerKm: 1.8,
      costPerKg: 0.7,
      targetMarginPercent: 18,
      minimumMarginAmount: 10,
      longHaulThresholdKm: 300,
      longHaulMultiplier: 1.08,
      remoteAreaMultiplier: 1.05,
      afterHoursMultiplier: 1.1,
      companyId,
    },
  ];

  for (const row of rows) {
    const existing = await prisma.rateCard.findFirst({
      where: {
        companyId,
        name: row.name,
      },
    });

    if (existing) {
      await prisma.rateCard.update({
        where: { id: existing.id },
        data: row,
      });
      console.log(`UPDATED: ${row.name}`);
    } else {
      await prisma.rateCard.create({
        data: row,
      });
      console.log(`CREATED: ${row.name}`);
    }
  }

  const finalRows = await prisma.rateCard.findMany({
    where: { companyId },
    orderBy: { id: 'asc' },
  });

  console.log('');
  console.log('FINAL RATE CARDS');
  console.table(
    finalRows.map((r) => ({
      id: r.id,
      name: r.name,
      active: r.isActive,
      baseFee: r.baseFee,
      perKm: r.perKm,
      perKg: r.perKg,
      minCharge: r.minimumCharge,
      fuel: r.fuelSurchargePercent,
      margin: r.targetMarginPercent,
    }))
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
