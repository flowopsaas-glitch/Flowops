// @ts-nocheck
// @ts-nocheck
// NOTE: This file exists for historical reasons. The canonical Prisma seed is `prisma/seed.ts`.
// Keeping this file aligned prevents accidental drift when `src/**` is typechecked.

import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.upsert({
    where: { id: 1 },
    update: { name: 'FlowOps Logistics' },
    create: { id: 1, name: 'FlowOps Logistics' },
  });

  await prisma.user.upsert({
    where: { email: 'admin@flowops.com' },
    update: { companyId: company.id, role: Role.SUPER_ADMIN },
    create: {
      email: 'admin@flowops.com',
      companyId: company.id,
      role: Role.SUPER_ADMIN,
    },
  });

  await prisma.driver.upsert({
    where: { id: 1 },
    update: { companyId: company.id, availabilityStatus: 'AVAILABLE' },
    create: {
      id: 1,
      name: 'Kadi Test Pilot',
      availabilityStatus: 'AVAILABLE',
      companyId: company.id,
      phone: '0821234567',
      zone: 'Gauteng Central',
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
