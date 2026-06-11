import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Forcing database seed...');
  
  // 1. Create the Company securely
  const company = await prisma.company.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: 'FlowOps HQ', isActive: true },
  });
  console.log('✅ Company verified:', company.name);

  // 2. Create the Admin User securely
  const user = await prisma.user.upsert({
    where: { email: 'admin@flowop.work' },
    update: {},
    create: {
      email: 'admin@flowop.work',
      password: 'password123', // Your auth service will likely need this raw for testing
      name: 'FlowOps Admin',
      role: 'ADMIN',
      companyId: company.id,
    },
  });
  console.log('✅ Admin user verified:', user.email);
}

main()
  .catch(e => console.error('❌ Error:', e.message))
  .finally(async () => await prisma.$disconnect());
