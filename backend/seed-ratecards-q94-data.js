const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.rateCard.findMany({
    orderBy: { id: 'asc' },
  });

  for (const row of rows) {
    if (row.name === 'J/D Fasteners Main Contract') {
      await prisma.rateCard.update({
        where: { id: row.id },
        data: {
          clientName: 'J/D Fasteners Polokwane',
          contractCode: 'Q94',
          billingMode: 'CONTRACT',
          payerSide: 'SENDER',
          notes: 'Primary contract account billed monthly under contract code Q94.',
          aiPricingNote: 'Healthy margin. Watch long-haul surcharge on remote deliveries.',
        },
      });
      console.log('UPDATED: J/D Fasteners Main Contract');
    }

    if (row.name === 'Budget COD Standard') {
      await prisma.rateCard.update({
        where: { id: row.id },
        data: {
          clientName: 'Budget Couriers',
          contractCode: 'COD-STD',
          billingMode: 'COD',
          payerSide: 'RECEIVER',
          notes: 'Standard COD pricing profile with receiver-side charge collection.',
          aiPricingNote: 'Monitor failed delivery retries because COD profitability can drop fast.',
        },
      });
      console.log('UPDATED: Budget COD Standard');
    }

    if (row.name === 'GoGet Prepaid Economy') {
      await prisma.rateCard.update({
        where: { id: row.id },
        data: {
          clientName: 'GoGet Couriers',
          contractCode: 'PP-ECON',
          billingMode: 'PREPAID',
          payerSide: 'SENDER',
          notes: 'Economy prepaid structure for low-cost sender-paid consignments.',
          aiPricingNote: 'Margin is thinner here. Flag heavy volumetric consignments.',
        },
      });
      console.log('UPDATED: GoGet Prepaid Economy');
    }
  }

  const finalRows = await prisma.rateCard.findMany({
    orderBy: { id: 'asc' },
  });

  console.log('');
  console.table(
    finalRows.map((r) => ({
      id: r.id,
      name: r.name,
      clientName: r.clientName,
      contractCode: r.contractCode,
      billingMode: r.billingMode,
      payerSide: r.payerSide,
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
