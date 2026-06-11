// prisma/fix-admin.ts
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const passwordPlain = 'supersecret';
  const passwordHash = await bcrypt.hash(passwordPlain, 10);

  // Ensure company exists
  const company = await prisma.company.upsert({
    where: { name: 'FlowOps Ltd' },
    create: { name: 'FlowOps Ltd' },
    update: {},
  });

  // Force-create / fix admin user
  const admin = await prisma.user.upsert({
    where: { email: 'admin@flowops.com' },
    create: {
      email: 'admin@flowops.com',
      password: passwordHash,
      role: Role.COMPANY_ADMIN,
      companyId: company.id,
    },
    update: {
      password: passwordHash,
      role: Role.COMPANY_ADMIN,
      companyId: company.id,
    },
    select: { id: true, email: true, role: true, companyId: true },
  });

  // Optional: also ensure superadmin exists
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@flowops.com' },
    create: {
      email: 'superadmin@flowops.com',
      password: passwordHash,
      role: Role.SUPER_ADMIN,
      companyId: null,
    },
    update: {
      password: passwordHash,
      role: Role.SUPER_ADMIN,
      companyId: null,
    },
    select: { id: true, email: true, role: true, companyId: true },
  });

  console.log('Fixed users:', { admin, superAdmin });
  console.log('Login password is:', passwordPlain);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });