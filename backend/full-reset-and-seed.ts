import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Clearing database...');
  await prisma.quote.deleteMany();
  await prisma.collection.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();

  console.log('🏢 Creating companies...');
  const company1 = await prisma.company.create({
    data: { name: 'Alpha Corp' },
  });

  const company2 = await prisma.company.create({
    data: { name: 'Beta Corp' },
  });

  console.log('👤 Creating users...');
  const adminPassword = await bcrypt.hash('password123', 10);
  const userPassword = await bcrypt.hash('password123', 10);

  const adminAlpha = await prisma.user.create({
    data: {
      email: 'admin@alpha.com',
      password: adminPassword,
      role: 'ADMIN',
      companyId: company1.id,
    },
  });

  const userBeta = await prisma.user.create({
    data: {
      email: 'user@beta.com',
      password: userPassword,
      role: 'USER',
      companyId: company2.id,
    },
  });

  console.log('📦 Creating collections...');
  await prisma.collection.createMany({
    data: [
      {
        name: 'Alpha Main Collection',
        status: 'ACTIVE',
        companyId: company1.id,
        createdById: adminAlpha.id,
      },
      {
        name: 'Beta Main Collection',
        status: 'ACTIVE',
        companyId: company2.id,
        createdById: userBeta.id,
      },
    ],
  });

  console.log('✅ Seed complete');
  console.log('➡ admin@alpha.com / password123');
  console.log('➡ user@beta.com / password123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });