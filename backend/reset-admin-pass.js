const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  const hash = await bcrypt.hash('supersecret', 10);

  await prisma.user.update({
    where: { email: 'admin@flowops.com' },
    data: { password: hash },
  });

  console.log('Password reset: admin@flowops.com -> supersecret');
  await prisma.$disconnect();
}

main().catch((e)=>{ console.error(e); process.exit(1); });
