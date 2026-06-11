// prisma/seed-billing.ts
import { PrismaClient, ServiceLevel, CollectionStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirst({ orderBy: { id: 'asc' } });
  if (!company) throw new Error('No company found');

  const courier = await prisma.courier.upsert({
    where: { companyId_name: { companyId: company.id, name: '3rd Party Courier' } },
    create: { companyId: company.id, name: '3rd Party Courier' },
    update: {},
  });

  const clientA = await prisma.client.upsert({
    where: { companyId_name: { companyId: company.id, name: 'Client A' } },
    create: { companyId: company.id, name: 'Client A' },
    update: {},
  });

  const clientB = await prisma.client.upsert({
    where: { companyId_name: { companyId: company.id, name: 'Client B' } },
    create: { companyId: company.id, name: 'Client B' },
    update: {},
  });

  // Create a few completed collections with pricing
  const now = new Date();
  const deliveredAt = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago

  await prisma.collection.createMany({
    data: [
      {
        companyId: company.id,
        name: `INVTEST-A-${Date.now()}`,
        status: CollectionStatus.COMPLETED,
        createdById: 1,
        clientId: clientA.id,
        courierId: courier.id,
        serviceLevel: ServiceLevel.STANDARD,
        zone: 'Zone 1',
        deliveredAt,
        priceCents: 12000,
      },
      {
        companyId: company.id,
        name: `INVTEST-B-${Date.now() + 1}`,
        status: CollectionStatus.COMPLETED,
        createdById: 1,
        clientId: clientB.id,
        courierId: courier.id,
        serviceLevel: ServiceLevel.EXPRESS,
        zone: 'Zone 2',
        deliveredAt,
        priceCents: 18000,
      },
    ],
  });

  console.log('Billing seed done:', { companyId: company.id, courierId: courier.id });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());