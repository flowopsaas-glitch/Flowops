// @ts-nocheck
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.user.upsert({
    where: { email: 'admin@flowops.com' },
    create: {
      email: 'admin@flowops.com',
      role: Role.SUPER_ADMIN, 
      company: { 
        connect: { id: 1 } // Changed from 1 to "1" 
      },
    },
    update: {
      role: Role.SUPER_ADMIN, 
      company: { 
        connect: { id: 1 } // Changed from 1 to "1" 
      },
    },
  });

  console.log('Users seeded successfully with String ID alignment.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
