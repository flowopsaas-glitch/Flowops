const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();

  const users = await prisma.user.findMany({
    take: 20,
    select: { id: true, email: true, role: true, companyId: true },
    orderBy: { id: 'asc' },
  });

  console.table(users);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
