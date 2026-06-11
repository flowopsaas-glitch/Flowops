import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('password123', 10);
  
  const company = await prisma.company.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: 'Alpha Logistics' }
  });

  await prisma.user.upsert({
    where: { email: 'admin@alpha.com' },
    update: { password: hash },
    create: {
      email: 'admin@alpha.com',
      password: hash,
      role: 'ADMIN',
      companyId: company.id
    }
  });

  console.log('✅ DATABASE READY: admin@alpha.com / password123');
}

main().catch(console.error).finally(() => prisma.$disconnect());
