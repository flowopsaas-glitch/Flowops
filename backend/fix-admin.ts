import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('password123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@alpha.com' },
    update: { password: hashedPassword },
    create: {
      email: 'admin@alpha.com',
      password: hashedPassword,
      role: 'ADMIN',
      companyId: 1,
    },
  });
  console.log('✅ Admin user updated with password: password123');
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
