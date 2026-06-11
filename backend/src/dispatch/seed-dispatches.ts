import { PrismaClient, DispatchStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const companyId = 1;

  // Find the first collection to link to
  const collection = await prisma.collection.findFirst({
    where: { companyId },
  });

  if (collection) {
    await prisma.dispatch.create({
      data: {
        companyId,
        collectionId: collection.id,
        driverId: null,
        status: DispatchStatus.ASSIGNED, // 🚀 FIXED: No more 'PENDING'
      },
    });
    console.log(`📦 Dispatch seeded for Collection: ${collection.name}`);
  } else {
    console.log('⚠️  No collections found. Skipping dispatch seed.');
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
