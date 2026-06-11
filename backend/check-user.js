const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();

  const u = await prisma.user.findUnique({
    where: { email: 'superadmin@example.com' },
    select: { id: true, email: true, role: true, companyId: true, password: true },
  });

  console.log(u);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
