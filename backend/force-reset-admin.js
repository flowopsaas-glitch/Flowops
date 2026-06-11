const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@flowops.com';
  const password = 'supersecret';
  const hashed = await bcrypt.hash(password, 10);

  let company = await prisma.company.findFirst({
    orderBy: { id: 'asc' },
  });

  if (!company) {
    company = await prisma.company.create({
      data: {
        name: 'FlowOps Tenant',
      },
    });
    console.log(`Created company: ${company.name} (ID ${company.id})`);
  } else {
    console.log(`Using existing company: ${company.name} (ID ${company.id})`);
  }

  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (existing) {
    const updated = await prisma.user.update({
      where: { email },
      data: {
        password: hashed,
        role: 'ADMIN',
        companyId: company.id,
      },
    });

    console.log('');
    console.log('UPDATED USER');
    console.log(updated);
  } else {
    const created = await prisma.user.create({
      data: {
        email,
        password: hashed,
        role: 'ADMIN',
        companyId: company.id,
      },
    });

    console.log('');
    console.log('CREATED USER');
    console.log(created);
  }

  console.log('');
  console.log('LOGIN READY');
  console.log('Email   : admin@flowops.com');
  console.log('Password: supersecret');
}

main()
  .catch((err) => {
    console.error('');
    console.error('RESET FAILED');
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
