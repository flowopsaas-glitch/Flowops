import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔹 Starting full database reset...');

  // 1️⃣ Delete all collections
  const deletedCollections = await prisma.collection.deleteMany({});
  console.log(`✅ Deleted ${deletedCollections.count} collection(s).`);

  // 2️⃣ Delete all users
  const deletedUsers = await prisma.user.deleteMany({});
  console.log(`✅ Deleted ${deletedUsers.count} user(s).`);

  // 3️⃣ Delete all companies
  const deletedCompanies = await prisma.company.deleteMany({});
  console.log(`✅ Deleted ${deletedCompanies.count} company(s).`);

  // 4️⃣ Reset sequences (only for numeric IDs)
  const sequences: { table: string; column: string }[] = [
    { table: 'Collection', column: 'id' },
    { table: 'User', column: 'id' },
    { table: 'Company', column: 'id' },
  ];

  for (const seq of sequences) {
    const sequenceName = `${seq.table}_${seq.column}_seq`;
    try {
      await prisma.$executeRawUnsafe(
        `ALTER SEQUENCE "${sequenceName}" RESTART WITH 1;`
      );
      console.log(`🔹 Sequence ${sequenceName} reset.`);
    } catch (e: any) {
      console.log(`⚠️ Sequence ${sequenceName} does not exist, skipping.`);
    }
  }

  console.log('🎉 Full database reset complete.');
}

main()
  .catch((e) => {
    console.error('❌ Error during full reset:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
