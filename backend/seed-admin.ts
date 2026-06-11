import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // 1. Ensure Company exists
  const company = await prisma.company.upsert({
    where: { id: 1 },
    update: {},
    create: { name: 'FlowOps HQ', isActive: true },
  });

  // 2. Create Admin with hashed password
  const hashedPassword = await bcrypt.hash('password123', 10);
  
  await prisma.user.upsert({
    where: { email: 'admin@flowop.work' },
    update: {},
    create: {
      email: 'admin@flowop.work',
      password: hashedPassword,
      name: 'FlowOps Admin',
      role: 'ADMIN',
      companyId: company.id,
    },
  });

  console.log('✅ Admin user created with hashed password.');
}

main();
