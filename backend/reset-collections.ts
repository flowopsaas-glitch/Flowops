import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔹 Starting collections cleanup/reset...');

  // Delete all collections that have no companyId
  const deletedNull = await prisma.collection.deleteMany({
    where: {
      companyId: null,
    },
  });
  console.log(`✅ Deleted ${deletedNull.count} collection(s) with null companyId.`);

  // Optional: If you want to reset all collections entirely (comment the above and uncomment below)
  // const deletedAll = await prisma.collection.deleteMany({});
  // console.log(`✅ Deleted ${deletedAll.count} collection(s) total.`);

  console.log('🔹 Cleanup/reset complete.');
}

main()
  .catch((e) => {
    console.error('❌ Error during cleanup/reset:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
