import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔹 Starting full collections reset...');

  // 1️⃣ Delete all collections (or use { where: { companyId: null } } to keep linked)
  const deleted = await prisma.collection.deleteMany({});
  console.log(`✅ Deleted ${deleted.count} collection(s).`);

  // 2️⃣ Reset the ID sequence (PostgreSQL only)
  // Adjust 'collection_id_seq' to your actual sequence name if different
  await prisma.$executeRawUnsafe(`
    ALTER SEQUENCE "Collection_id_seq" RESTART WITH 1;
  `);
  console.log('🔹 ID sequence reset to 1.');

  console.log('🔹 Full collections reset complete.');
}

main()
  .catch((e) => {
    console.error('❌ Error during full reset:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
